import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { BudgetCycleService } from '../services/budgetCycleService';
import { CATEGORY_IDS } from '../constants/categoryCatalog';
import { Category, Transaction } from '../models';
import { parseDateOnly, dateOnly } from '../utils/dates';
import { AppError } from '../utils/errors';
import { jsonSafe } from '../utils/serialize';
import { newId } from '../utils/ids';
import { assertTransactionCategory } from '../services/transactionCategoryLookup';

const cycleService = new BudgetCycleService();
const uid = (req: Request) => req.authUser!.id;
const ownedCategory = (categoryId: string, userId: string, transaction?: any) => Category.findOne({ where: { id: categoryId, isActive: true, [Op.or]: [{ ownerUserId: userId }, { ownerUserId: null }] }, transaction });
const isSalaryCategory = (category: any) => category?.id === CATEGORY_IDS.INCOME_SALARY || category?.sourceCategoryId === CATEGORY_IDS.INCOME_SALARY;
const confirmedIncome = (data: any, category: any) => data.type === 'INCOME' && data.status === 'CONFIRMED';
const additionalIncome = (data: any, category: any) => confirmedIncome(data, category) && !isSalaryCategory(category);
// Columns listTransactions is allowed to sort by (query-string controlled,
// so this must stay a fixed whitelist rather than interpolating q.sort
// directly into the ORDER BY clause).
const SORTABLE_COLUMNS = new Set(['occurredAt', 'consumptionEvaluationUpdatedAt', 'createdAt']);
const serializeTransaction = (transaction: any) => ({ ...transaction.toJSON(), effectiveAmount: Math.max(0, Number(transaction.amount) - Number(transaction.refundedAmount ?? 0)) });

async function requireCategory(categoryId: string, userId: string, transaction?: any) {
  const category = await ownedCategory(categoryId, userId, transaction);
  if (!category) throw new AppError('INVALID_CATEGORY', 'Category not found', 400);
  return category;
}

function validateType(category: any, type: string) {
  if (category.type !== type) throw new AppError('INVALID_CATEGORY', 'Transaction type must match the category type', 400);
}

export async function createTransaction(req: Request, res: Response) {
  // A new transaction must land on a leaf (소분류), never directly on a 대분류.
  await assertTransactionCategory(req.body.categoryId, uid(req));
  const data = await sequelize.transaction(async (transaction) => {
    const category = await requireCategory(req.body.categoryId, uid(req), transaction);
    validateType(category, req.body.type);
    const occurredAt = parseDateOnly(req.body.occurredAt);
    const status = req.body.status ?? 'CONFIRMED';
    const salaryIncome = req.body.type === 'INCOME' && status === 'CONFIRMED' && isSalaryCategory(category);
    const cycle = salaryIncome
      ? await cycleService.startCycleFromSalary(uid(req), occurredAt, Number(req.body.amount), transaction)
      : await cycleService.findOrCreateForDate(uid(req), occurredAt, transaction);
    const created = await Transaction.create({ ...req.body, id: newId(), userId: uid(req), budgetCycleId: cycle!.id, amount: String(req.body.amount), refundedAmount: '0', occurredAt: req.body.occurredAt, userEdited: true, ...(req.body.consumptionEvaluation ? { consumptionEvaluationUpdatedAt: new Date() } : {}) }, { transaction });
    if (additionalIncome({ ...req.body, status }, category)) await cycleService.addAdditionalIncome(cycle!.id, Number(req.body.amount), transaction);
    return created;
  });
  res.status(201).json({ success: true, data: jsonSafe(serializeTransaction(data)) });
}

export async function listTransactions(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>; const page = Math.max(1, Number(q.page ?? 1)); const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50)));
  // `evaluation` accepts a comma-separated list, e.g. evaluation=REGRETTABLE,BAD
  const evaluations = q.evaluation ? q.evaluation.split(',').map((v) => v.trim()).filter(Boolean) : undefined;
  const where: any = { userId: uid(req), ...(q.categoryId ? { categoryId: q.categoryId } : {}), ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}), ...(evaluations && evaluations.length ? { consumptionEvaluation: { [Op.in]: evaluations } } : {}) };
  if (q.startDate || q.endDate) where.occurredAt = { ...(q.startDate ? { [Op.gte]: q.startDate } : {}), ...(q.endDate ? { [Op.lte]: q.endDate } : {}) };
  const sortColumn = q.sort && SORTABLE_COLUMNS.has(q.sort) ? q.sort : 'occurredAt';
  const sortOrder = q.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const [data, total] = await Promise.all([Transaction.findAll({ where, include: [{ model: Category, as: 'category' }], order: [[sortColumn, sortOrder]], offset: (page - 1) * limit, limit }), Transaction.count({ where })]);
  res.json({ success: true, data: { items: jsonSafe(data.map(serializeTransaction)), page, limit, total } });
}

