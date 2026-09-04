import { daysInclusive } from '../utils/dates';

export type BudgetSpendability = 'LOCKED' | 'RESERVED' | 'FLEXIBLE';
export type BudgetTransaction = { amount: number; type: 'EXPENSE' | 'INCOME' | 'SAVING'; status: 'CONFIRMED' | 'PENDING' | 'EXCLUDED'; spendability: BudgetSpendability };
export type BudgetAllocationInput = { amount: number; spendability: BudgetSpendability };

export type DailyBudgetInput = {
  today: Date;
  cycleStart: Date;
  cycleEnd: Date;
  allocations: BudgetAllocationInput[];
  transactions: BudgetTransaction[];
  reservedScheduledAmount?: number;
};

export type DailyBudgetResult = {
  cycleDays: number;
  elapsedDays: number;
  remainingDays: number;
  flexibleBudget: number;
  reservedScheduledAmount: number;
  flexibleSpent: number;
  nonFlexibleOverage: number;
  remainingFlexibleAmount: number;
  todayRecommendedAmount: number;
  budgetStatus: 'ON_TRACK' | 'OVER_BUDGET';
  plannedSpendToDate: number;
  actualSpendToDate: number;
  difference: number;
  paceStatus: 'UNDER' | 'ON_TRACK' | 'OVER';
  currentDailyAverage: number;
  projectedTotalSpend: number;
  expectedRemainingAmount: number;
  potentialExtraSaving: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleDays: number;
};

export class DailyBudgetService {
  calculate(input: DailyBudgetInput): DailyBudgetResult {
    const cycleDays = daysInclusive(input.cycleStart, input.cycleEnd);
    const clampedToday = input.today < input.cycleStart ? input.cycleStart : input.today > input.cycleEnd ? input.cycleEnd : input.today;
    const elapsedDays = daysInclusive(input.cycleStart, clampedToday);
    const remainingDays = Math.max(1, daysInclusive(clampedToday, input.cycleEnd));
    const flexibleBudget = input.allocations.filter((a) => a.spendability === 'FLEXIBLE').reduce((sum, a) => sum + a.amount, 0);
    const confirmedExpenses = input.transactions.filter((t) => t.status === 'CONFIRMED' && t.type === 'EXPENSE');
    const flexibleSpent = confirmedExpenses.filter((t) => t.spendability === 'FLEXIBLE').reduce((sum, t) => sum + t.amount, 0);
    const lockedOrReservedSpent = confirmedExpenses.filter((t) => t.spendability !== 'FLEXIBLE').reduce((sum, t) => sum + t.amount, 0);
    const nonFlexibleBudget = input.allocations.filter((a) => a.spendability !== 'FLEXIBLE').reduce((sum, a) => sum + a.amount, 0);
    const nonFlexibleOverage = Math.max(0, lockedOrReservedSpent - nonFlexibleBudget);
    const reservedScheduledAmount = Math.max(0, input.reservedScheduledAmount ?? 0);
    const remainingFlexibleAmount = flexibleBudget - flexibleSpent - nonFlexibleOverage - reservedScheduledAmount;
    const todayRecommendedAmount = Math.max(0, Math.floor(remainingFlexibleAmount / remainingDays));
    const spentToday = confirmedExpenses.filter((t) => t.spendability === 'FLEXIBLE').reduce((sum, t) => sum + t.amount, 0);
    const plannedSpendToDate = Math.floor(flexibleBudget * elapsedDays / cycleDays);
    const actualSpendToDate = flexibleSpent;
    const difference = plannedSpendToDate - actualSpendToDate;
    const tolerance = Math.max(1, Math.floor(flexibleBudget * 0.02));
    const paceStatus = difference > tolerance ? 'UNDER' : difference < -tolerance ? 'OVER' : 'ON_TRACK';
    const currentDailyAverage = Math.floor(flexibleSpent / elapsedDays);
    const projectedTotalSpend = flexibleSpent + currentDailyAverage * Math.max(0, cycleDays - elapsedDays);
    const expectedRemainingAmount = flexibleBudget - projectedTotalSpend - nonFlexibleOverage - reservedScheduledAmount;
    const confidence = elapsedDays <= 2 ? 'LOW' : elapsedDays <= 7 ? 'MEDIUM' : 'HIGH';
    return {
      cycleDays, elapsedDays, remainingDays, flexibleBudget, reservedScheduledAmount, flexibleSpent, nonFlexibleOverage,
      remainingFlexibleAmount, todayRecommendedAmount, budgetStatus: remainingFlexibleAmount < 0 ? 'OVER_BUDGET' : 'ON_TRACK',
      plannedSpendToDate, actualSpendToDate, difference, paceStatus, currentDailyAverage, projectedTotalSpend,
      expectedRemainingAmount, potentialExtraSaving: Math.max(0, expectedRemainingAmount), confidence, sampleDays: elapsedDays,
    };
  }
}
