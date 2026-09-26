import { Op, type Transaction as SequelizeTransaction } from 'sequelize';
import { BudgetAllocation, BudgetCycle, BudgetCycleAllocation, UserFinanceSetting } from '../models';
import { BUDGET_CATEGORY_IDS, type BudgetCategoryId } from '../constants/budgetPlan';
import { addDays, currentCycleRange, dateOnly, nextSalaryDate } from '../utils/dates';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

type Snapshot = {
  id: string;
  allocationId: string;
  categoryId: BudgetCategoryId;
  name: string;
  percentage: number;
  amount: string;
  spendability: string;
};

const completePlan = (items: Array<{ categoryId?: string; percentage: number }>) => {
  const categoryIds = items.map((item) => item.categoryId);
  return items.length === BUDGET_CATEGORY_IDS.length
    && new Set(categoryIds).size === BUDGET_CATEGORY_IDS.length
    && BUDGET_CATEGORY_IDS.every((categoryId) => categoryIds.includes(categoryId))
    && Math.round(items.reduce((sum, item) => sum + Number(item.percentage), 0) * 100) === 10000;
};

export class BudgetCycleService {
  async ensureCurrentCycle(userId: string, today = new Date(), transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    if (active) {
      const setting = await this.requireSetting(userId, transaction);
      if (String(active.endDate).slice(0, 10) < dateOnly(today)) {
        await active.update({ endDate: dateOnly(addDays(nextSalaryDate(today, Number(setting.salaryDay)), -1)) }, { transaction });
      }
      this.assertCompleteSnapshot(active.allocations ?? []);
      return active;
    }
    const setting = await this.requireSetting(userId, transaction);
    const range = currentCycleRange(today, Number(setting.salaryDay));
    return this.createCycle(userId, range.startDate, Number(setting.salaryAmount), transaction);
  }

  async findOrCreateForDate(userId: string, date: Date, transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    if (active && dateOnly(date) >= String(active.startDate).slice(0, 10)) {
      this.assertCompleteSnapshot(active.allocations ?? []);
      return active;
    }
    if (!active) return this.ensureCurrentCycle(userId, date, transaction);
    const historical = await BudgetCycle.findOne({
      where: { userId, startDate: { [Op.lte]: dateOnly(date) }, endDate: { [Op.gte]: dateOnly(date) } },
      include: [{ model: BudgetCycleAllocation, as: 'allocations' }],
      order: [['startDate', 'DESC']],
      transaction,
    });
    if (!historical) throw new AppError('BUDGET_CYCLE_NOT_FOUND', 'No budget cycle exists for this transaction date', 409);
    this.assertCompleteSnapshot(historical.allocations ?? []);
    return historical;
  }