export async function getTransaction(req: Request, res: Response) {
  const data = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) }, include: [{ model: Category, as: 'category' }] });
  if (!data) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
  res.json({ success: true, data: jsonSafe(serializeTransaction(data)) });
}

export async function updateTransaction(req: Request, res: Response) {
  const data = await sequelize.transaction(async (transaction) => {
    const item = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) }, include: [{ model: Category, as: 'category' }], transaction });
    if (!item) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    const previous = item.toJSON(); const previousCategory = item.category;
    // Passing the transaction's current categoryId keeps a legacy row that sits on a 대분류 editable; only a *change* must land on a leaf.
    if (req.body.categoryId) await assertTransactionCategory(req.body.categoryId, uid(req), previous.categoryId);
    // Only bump consumptionEvaluationUpdatedAt when the evaluation actually
    // changes value - the edit screen always resends the current evaluation
    // alongside unrelated field edits (amount, memo, ...), and those must not
    // be mistaken for a fresh "아쉬운 소비" evaluation moment.
    const evaluationChanged = req.body.consumptionEvaluation !== undefined && req.body.consumptionEvaluation !== previous.consumptionEvaluation;
    const category = req.body.categoryId ? await requireCategory(req.body.categoryId, uid(req), transaction) : previousCategory;
    validateType(category, req.body.type ?? previous.type);
    if (additionalIncome(previous, previousCategory)) await cycleService.reverseAdditionalIncome(previous.budgetCycleId, Number(previous.amount), transaction);
    const next = { ...previous, ...req.body, status: req.body.status ?? previous.status, type: req.body.type ?? previous.type, amount: req.body.amount === undefined ? Number(previous.amount) : Number(req.body.amount), occurredAt: req.body.occurredAt ?? previous.occurredAt };
    const occurredAt = parseDateOnly(String(next.occurredAt));
    const salaryIncome = confirmedIncome(next, category) && isSalaryCategory(category);
    const cycle = salaryIncome
      ? await cycleService.startCycleFromSalary(uid(req), occurredAt, next.amount, transaction)
      : await cycleService.findOrCreateForDate(uid(req), occurredAt, transaction);
    const updated = await item.update({ ...req.body, budgetCycleId: cycle!.id, ...(req.body.amount !== undefined ? { amount: String(req.body.amount) } : {}), ...(req.body.occurredAt ? { occurredAt: dateOnly(occurredAt) } : {}), ...(evaluationChanged ? { consumptionEvaluationUpdatedAt: req.body.consumptionEvaluation ? new Date() : null } : {}), userEdited: true }, { transaction });
    if (additionalIncome(next, category)) await cycleService.addAdditionalIncome(cycle!.id, next.amount, transaction);
    return updated;
  });
  res.json({ success: true, data: jsonSafe(serializeTransaction(data)) });
}

export async function deleteTransaction(req: Request, res: Response) {
  await sequelize.transaction(async (transaction) => {
    const item = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) }, include: [{ model: Category, as: 'category' }], transaction });
    if (!item) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    if (additionalIncome(item.toJSON(), item.category)) await cycleService.reverseAdditionalIncome(item.budgetCycleId, Number(item.amount), transaction);
    await item.destroy({ transaction });
  });
  res.json({ success: true, data: { deleted: true } });
}

export async function addRefund(req: Request, res: Response) {
  const data = await sequelize.transaction(async (transaction) => {
    const item = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) }, transaction });
    if (!item) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    if (item.type !== 'EXPENSE') throw new AppError('INVALID_REFUND', 'Refunds can only be recorded for expense transactions', 400);
    const nextRefundedAmount = Number(item.refundedAmount ?? 0) + Number(req.body.amount);
    if (nextRefundedAmount > Number(item.amount)) throw new AppError('REFUND_EXCEEDS_EXPENSE', 'Refund amount cannot exceed the original expense amount', 400);
    return item.update({ refundedAmount: String(nextRefundedAmount), userEdited: true }, { transaction });
  });
  res.json({ success: true, data: jsonSafe(serializeTransaction(data)) });
}
