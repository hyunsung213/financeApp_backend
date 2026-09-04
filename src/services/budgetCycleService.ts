import { BudgetAllocation, BudgetCycle, BudgetCycleAllocation, UserFinanceSetting } from '../models';
import { currentCycleRange, dateOnly } from '../utils/dates';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

export class BudgetCycleService {
  async ensureCurrentCycle(userId: string, today = new Date()) {
    const setting = await UserFinanceSetting.findByPk(userId);
    if (!setting) throw new AppError('FINANCE_SETTING_REQUIRED', 'Finance setting must be created first', 409);
    const range = currentCycleRange(today, Number(setting.salaryDay));
    const startDate = dateOnly(range.startDate); const endDate = dateOnly(range.endDate);
    const existing = await BudgetCycle.findOne({ where: { userId, startDate }, include: [{ model: BudgetCycleAllocation, as: 'allocations' }] });
    if (existing) return existing;
    const allocations = await BudgetAllocation.findAll({ where: { userId, active: true } });
    const total = allocations.reduce((sum, allocation) => sum + Number(allocation.percentage), 0);
    if (Math.round(total * 100) !== 10000) throw new AppError('INVALID_ALLOCATION_TOTAL', 'Active budget allocation percentages must total 100', 400);
    const amountFor = (allocation: any) => Math.floor(Number(setting.salaryAmount) * Number(allocation.percentage) / 100);
    const snapshot = allocations.map((allocation: any) => ({ id: newId(), allocationId: allocation.id, name: allocation.name, percentage: allocation.percentage, amount: String(amountFor(allocation)), spendability: allocation.spendability }));
    const cycle = await BudgetCycle.create({ id: newId(), userId, startDate, endDate, salarySnapshot: String(setting.salaryAmount), plannedSavingAmount: String(snapshot.filter((a) => a.spendability === 'LOCKED' && a.name === '저축').reduce((s, a) => s + Number(a.amount), 0)), plannedInvestmentAmount: String(snapshot.filter((a) => a.spendability === 'LOCKED' && a.name === '투자').reduce((s, a) => s + Number(a.amount), 0)), plannedFlexibleAmount: String(snapshot.filter((a) => a.spendability === 'FLEXIBLE').reduce((s, a) => s + Number(a.amount), 0)), plannedReservedAmount: String(snapshot.filter((a) => a.spendability === 'RESERVED').reduce((s, a) => s + Number(a.amount), 0)), status: 'ACTIVE' });
    await BudgetCycleAllocation.bulkCreate(snapshot.map((item) => ({ ...item, budgetCycleId: cycle.id })));
    return BudgetCycle.findByPk(cycle.id, { include: [{ model: BudgetCycleAllocation, as: 'allocations' }] });
  }

  async findOrCreateForDate(userId: string, date: Date) { return this.ensureCurrentCycle(userId, date); }
}
