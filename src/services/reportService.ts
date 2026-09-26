import { Op } from 'sequelize';
import { BudgetCycleService } from './budgetCycleService';
import { DailyBudgetService } from './dailyBudgetService';
import { BudgetCycleAllocation, Category, Transaction } from '../models';
import { budgetCategoryName } from '../constants/budgetPlan';
import { addDays, dateOnly, parseDateOnly } from '../utils/dates';

const asDate = (value: string | Date) => value instanceof Date ? value : parseDateOnly(String(value).slice(0, 10));
const asDateKey = (value: string | Date) => value instanceof Date ? dateOnly(value) : String(value).slice(0, 10);
const effectiveAmount = (transaction: any) => Math.max(0, Number(transaction.amount) - Number(transaction.refundedAmount ?? 0));

export class ReportService {
  private daily = new DailyBudgetService();
  private cycles = new BudgetCycleService();

  async context(userId: string, today = new Date()) {
    const cycle = await this.cycles.ensureCurrentCycle(userId, today);
    const transactions = await Transaction.findAll({
      where: { userId, occurredAt: { [Op.gte]: dateOnly(asDate(cycle.startDate)), [Op.lte]: dateOnly(asDate(cycle.endDate)) } },
      include: [{ model: Category, as: 'category' }],
    });
    const categoryMap = await this.categoryMap(userId);
    const budgetTransactions = transactions.map((transaction: any) => ({
      amount: Number(transaction.amount),
      refundedAmount: Number(transaction.refundedAmount ?? 0),
      type: transaction.type,
      status: transaction.status,
      occurredAt: asDate(transaction.occurredAt),
      budgetCategoryId: this.rootCategoryId(transaction.categoryId, categoryMap),
    }));
    const allocations = (cycle.allocations ?? []).map((allocation: any) => ({ categoryId: allocation.categoryId, amount: Number(allocation.amount) }));
    const result = this.daily.calculate({
      today,
      cycleStart: asDate(cycle.startDate),
      cycleEnd: asDate(cycle.endDate),
      salaryAmount: Number(cycle.salarySnapshot),
      allocations,
      transactions: budgetTransactions,
    });
    return { cycle, transactions, result };
  }

