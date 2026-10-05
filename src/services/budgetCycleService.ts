import { Op, type Transaction as SequelizeTransaction } from 'sequelize';
import { BudgetAllocation, BudgetCycle, BudgetCycleAllocation, Category, Transaction, UserFinanceSetting } from '../models';
import { BUDGET_CATEGORY_IDS, type BudgetCategoryId } from '../constants/budgetPlan';
import { CATEGORY_IDS } from '../constants/categoryCatalog';
import { sequelize } from '../config/database';
import { addDays, currentCycleRange, dateOnly, nextSalaryDate, parseDateOnly } from '../utils/dates';
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

export const isSalaryCategory = (category: any) => category?.id === CATEGORY_IDS.INCOME_SALARY || category?.sourceCategoryId === CATEGORY_IDS.INCOME_SALARY;

export class BudgetCycleService {
  // `clock` is the real "now"; rollover never runs past it, so a report range
  // that passes a future date in as `today` cannot open a future cycle.
  constructor(private readonly clock: () => Date = () => new Date()) {}

  // An ACTIVE cycle's endDate is its projected end (the day before the next
  // expected payday). The first request after that day rolls it over: it is
  // closed as-is and the next cycle starts from the saved salary and plan, so
  // no salary entry is needed each month. A real salary still restarts it.
  async ensureCurrentCycle(userId: string, today = new Date(), transaction?: SequelizeTransaction) {
    const cycle = await this.currentCycle(userId, today, transaction);
    this.assertCompleteSnapshot(cycle.allocations ?? []);
    return cycle;
  }

  // Rolls an overdue ACTIVE cycle forward without creating a first one.
  async rollOverActiveCycle(userId: string, today = new Date(), transaction?: SequelizeTransaction) {
    return this.withSettingLock(userId, transaction, (locked, setting) => this.rollOver(userId, setting, this.rolloverDate(today), locked));
  }

