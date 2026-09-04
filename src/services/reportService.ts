import { Op } from 'sequelize';
import { BudgetCycleService } from './budgetCycleService';
import { DailyBudgetService } from './dailyBudgetService';
import { FixedExpenseService } from './fixedExpenseService';
import { BudgetCycle, Category, Transaction } from '../models';
import { addDays, dateOnly, parseDateOnly } from '../utils/dates';

const asDate = (value: string | Date) => value instanceof Date ? value : parseDateOnly(String(value).slice(0, 10));
const asDateKey = (value: string | Date) => value instanceof Date ? dateOnly(value) : String(value).slice(0, 10);

export class ReportService {
  private daily = new DailyBudgetService(); private cycles = new BudgetCycleService(); private fixed = new FixedExpenseService();

  async context(userId: string, today = new Date()) {
    const cycle = await this.cycles.ensureCurrentCycle(userId, today);
    const transactions = await Transaction.findAll({ where: { userId, occurredAt: { [Op.gte]: dateOnly(asDate(cycle.startDate)), [Op.lte]: dateOnly(asDate(cycle.endDate)) } }, include: [{ model: Category, as: 'category' }] });
    const allocations = (cycle?.allocations ?? []).map((allocation: any) => ({ amount: Number(allocation.amount), spendability: allocation.spendability }));
    const reserved = await this.fixed.reservedAmount(userId, today, asDate(cycle.endDate));
    const budgetTransactions = transactions.map((transaction: any) => ({ amount: Number(transaction.amount), type: transaction.type, status: transaction.status, spendability: transaction.category?.purposeType === 'GENERAL' ? 'FLEXIBLE' as const : 'LOCKED' as const }));
    const result = await this.daily.calculate({ today, cycleStart: asDate(cycle.startDate), cycleEnd: asDate(cycle.endDate), allocations, transactions: budgetTransactions, reservedScheduledAmount: reserved });
    return { cycle, transactions, result };
  }

  async summary(userId: string, start?: string, end?: string) {
    const context = await this.context(userId, end ? parseDateOnly(end) : new Date());
    const where: any = { userId, status: 'CONFIRMED' }; where.occurredAt = start || end ? { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) } : { [Op.gte]: dateOnly(asDate(context.cycle.startDate)), [Op.lte]: dateOnly(asDate(context.cycle.endDate)) };
    const transactions = await Transaction.findAll({ where, include: [{ model: Category, as: 'category' }] });
    const total = (type: string) => transactions.filter((transaction: any) => transaction.type === type).reduce((sum, transaction: any) => sum + Number(transaction.amount), 0);
    return { income: total('INCOME'), expense: total('EXPENSE'), saving: transactions.filter((t: any) => t.type === 'SAVING' && t.category?.purposeType === 'SAVING').reduce((s, t: any) => s + Number(t.amount), 0), investment: transactions.filter((t: any) => t.type === 'SAVING' && t.category?.purposeType === 'INVESTMENT').reduce((s, t: any) => s + Number(t.amount), 0), remainingAvailableAmount: context.result.remainingFlexibleAmount };
  }

  async dailyReport(userId: string, start?: string, end?: string) {
    const context = await this.context(userId, end ? parseDateOnly(end) : new Date()); const from = start ? parseDateOnly(start) : asDate(context.cycle.startDate); const to = end ? parseDateOnly(end) : asDate(context.cycle.endDate);
    const transactions = await Transaction.findAll({ where: { userId, status: 'CONFIRMED', type: 'EXPENSE', occurredAt: { [Op.gte]: dateOnly(from), [Op.lte]: dateOnly(to) } }, include: [{ model: Category, as: 'category' }] });
    const rows = []; const dailyRecommended = Number(context.cycle.plannedFlexibleAmount) ? Math.floor(Number(context.cycle.plannedFlexibleAmount) / context.result.cycleDays) : 0;
    for (let date = from; date <= to; date = addDays(date, 1)) { const key = dateOnly(date); const spent = transactions.filter((transaction: any) => asDateKey(transaction.occurredAt) === key).reduce((sum, transaction: any) => sum + Number(transaction.amount), 0); rows.push({ date: key, spent, recommended: dailyRecommended, difference: spent - dailyRecommended }); }
    return rows;
  }

  async monthly(userId: string) { const transactions = await Transaction.findAll({ where: { userId, status: 'CONFIRMED' }, include: [{ model: Category, as: 'category' }] }); const byMonth = new Map<string, { income: number; expense: number; saving: number; investment: number }>(); for (const transaction of transactions as any[]) { const key = asDateKey(transaction.occurredAt).slice(0, 7); const row = byMonth.get(key) ?? { income: 0, expense: 0, saving: 0, investment: 0 }; if (transaction.type === 'INCOME') row.income += Number(transaction.amount); else if (transaction.type === 'EXPENSE') row.expense += Number(transaction.amount); else if (transaction.category?.purposeType === 'INVESTMENT') row.investment += Number(transaction.amount); else row.saving += Number(transaction.amount); byMonth.set(key, row); } return [...byMonth.entries()].sort().map(([month, values]) => ({ month, ...values })); }
  async categories(userId: string, start?: string, end?: string) { const where: any = { userId, status: 'CONFIRMED', type: 'EXPENSE' }; if (start || end) where.occurredAt = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) }; const transactions = await Transaction.findAll({ where, include: [{ model: Category, as: 'category' }] }); const total = transactions.reduce((sum: number, transaction: any) => sum + Number(transaction.amount), 0); const map = new Map<string, { amount: number; transactionCount: number }>(); for (const transaction of transactions as any[]) { const name = transaction.category?.name ?? '기타'; const row = map.get(name) ?? { amount: 0, transactionCount: 0 }; row.amount += Number(transaction.amount); row.transactionCount++; map.set(name, row); } return [...map.entries()].map(([category, values]) => ({ category, ...values, percentage: total ? values.amount / total * 100 : 0 })); }
  async pace(userId: string) { const context = await this.context(userId); return { current: { cycleStart: context.cycle.startDate, cycleEnd: context.cycle.endDate, ...context.result }, previous: null }; }
}
