import { DailyBudgetService } from '../src/services/dailyBudgetService';
import type { BudgetTransaction } from '../src/services/dailyBudgetService';

// Invariant for the Home headline ("오늘 쓸 수 있는 돈"):
//   todayRecommended = floor((usableBudget - spending before today) / days left incl. today)
//   remainingToday   = todayRecommended - today's spending
// so a won spent today is deducted from the headline exactly once, and the
// allowance itself does not move during the day.
const service = new DailyBudgetService();
const cycleStart = new Date('2026-10-01T00:00:00Z');
const cycleEnd = new Date('2026-10-30T00:00:00Z'); // 30 days
const allocations = [
  { categoryId: 'core.expense.food', amount: 300000 },
  { categoryId: 'core.expense.transport', amount: 150000 },
  { categoryId: 'core.expense.living', amount: 150000 },
  { categoryId: 'core.expense.fixed', amount: 500000 },
  { categoryId: 'core.expense.shopping', amount: 0 },
  { categoryId: 'core.expense.leisure-culture', amount: 0 },
  { categoryId: 'core.expense.health', amount: 0 },
  { categoryId: 'core.expense.education', amount: 0 },
  { categoryId: 'core.expense.relationship', amount: 0 },
  { categoryId: 'core.expense.other', amount: 0 },
  { categoryId: 'core.saving', amount: 200000 },
  { categoryId: 'core.investment', amount: 100000 },
]; // usable = 600,000
const expense = (amount: number, occurredAt: string, extra: Partial<BudgetTransaction> = {}): BudgetTransaction => ({ amount, refundedAmount: 0, type: 'EXPENSE', status: 'CONFIRMED', budgetCategoryId: 'core.expense.food', occurredAt: new Date(`${occurredAt}T00:00:00Z`), ...extra });
const calc = (today: string, transactions: BudgetTransaction[]) => service.calculate({ today: new Date(`${today}T00:00:00Z`), cycleStart, cycleEnd, salaryAmount: 1400000, allocations, transactions });

describe('daily allowance deducts today\'s spending once', () => {
  it('no spending today: headline equals the allowance', () => {
    const r = calc('2026-10-10', []);
    expect(r.remainingDays).toBe(21);
    expect(r.todayRecommendedAmount).toBe(Math.floor(600000 / 21));
    expect(r.todayVariableExpenseAmount).toBe(0);
    expect(r.remainingTodayAmount).toBe(r.todayRecommendedAmount);
  });

  it('spending today lowers the headline by that amount only, not the allowance', () => {
    const before = calc('2026-10-10', []);
    const r = calc('2026-10-10', [expense(10000, '2026-10-10')]);
    expect(r.todayRecommendedAmount).toBe(before.todayRecommendedAmount);
    expect(r.todayVariableExpenseAmount).toBe(10000);
    expect(r.remainingTodayAmount).toBe(before.todayRecommendedAmount - 10000);
    expect(r.remainingUsableAmount).toBe(590000);
  });

  it('several expenses today are summed and deducted once', () => {
    const before = calc('2026-10-10', []);
    const r = calc('2026-10-10', [expense(4000, '2026-10-10'), expense(6000, '2026-10-10', { budgetCategoryId: 'core.expense.transport' }), expense(5000, '2026-10-10', { refundedAmount: 2000 })]);
    expect(r.todayVariableExpenseAmount).toBe(13000);
    expect(r.todayRecommendedAmount).toBe(before.todayRecommendedAmount);
    expect(r.remainingTodayAmount).toBe(before.todayRecommendedAmount - 13000);
  });

  it("yesterday's spending lowers the allowance but not today's headline deduction", () => {
    const r = calc('2026-10-10', [expense(21000, '2026-10-09')]);
    expect(r.todayRecommendedAmount).toBe(Math.floor((600000 - 21000) / 21));
    expect(r.todayVariableExpenseAmount).toBe(0);
    expect(r.remainingTodayAmount).toBe(r.todayRecommendedAmount);
  });

  it('future spending changes nothing today', () => {
    const base = calc('2026-10-10', []);
    const r = calc('2026-10-10', [expense(50000, '2026-10-11'), expense(50000, '2026-10-30')]);
    expect(r).toEqual(base);
  });

  it('cycle first day with spending', () => {
    const r = calc('2026-10-01', [expense(20000, '2026-10-01')]);
    expect(r.remainingDays).toBe(30);
    expect(r.todayRecommendedAmount).toBe(20000);
    expect(r.remainingTodayAmount).toBe(0);
    expect(r.remainingUsableAmount).toBe(580000);
  });

  it('cycle last day: the whole remaining budget is the allowance and today\'s spend comes off once (audit case)', () => {
    // Audit P0-03: 100,000 left, 20,000 spent today -> 80,000, not 60,000.
    const spentBefore = 500000;
    const r = calc('2026-10-30', [expense(spentBefore, '2026-10-15'), expense(20000, '2026-10-30')]);
    expect(r.remainingDays).toBe(1);
    expect(r.todayRecommendedAmount).toBe(100000);
    expect(r.remainingTodayAmount).toBe(80000);
    expect(r.remainingTodayAmount).toBe(r.remainingUsableAmount);
  });

  it('over budget: allowance is 0 and the headline shows only today\'s overspend', () => {
    const r = calc('2026-10-20', [expense(650000, '2026-10-05'), expense(15000, '2026-10-20')]);
    expect(r.budgetStatus).toBe('OVER_BUDGET');
    expect(r.remainingUsableAmount).toBe(-65000);
    expect(r.todayRecommendedAmount).toBe(0);
    expect(r.remainingTodayAmount).toBe(-15000);
  });

  it('recommended - remainingToday always equals today\'s spending', () => {
    for (const [today, tx] of [['2026-10-01', [expense(1, '2026-10-01')]], ['2026-10-15', [expense(7000, '2026-10-15'), expense(3000, '2026-10-14')]], ['2026-10-30', [expense(99999, '2026-10-30')]]] as const) {
      const r = calc(today, [...tx]);
      expect(r.todayRecommendedAmount - r.remainingTodayAmount).toBe(r.todayVariableExpenseAmount);
    }
  });
});
