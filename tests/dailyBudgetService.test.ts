import { DailyBudgetService } from '../src/services/dailyBudgetService';

const service = new DailyBudgetService();
const cycleStart = new Date('2026-08-01T00:00:00Z');
const allocations = [
  { categoryId: 'core.expense.food', amount: 450000 },
  { categoryId: 'core.expense.transport', amount: 240000 },
  { categoryId: 'core.expense.living', amount: 240000 },
  { categoryId: 'core.expense.fixed', amount: 750000 },
  { categoryId: 'core.expense.shopping', amount: 120000 },
  { categoryId: 'core.expense.leisure-culture', amount: 120000 },
  { categoryId: 'core.expense.health', amount: 60000 },
  { categoryId: 'core.expense.education', amount: 30000 },
  { categoryId: 'core.expense.relationship', amount: 60000 },
  { categoryId: 'core.expense.other', amount: 30000 },
  { categoryId: 'core.saving', amount: 600000 },
  { categoryId: 'core.investment', amount: 300000 },
];
const base = { today: cycleStart, cycleStart, cycleEnd: new Date('2026-08-30T00:00:00Z'), salaryAmount: 3000000, allocations, transactions: [] };

test('allocates all salary categories while excluding fixed expense, saving, and investment from daily spending money', () => {
  const result = service.calculate(base);
  expect(result.savingBudgetAmount).toBe(600000);
  expect(result.investmentBudgetAmount).toBe(300000);
  expect(result.fixedExpenseBudgetAmount).toBe(750000);
  expect(result.usableBudgetAmount).toBe(1350000);
  expect(result.todayRecommendedAmount).toBe(45000);
});

test('a child-category expense consumes its top-level category budget and remaining daily spending money', () => {
  const result = service.calculate({ ...base, today: new Date('2026-08-10T00:00:00Z'), transactions: [{ amount: 100000, refundedAmount: 0, type: 'EXPENSE', status: 'CONFIRMED', budgetCategoryId: 'core.expense.food', occurredAt: new Date('2026-08-09T00:00:00Z') }] });
  expect(result.variableExpenseAmount).toBe(100000);
  expect(result.remainingUsableAmount).toBe(1250000);
  expect(result.todayRecommendedAmount).toBe(Math.floor(1250000 / 21));
  expect(result.categoryProgress.find((category) => category.categoryId === 'core.expense.food')?.remainingAmount).toBe(350000);
});

test('fixed expenses are reported separately and do not reduce usable spending money', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 500000, refundedAmount: 0, type: 'EXPENSE', status: 'CONFIRMED', budgetCategoryId: 'core.expense.fixed', occurredAt: cycleStart }] });
  expect(result.fixedExpenseAmount).toBe(500000);
  expect(result.remainingUsableAmount).toBe(1350000);
});

test('refunds restore the original category and usable budget only up to the recorded refund amount', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 80000, refundedAmount: 20000, type: 'EXPENSE', status: 'CONFIRMED', budgetCategoryId: 'core.expense.food', occurredAt: cycleStart }] });
  expect(result.variableExpenseAmount).toBe(60000);
  expect(result.remainingUsableAmount).toBe(1290000);
  expect(result.categoryProgress.find((category) => category.categoryId === 'core.expense.food')?.spentAmount).toBe(60000);
});

test('pending, excluded, and future transactions do not reduce the current daily spending money', () => {
  const result = service.calculate({ ...base, transactions: [{ amount: 500000, refundedAmount: 0, type: 'EXPENSE', status: 'EXCLUDED', budgetCategoryId: 'core.expense.food', occurredAt: cycleStart }, { amount: 500000, refundedAmount: 0, type: 'EXPENSE', status: 'PENDING', budgetCategoryId: 'core.expense.food', occurredAt: cycleStart }, { amount: 500000, refundedAmount: 0, type: 'EXPENSE', status: 'CONFIRMED', budgetCategoryId: 'core.expense.food', occurredAt: new Date('2026-08-20T00:00:00Z') }] });
  expect(result.variableExpenseAmount).toBe(0);
  expect(result.remainingUsableAmount).toBe(1350000);
});

test('divides the remaining budget over today through the day before the next payday (D-Day)', () => {
  const september = { ...base, cycleStart: new Date('2026-09-01T00:00:00Z'), cycleEnd: new Date('2026-09-30T00:00:00Z') };
  const result = service.calculate({ ...september, today: new Date('2026-09-26T00:00:00Z') });
  expect(result.remainingDays).toBe(5);
  expect(result.todayRecommendedAmount).toBe(Math.floor(1350000 / 5));
});
