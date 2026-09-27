import type { Request, Response } from 'express';
import { sequelize } from '../config/database';
import { BudgetAllocation, UserFinanceSetting } from '../models';
import { BUDGET_CATEGORY_IDS, DEFAULT_BUDGET_PLAN, allocationTypeForCategory, budgetCategoryName, spendabilityForCategory, type BudgetPlanItem } from '../constants/budgetPlan';
import { BudgetCycleService } from '../services/budgetCycleService';
import { AppError } from '../utils/errors';
import { jsonSafe } from '../utils/serialize';
import { newId } from '../utils/ids';

const userId = (req: Request) => req.authUser!.id;
const cycles = new BudgetCycleService();
const validPlan = (items: Array<{ categoryId?: string; percentage: number }>) => items.length === BUDGET_CATEGORY_IDS.length
  && new Set(items.map((item) => item.categoryId)).size === BUDGET_CATEGORY_IDS.length
  && BUDGET_CATEGORY_IDS.every((categoryId) => items.some((item) => item.categoryId === categoryId))
  && Math.round(items.reduce((sum, item) => sum + Number(item.percentage), 0) * 100) === 10000;

const serializeItem = (item: BudgetPlanItem) => ({ ...item, name: budgetCategoryName(item.categoryId) });

export async function getFinanceSetting(req: Request, res: Response) {
  const data = await UserFinanceSetting.findByPk(userId(req));
  res.json({ success: true, data: jsonSafe(data) });
}

export async function upsertFinanceSetting(req: Request, res: Response) {
  const [data, created] = await UserFinanceSetting.findOrCreate({
    where: { userId: userId(req) },
    defaults: { ...req.body, userId: userId(req), salaryAmount: String(req.body.salaryAmount) },
  });
  if (!created) {
    const previousSalaryDay = Number(data.salaryDay);
    await data.update({ ...req.body, salaryAmount: String(req.body.salaryAmount) });
    if (Number(data.salaryDay) !== previousSalaryDay) await cycles.rescheduleActiveCycle(userId(req), Number(data.salaryDay));
  }
  res.json({ success: true, data: jsonSafe(data) });
}

export async function getBudgetPlan(req: Request, res: Response) {
  const uid = userId(req);
  const setting = await UserFinanceSetting.findByPk(uid);
  if (!setting) throw new AppError('FINANCE_SETTING_REQUIRED', 'Finance setting must be created first', 409);
  const allocations = await BudgetAllocation.findAll({ where: { userId: uid, active: true } });
  const isConfigured = validPlan(allocations);
  const plan = isConfigured
    ? allocations.map((allocation: any) => ({ categoryId: allocation.categoryId, percentage: Number(allocation.percentage) })).sort((a, b) => BUDGET_CATEGORY_IDS.indexOf(a.categoryId) - BUDGET_CATEGORY_IDS.indexOf(b.categoryId))
    : DEFAULT_BUDGET_PLAN;
  res.json({ success: true, data: jsonSafe({ isConfigured, salaryAmount: Number(setting.salaryAmount), allocations: plan.map(serializeItem) }) });
}

export async function upsertBudgetPlan(req: Request, res: Response) {
  const uid = userId(req);
  const setting = await UserFinanceSetting.findByPk(uid);
  if (!setting) throw new AppError('FINANCE_SETTING_REQUIRED', 'Finance setting must be created first', 409);
  const plan = req.body.allocations as BudgetPlanItem[];
  await sequelize.transaction(async (transaction) => {
    await BudgetAllocation.update({ active: false }, { where: { userId: uid, active: true }, transaction });
    // Read after deactivating: rows loaded with `active: true` would treat the
    // `active: true` below as unchanged and never write it back.
    const existing = await BudgetAllocation.findAll({ where: { userId: uid }, transaction });
    for (const item of plan) {
      const allocation = existing.find((candidate: any) => candidate.categoryId === item.categoryId)
        ?? existing.find((candidate: any) => item.categoryId === 'core.saving' && candidate.allocationType === 'SAVING')
        ?? existing.find((candidate: any) => item.categoryId === 'core.investment' && candidate.allocationType === 'INVESTMENT');
      const values = {
        categoryId: item.categoryId,
        name: budgetCategoryName(item.categoryId),
        allocationType: allocationTypeForCategory(item.categoryId),
        percentage: item.percentage,
        spendability: spendabilityForCategory(item.categoryId),
        active: true,
      };
      if (allocation) await allocation.update(values, { transaction });
      else await BudgetAllocation.create({ id: newId(), userId: uid, ...values }, { transaction });
    }
    await cycles.applyPlanToActiveCycle(uid, transaction);
  });
  res.json({ success: true, data: jsonSafe({ salaryAmount: Number(setting.salaryAmount), allocations: plan.map(serializeItem), effectiveFrom: 'CURRENT_CYCLE' }) });
}

export async function listAllocations(req: Request, res: Response) {
  const data = await BudgetAllocation.findAll({ where: { userId: userId(req) }, order: [['createdAt', 'ASC']] });
  res.json({ success: true, data: jsonSafe(data) });
}

export async function createAllocation(_req: Request, _res: Response) {
  throw new AppError('LEGACY_ALLOCATION_API_DEPRECATED', 'Use PUT /api/finance/budget-plan to save the complete budget plan', 410);
}

export async function updateAllocation(_req: Request, _res: Response) {
  throw new AppError('LEGACY_ALLOCATION_API_DEPRECATED', 'Use PUT /api/finance/budget-plan to save the complete budget plan', 410);
}