  async startCycleFromSalary(userId: string, salaryDate: Date, salaryAmount: number, transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    const startDate = dateOnly(salaryDate);
    if (active && String(active.startDate).slice(0, 10) === startDate) {
      await this.rebalanceCycle(active, salaryAmount, transaction);
      return BudgetCycle.findByPk(active.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
    }
    if (active) {
      if (startDate < String(active.startDate).slice(0, 10)) throw new AppError('INVALID_SALARY_DATE', 'Salary date cannot precede the active budget cycle', 400);
      await active.update({ status: 'CLOSED', endDate: dateOnly(addDays(salaryDate, -1)) }, { transaction });
    }
    return this.createCycle(userId, salaryDate, salaryAmount, transaction);
  }

  async addAdditionalIncome(budgetCycleId: string, amount: number, transaction?: SequelizeTransaction) {
    const cycle = await BudgetCycle.findByPk(budgetCycleId, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
    if (!cycle) throw new AppError('BUDGET_CYCLE_NOT_FOUND', 'Budget cycle not found', 404);
    await this.rebalanceCycle(cycle, Number(cycle.salarySnapshot) + amount, transaction);
    return BudgetCycle.findByPk(cycle.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
  }

  async reverseAdditionalIncome(budgetCycleId: string, amount: number, transaction?: SequelizeTransaction) {
    const cycle = await BudgetCycle.findByPk(budgetCycleId, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
    if (!cycle) throw new AppError('BUDGET_CYCLE_NOT_FOUND', 'Budget cycle not found', 404);
    const nextSalaryAmount = Number(cycle.salarySnapshot) - amount;
    if (nextSalaryAmount < 0) throw new AppError('INVALID_INCOME_REVERSAL', 'Income reversal cannot make the cycle budget negative', 400);
    await this.rebalanceCycle(cycle, nextSalaryAmount, transaction);
    return BudgetCycle.findByPk(cycle.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
  }

  async upgradeLegacyActiveCycle(userId: string, transaction?: SequelizeTransaction) {
    const cycle = await this.findActiveCycle(userId, transaction);
    if (!cycle || completePlan(cycle.allocations ?? [])) return cycle;
    const allocations = await BudgetAllocation.findAll({ where: { userId, active: true }, transaction });
    if (!completePlan(allocations)) return cycle;
    const snapshot = this.createSnapshot(Number(cycle.salarySnapshot), allocations);
    const totals = this.snapshotTotals(snapshot);
    await cycle.update({
      plannedSavingAmount: String(totals.saving),
      plannedInvestmentAmount: String(totals.investment),
      plannedFlexibleAmount: String(totals.dailySpendable),
      plannedReservedAmount: String(totals.fixedExpense),
    }, { transaction });
    await BudgetCycleAllocation.destroy({ where: { budgetCycleId: cycle.id }, transaction });
    await BudgetCycleAllocation.bulkCreate(snapshot.map((item) => ({ ...item, budgetCycleId: cycle.id })), { transaction });
    return BudgetCycle.findByPk(cycle.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
  }

  private async createCycle(userId: string, start: Date, salaryAmount: number, transaction?: SequelizeTransaction) {
    const setting = await this.requireSetting(userId, transaction);
    const allocations = await BudgetAllocation.findAll({ where: { userId, active: true }, transaction });
    if (!completePlan(allocations)) throw new AppError('BUDGET_PLAN_REQUIRED', 'A complete 12-item budget plan must be saved before a budget cycle can start', 409);
    const snapshot = this.createSnapshot(salaryAmount, allocations);
    const totals = this.snapshotTotals(snapshot);
    const cycle = await BudgetCycle.create({
      id: newId(),
      userId,
      startDate: dateOnly(start),
      endDate: dateOnly(addDays(nextSalaryDate(start, Number(setting.salaryDay)), -1)),
      salarySnapshot: String(salaryAmount),
      plannedSavingAmount: String(totals.saving),
      plannedInvestmentAmount: String(totals.investment),
      plannedFlexibleAmount: String(totals.dailySpendable),
      plannedReservedAmount: String(totals.fixedExpense),
      status: 'ACTIVE',
    }, { transaction });
    await BudgetCycleAllocation.bulkCreate(snapshot.map((item) => ({ ...item, budgetCycleId: cycle.id })), { transaction });
    return BudgetCycle.findByPk(cycle.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
  }

  private async rebalanceCycle(cycle: any, salaryAmount: number, transaction?: SequelizeTransaction) {
    const allocations = cycle.allocations ?? await BudgetCycleAllocation.findAll({ where: { budgetCycleId: cycle.id }, transaction });
    this.assertCompleteSnapshot(allocations);
    const amounts = this.amountsFor(salaryAmount, allocations);
    const totals = this.snapshotTotals(amounts);
    await cycle.update({
      salarySnapshot: String(salaryAmount),
      plannedSavingAmount: String(totals.saving),
      plannedInvestmentAmount: String(totals.investment),
      plannedFlexibleAmount: String(totals.dailySpendable),
      plannedReservedAmount: String(totals.fixedExpense),
    }, { transaction });
    await Promise.all(amounts.map((allocation) => BudgetCycleAllocation.update({ amount: allocation.amount }, { where: { id: allocation.id }, transaction })));
  }

  private createSnapshot(salaryAmount: number, allocations: any[]): Snapshot[] {
    return this.amountsFor(salaryAmount, allocations).map((allocation: any) => ({
      id: newId(),
      allocationId: allocation.id,
      categoryId: allocation.categoryId,
      name: allocation.name,
      percentage: Number(allocation.percentage),
      amount: allocation.amount,
      spendability: allocation.spendability,
    }));
  }

  private amountsFor(salaryAmount: number, allocations: any[]) {
    const rows = allocations.map((allocation: any) => {
      const values = typeof allocation.toJSON === 'function' ? allocation.toJSON() : allocation;
      return { ...values, amount: Math.floor(salaryAmount * Number(values.percentage) / 100) };
    });
    const roundingTarget = rows.find((allocation) => allocation.categoryId === 'core.expense.other') ?? rows[rows.length - 1];
    if (roundingTarget) roundingTarget.amount += salaryAmount - rows.reduce((sum, allocation) => sum + allocation.amount, 0);
    return rows.map((allocation) => ({ ...allocation, amount: String(allocation.amount) }));
  }

  private snapshotTotals(snapshot: Array<{ categoryId: string; amount: string }>) {
    const amountFor = (categoryId: string) => Number(snapshot.find((allocation) => allocation.categoryId === categoryId)?.amount ?? 0);
    const expenseAmount = BUDGET_CATEGORY_IDS.filter((categoryId) => categoryId.startsWith('core.expense.')).reduce((sum, categoryId) => sum + amountFor(categoryId), 0);
    return {
      saving: amountFor('core.saving'),
      investment: amountFor('core.investment'),
      fixedExpense: amountFor('core.expense.fixed'),
      dailySpendable: expenseAmount - amountFor('core.expense.fixed'),
    };
  }

  private async findActiveCycle(userId: string, transaction?: SequelizeTransaction) {
    return BudgetCycle.findOne({ where: { userId, status: 'ACTIVE' }, include: [{ model: BudgetCycleAllocation, as: 'allocations' }], order: [['startDate', 'DESC']], transaction });
  }

  private async requireSetting(userId: string, transaction?: SequelizeTransaction) {
    const setting = await UserFinanceSetting.findByPk(userId, { transaction });
    if (!setting) throw new AppError('FINANCE_SETTING_REQUIRED', 'Finance setting must be created first', 409);
    return setting;
  }

  private assertCompleteSnapshot(snapshot: Array<{ categoryId?: string; percentage: number }>) {
    if (!completePlan(snapshot)) throw new AppError('BUDGET_PLAN_REQUIRED', 'This budget cycle uses a legacy plan. Save the complete 12-item budget plan before continuing.', 409);
  }
}
