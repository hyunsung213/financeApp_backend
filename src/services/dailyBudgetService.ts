import { isDailySpendableBudgetCategory, isExpenseBudgetCategory } from '../constants/budgetPlan';
import { dateOnly, daysInclusive } from '../utils/dates';

export type BudgetTransaction = {
  amount: number;
  refundedAmount: number;
  type: 'EXPENSE' | 'INCOME' | 'SAVING';
  status: 'CONFIRMED' | 'PENDING' | 'EXCLUDED';
  budgetCategoryId?: string;
  occurredAt: Date;
};

export type DailyBudgetInput = {
  today: Date;
  cycleStart: Date;
  cycleEnd: Date;
  salaryAmount: number;
  allocations: Array<{ categoryId: string; amount: number }>;
  transactions: BudgetTransaction[];
};

export type BudgetCategoryProgress = {
  categoryId: string;
  plannedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  usageRate: number;
};

export type DailyBudgetResult = {
  cycleDays: number;
  elapsedDays: number;
  remainingDays: number;
  salaryAmount: number;
  savingBudgetAmount: number;
  investmentBudgetAmount: number;
  fixedExpenseBudgetAmount: number;
  usableBudgetAmount: number;
  variableExpenseAmount: number;
  fixedExpenseAmount: number;
  remainingUsableAmount: number;
  todayVariableExpenseAmount: number;
  todayRecommendedAmount: number;
  remainingTodayAmount: number;
  categoryProgress: BudgetCategoryProgress[];
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
    const todayKey = dateOnly(clampedToday);
    const actualAmount = (transaction: BudgetTransaction) => Math.max(0, transaction.amount - transaction.refundedAmount);
    const confirmedExpenses = input.transactions.filter((transaction) => transaction.status === 'CONFIRMED' && transaction.type === 'EXPENSE' && dateOnly(transaction.occurredAt) <= todayKey);
    const spentByCategory = new Map<string, number>();
    for (const transaction of confirmedExpenses) {
      if (!transaction.budgetCategoryId || !isExpenseBudgetCategory(transaction.budgetCategoryId)) continue;
      spentByCategory.set(transaction.budgetCategoryId, (spentByCategory.get(transaction.budgetCategoryId) ?? 0) + actualAmount(transaction));
    }

    const allocationAmount = (categoryId: string) => input.allocations.find((allocation) => allocation.categoryId === categoryId)?.amount ?? 0;
    const categoryProgress = input.allocations.filter((allocation) => isExpenseBudgetCategory(allocation.categoryId)).map((allocation) => {
      const spentAmount = spentByCategory.get(allocation.categoryId) ?? 0;
      return { categoryId: allocation.categoryId, plannedAmount: allocation.amount, spentAmount, remainingAmount: allocation.amount - spentAmount, usageRate: allocation.amount ? spentAmount / allocation.amount * 100 : 0 };
    });
    const usableProgress = categoryProgress.filter((category) => isDailySpendableBudgetCategory(category.categoryId));
    const usableBudgetAmount = usableProgress.reduce((sum, category) => sum + category.plannedAmount, 0);
    const variableExpenseAmount = usableProgress.reduce((sum, category) => sum + category.spentAmount, 0);
    const fixedExpenseBudgetAmount = allocationAmount('core.expense.fixed');
    const fixedExpenseAmount = spentByCategory.get('core.expense.fixed') ?? 0;
    const savingBudgetAmount = allocationAmount('core.saving');
    const investmentBudgetAmount = allocationAmount('core.investment');
    const remainingUsableAmount = usableBudgetAmount - variableExpenseAmount;
    const todayVariableExpenseAmount = confirmedExpenses.filter((transaction) => transaction.budgetCategoryId !== undefined && isDailySpendableBudgetCategory(transaction.budgetCategoryId) && dateOnly(transaction.occurredAt) === todayKey).reduce((sum, transaction) => sum + actualAmount(transaction), 0);
    // Today's allowance is fixed for the day: the usable budget as it stood at
    // the start of today (i.e. before today's spending), spread over the days
    // left. Today's spending is then taken off that allowance exactly once in
    // remainingTodayAmount - it must not also shrink the allowance itself,
    // or every won spent today would be deducted twice from the headline.
    const usableAtStartOfToday = remainingUsableAmount + todayVariableExpenseAmount;
    const todayRecommendedAmount = Math.max(0, Math.floor(usableAtStartOfToday / remainingDays));
    const remainingTodayAmount = todayRecommendedAmount - todayVariableExpenseAmount;
    const plannedSpendToDate = Math.floor(usableBudgetAmount * elapsedDays / cycleDays);
    const actualSpendToDate = variableExpenseAmount;
    const difference = plannedSpendToDate - actualSpendToDate;
    const tolerance = Math.max(1, Math.floor(usableBudgetAmount * 0.02));
    const paceStatus = difference > tolerance ? 'UNDER' : difference < -tolerance ? 'OVER' : 'ON_TRACK';
    const currentDailyAverage = Math.floor(variableExpenseAmount / elapsedDays);
    const projectedTotalSpend = variableExpenseAmount + currentDailyAverage * Math.max(0, cycleDays - elapsedDays);
    const expectedRemainingAmount = usableBudgetAmount - projectedTotalSpend;
    const confidence = elapsedDays <= 2 ? 'LOW' : elapsedDays <= 7 ? 'MEDIUM' : 'HIGH';

    return {
      cycleDays,
      elapsedDays,
      remainingDays,
      salaryAmount: input.salaryAmount,
      savingBudgetAmount,
      investmentBudgetAmount,
      fixedExpenseBudgetAmount,
      usableBudgetAmount,
      variableExpenseAmount,
      fixedExpenseAmount,
      remainingUsableAmount,
      todayVariableExpenseAmount,
      todayRecommendedAmount,
      remainingTodayAmount,
      categoryProgress,
      budgetStatus: remainingUsableAmount < 0 ? 'OVER_BUDGET' : 'ON_TRACK',
      plannedSpendToDate,
      actualSpendToDate,
      difference,
      paceStatus,
      currentDailyAverage,
      projectedTotalSpend,
      expectedRemainingAmount,
      potentialExtraSaving: Math.max(0, expectedRemainingAmount),
      confidence,
      sampleDays: elapsedDays,
    };
  }
}
