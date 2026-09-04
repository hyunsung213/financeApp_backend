import { DailyBudgetService } from '../src/services/dailyBudgetService';

const service = new DailyBudgetService();
const base = { today: new Date('2026-08-10T00:00:00Z'), cycleStart: new Date('2026-08-01T00:00:00Z'), cycleEnd: new Date('2026-08-30T00:00:00Z'), allocations: [{ amount: 1500000, spendability: 'LOCKED' as const }, { amount: 300000, spendability: 'LOCKED' as const }, { amount: 300000, spendability: 'RESERVED' as const }, { amount: 900000, spendability: 'FLEXIBLE' as const }], transactions: [] };

test('Case 1/2: flexible budget and initial daily recommendation are calculated', () => {
  const result = service.calculate({ ...base, today: base.cycleStart });
  expect(result.flexibleBudget).toBe(900000);
  expect(result.todayRecommendedAmount).toBe(30000);
});

test('Case 3: underspending increases remaining daily amount', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 100000, type: 'EXPENSE', status: 'CONFIRMED', spendability: 'FLEXIBLE' }] });
  expect(result.paceStatus).toBe('UNDER');
  expect(result.todayRecommendedAmount).toBeGreaterThan(30000);
});

test('Case 4/5: overspending lowers recommendation and eventually marks over budget', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 1000000, type: 'EXPENSE', status: 'CONFIRMED', spendability: 'FLEXIBLE' }] });
  expect(result.todayRecommendedAmount).toBe(0);
  expect(result.budgetStatus).toBe('OVER_BUDGET');
});

test('Case 6: scheduled fixed amount reduces remaining flexible amount', () => {
  const result = service.calculate({ ...base, reservedScheduledAmount: 80000 });
  expect(result.reservedScheduledAmount).toBe(80000);
  expect(result.remainingFlexibleAmount).toBe(820000);
});

test('Case 7/9: excluded and pending transactions do not reduce official budget', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 500000, type: 'EXPENSE', status: 'EXCLUDED', spendability: 'FLEXIBLE' }, { amount: 500000, type: 'EXPENSE', status: 'PENDING', spendability: 'FLEXIBLE' }] });
  expect(result.flexibleSpent).toBe(0);
  expect(result.remainingFlexibleAmount).toBe(900000);
});