  async summary(userId: string, start?: string, end?: string) {
    const context = await this.context(userId, end ? parseDateOnly(end) : new Date());
    const where: any = { userId, status: 'CONFIRMED' };
    where.occurredAt = start || end ? { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) } : { [Op.gte]: dateOnly(asDate(context.cycle.startDate)), [Op.lte]: dateOnly(asDate(context.cycle.endDate)) };
    const transactions = await Transaction.findAll({ where, include: [{ model: Category, as: 'category' }] });
    const total = (type: string) => transactions.filter((transaction: any) => transaction.type === type).reduce((sum, transaction: any) => sum + effectiveAmount(transaction), 0);
    return {
      income: total('INCOME'),
      expense: total('EXPENSE'),
      saving: transactions.filter((transaction: any) => transaction.type === 'SAVING' && transaction.category?.purposeType === 'SAVING').reduce((sum: number, transaction: any) => sum + effectiveAmount(transaction), 0),
      investment: transactions.filter((transaction: any) => transaction.type === 'SAVING' && transaction.category?.purposeType === 'INVESTMENT').reduce((sum: number, transaction: any) => sum + effectiveAmount(transaction), 0),
      remainingAvailableAmount: context.result.remainingUsableAmount,
    };
  }

  async dailyReport(userId: string, start?: string, end?: string) {
    const context = await this.context(userId, end ? parseDateOnly(end) : new Date());
    const from = start ? parseDateOnly(start) : asDate(context.cycle.startDate);
    const to = end ? parseDateOnly(end) : asDate(context.cycle.endDate);
    const transactions = await Transaction.findAll({ where: { userId, status: 'CONFIRMED', type: { [Op.in]: ['INCOME', 'EXPENSE'] }, occurredAt: { [Op.gte]: dateOnly(from), [Op.lte]: dateOnly(to) } } });
    const incomeByDate = new Map<string, number>(); const expenseByDate = new Map<string, number>();
    for (const transaction of transactions as any[]) {
      const key = asDateKey(transaction.occurredAt); const target = transaction.type === 'INCOME' ? incomeByDate : expenseByDate;
      target.set(key, (target.get(key) ?? 0) + effectiveAmount(transaction));
    }
    const rows = []; const dailyRecommended = context.result.usableBudgetAmount ? Math.floor(context.result.usableBudgetAmount / context.result.cycleDays) : 0;
    let noSpendDays = 0; let noActivityDays = 0; let totalIncome = 0; let totalExpense = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const key = dateOnly(date); const income = incomeByDate.get(key) ?? 0; const expense = expenseByDate.get(key) ?? 0;
      if (expense === 0) noSpendDays++; if (income === 0 && expense === 0) noActivityDays++;
      totalIncome += income; totalExpense += expense;
      rows.push({ date: key, income, expense, spent: expense, recommended: dailyRecommended, difference: expense - dailyRecommended });
    }
    return { period: { startDate: dateOnly(from), endDate: dateOnly(to) }, summary: { totalIncome, totalExpense, noSpendDays, noActivityDays }, daily: rows };
  }

  async monthly(userId: string) {
    const transactions = await Transaction.findAll({ where: { userId, status: 'CONFIRMED' }, include: [{ model: Category, as: 'category' }] });
    const byMonth = new Map<string, { income: number; expense: number; saving: number; investment: number }>();
    for (const transaction of transactions as any[]) {
      const key = asDateKey(transaction.occurredAt).slice(0, 7); const row = byMonth.get(key) ?? { income: 0, expense: 0, saving: 0, investment: 0 };
      if (transaction.type === 'INCOME') row.income += effectiveAmount(transaction);
      else if (transaction.type === 'EXPENSE') row.expense += effectiveAmount(transaction);
      else if (transaction.category?.purposeType === 'INVESTMENT') row.investment += effectiveAmount(transaction);
      else row.saving += effectiveAmount(transaction);
      byMonth.set(key, row);
    }
    return [...byMonth.entries()].sort().map(([month, values]) => ({ month, ...values }));
  }

  async categories(userId: string, start?: string, end?: string) {
    const where: any = { userId, status: 'CONFIRMED', type: 'EXPENSE' };
    if (start || end) where.occurredAt = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    const [transactions, categoryMap] = await Promise.all([Transaction.findAll({ where }), this.categoryMap(userId)]);
    const map = new Map<string, { amount: number; transactionCount: number }>();
    for (const transaction of transactions as any[]) {
      const categoryId = this.rootCategoryId(transaction.categoryId, categoryMap) ?? 'core.expense.other';
      const row = map.get(categoryId) ?? { amount: 0, transactionCount: 0 };
      row.amount += effectiveAmount(transaction); row.transactionCount++; map.set(categoryId, row);
    }
    const total = [...map.values()].reduce((sum, row) => sum + row.amount, 0);
    return [...map.entries()].map(([categoryId, values]) => ({ categoryId, category: budgetCategoryName(categoryId), ...values, percentage: total ? values.amount / total * 100 : 0 }));
  }

  async budget(userId: string) {
    const context = await this.context(userId);
    const percentageByCategory = new Map((context.cycle.allocations ?? []).map((allocation: any) => [allocation.categoryId, Number(allocation.percentage)]));
    return {
      cycle: { startDate: context.cycle.startDate, endDate: context.cycle.endDate, salaryAmount: Number(context.cycle.salarySnapshot) },
      categories: context.result.categoryProgress.map((progress) => ({ ...progress, name: budgetCategoryName(progress.categoryId), percentage: percentageByCategory.get(progress.categoryId) ?? 0 })),
      saving: { plannedAmount: context.result.savingBudgetAmount, percentage: percentageByCategory.get('core.saving') ?? 0 },
      investment: { plannedAmount: context.result.investmentBudgetAmount, percentage: percentageByCategory.get('core.investment') ?? 0 },
    };
  }

  async pace(userId: string) {
    const context = await this.context(userId);
    return { current: { cycleStart: context.cycle.startDate, cycleEnd: context.cycle.endDate, ...context.result }, previous: null };
  }

  private async categoryMap(userId: string) {
    const categories = await Category.findAll({ where: { [Op.or]: [{ ownerUserId: null }, { ownerUserId: userId }] } });
    return new Map(categories.map((category: any) => [category.id, category.toJSON()]));
  }

  private rootCategoryId(categoryId: string, categories: Map<string, any>) {
    let current = categories.get(categoryId);
    const seen = new Set<string>();
    while (current?.parentCategoryId && !seen.has(current.id)) {
      seen.add(current.id);
      current = categories.get(current.parentCategoryId);
    }
    return current?.id;
  }
}