  async findOrCreateForDate(userId: string, date: Date, transaction?: SequelizeTransaction) {
    if (!await this.findActiveCycle(userId, transaction)) return this.ensureCurrentCycle(userId, date, transaction);
    const active = await this.ensureCurrentCycle(userId, this.clock(), transaction);
    if (dateOnly(date) >= String(active.startDate).slice(0, 10)) return active;
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

  // `salaryTransactionId` is the salary row being edited, if any, so it is not
  // counted as additional income while its old values are still stored.
  async startCycleFromSalary(userId: string, salaryDate: Date, salaryAmount: number, transaction?: SequelizeTransaction, salaryTransactionId?: string) {
    const active = await this.findActiveCycle(userId, transaction);
    const startDate = dateOnly(salaryDate);
    if (active && String(active.startDate).slice(0, 10) === startDate) {
      // Same start date means re-entering this cycle's salary (startDate is
      // unique per user); additional income already added to it must stay.
      const additional = await this.additionalIncomeAmount(active.id, salaryTransactionId, transaction);
      await this.rebalanceCycle(active, salaryAmount + additional, transaction);
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

  // Re-snapshots the ACTIVE cycle from the saved plan so a plan change applies
  // immediately. The distributable total stays `salarySnapshot` (salary plus
  // any additional income already added), so only the percentages and the
  // per-category limits change - dates, salary and transactions are untouched.
  // An overdue cycle rolls over first so a closed cycle is never re-budgeted,
  // and with no cycle yet (onboarding) the first one starts from this plan.
  async applyPlanToActiveCycle(userId: string, transaction?: SequelizeTransaction) {
    const cycle = await this.currentCycle(userId, this.clock(), transaction);
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

  // A salaryAmount change re-budgets the ACTIVE cycle from the new salary;
  // additional income already added to it stays on top. Transactions,
  // percentages and dates are untouched.
  async applySalaryToActiveCycle(userId: string, salaryAmount: number, transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    if (!active || !completePlan(active.allocations ?? [])) return active;
    const additional = await this.additionalIncomeAmount(active.id, undefined, transaction);
    await this.rebalanceCycle(active, salaryAmount + additional, transaction);
    return BudgetCycle.findByPk(active.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }], transaction });
  }

  // A salaryDay change moves the ACTIVE cycle's projected end to the day
  // before the next payday under the new setting. The cycle stays ACTIVE.
  async rescheduleActiveCycle(userId: string, salaryDay: number, today = new Date(), transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    if (!active) return null;
    return active.update({ endDate: dateOnly(addDays(nextSalaryDate(today, salaryDay), -1)) }, { transaction });
  }

  private async currentCycle(userId: string, today: Date, transaction?: SequelizeTransaction) {
    const active = await this.findActiveCycle(userId, transaction);
    if (active && !this.isOverdue(active, this.rolloverDate(today))) return active;
    return this.withSettingLock(userId, transaction, async (locked, setting) => {
      const current = await this.rollOver(userId, setting, this.rolloverDate(today), locked);
      if (current) return current;
      const range = currentCycleRange(today, Number(setting.salaryDay));
      return this.createCycle(userId, range.startDate, Number(setting.salaryAmount), locked);
    });
  }

  // Closes each overdue ACTIVE cycle at its projected end and starts the next
  // one the day after. Without a salary amount or a complete plan nothing can
  // be budgeted, so the cycle stays ACTIVE and Home shows it as overdue.
  private async rollOver(userId: string, setting: any, until: Date, transaction: SequelizeTransaction) {
    let active = await this.findActiveCycle(userId, transaction);
    if (!active || !this.isOverdue(active, until)) return active;
    const salaryAmount = Number(setting.salaryAmount);
    const plan = await BudgetAllocation.findAll({ where: { userId, active: true }, transaction });
    if (!(salaryAmount > 0) || !completePlan(plan)) return active;
    while (active && this.isOverdue(active, until)) {
      const nextStart = addDays(parseDateOnly(String(active.endDate).slice(0, 10)), 1);
      await active.update({ status: 'CLOSED' }, { transaction });
      const next = await this.createCycle(userId, nextStart, salaryAmount, transaction);
      active = await this.carryOverTransactions(active, next!, transaction);
    }
    return active;
  }

  // Transactions recorded while the old cycle ran past its projected end
  // belong to the new one; additional income among them moves with them.
  private async carryOverTransactions(from: any, to: any, transaction: SequelizeTransaction) {
    const moved = await Transaction.findAll({
      where: { budgetCycleId: from.id, occurredAt: { [Op.gte]: String(to.startDate).slice(0, 10) } },
      include: [{ model: Category, as: 'category' }],
      transaction,
    });
    if (moved.length === 0) return to;
    await Transaction.update({ budgetCycleId: to.id }, { where: { id: moved.map((item: any) => item.id) }, transaction });
    const income = moved
      .filter((item: any) => item.type === 'INCOME' && item.status === 'CONFIRMED' && !isSalaryCategory(item.category))
      .reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    if (income === 0) return to;
    if (completePlan(from.allocations ?? [])) await this.reverseAdditionalIncome(from.id, income, transaction);
    return this.addAdditionalIncome(to.id, income, transaction);
  }

  // Serializes cycle creation per user on their finance setting row, so
  // concurrent first requests after payday create the new cycle only once
  // (the unique (userId, startDate) index backs this up).
  private async withSettingLock<T>(userId: string, transaction: SequelizeTransaction | undefined, work: (locked: SequelizeTransaction, setting: any) => Promise<T>) {
    const run = async (locked: SequelizeTransaction) => {
      const setting = await UserFinanceSetting.findByPk(userId, { transaction: locked, lock: true });
      if (!setting) throw new AppError('FINANCE_SETTING_REQUIRED', 'Finance setting must be created first', 409);
      return work(locked, setting);
    };
    return transaction ? run(transaction) : sequelize.transaction(run);
  }

  private rolloverDate(today: Date) {
    const now = this.clock();
    return today > now ? now : today;
  }

  private isOverdue(cycle: any, today: Date) {
    return dateOnly(today) > String(cycle.endDate).slice(0, 10);
  }

  // Confirmed non-salary income recorded in the cycle - the part of
  // `salarySnapshot` that sits on top of the saved salary.
  async additionalIncomeAmount(budgetCycleId: string, excludeTransactionId?: string, transaction?: SequelizeTransaction) {
    const incomes = await Transaction.findAll({
      where: { budgetCycleId, type: 'INCOME', status: 'CONFIRMED', ...(excludeTransactionId ? { id: { [Op.ne]: excludeTransactionId } } : {}) },
      include: [{ model: Category, as: 'category' }],
      transaction,
    });
    return incomes.filter((income: any) => !isSalaryCategory(income.category)).reduce((sum: number, income: any) => sum + Number(income.amount), 0);
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
