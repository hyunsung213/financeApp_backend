import { CATEGORY_CATALOG, CATEGORY_IDS } from './categoryCatalog';

export const BUDGET_CATEGORY_IDS = [
  CATEGORY_IDS.EXPENSE_FOOD,
  CATEGORY_IDS.EXPENSE_TRANSPORT,
  CATEGORY_IDS.EXPENSE_LIVING,
  CATEGORY_IDS.EXPENSE_FIXED,
  CATEGORY_IDS.EXPENSE_SHOPPING,
  CATEGORY_IDS.EXPENSE_LEISURE_CULTURE,
  CATEGORY_IDS.EXPENSE_HEALTH,
  CATEGORY_IDS.EXPENSE_EDUCATION,
  CATEGORY_IDS.EXPENSE_RELATIONSHIP,
  CATEGORY_IDS.EXPENSE_OTHER,
  CATEGORY_IDS.SAVING,
  CATEGORY_IDS.INVESTMENT,
] as const;

export type BudgetCategoryId = typeof BUDGET_CATEGORY_IDS[number];
export type BudgetPlanItem = { categoryId: BudgetCategoryId; percentage: number };

const categoryName = new Map(CATEGORY_CATALOG.map((category) => [category.id, category.name]));

export const DEFAULT_BUDGET_PLAN: BudgetPlanItem[] = [
  { categoryId: CATEGORY_IDS.EXPENSE_FOOD, percentage: 15 },
  { categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT, percentage: 8 },
  { categoryId: CATEGORY_IDS.EXPENSE_LIVING, percentage: 8 },
  { categoryId: CATEGORY_IDS.EXPENSE_FIXED, percentage: 25 },
  { categoryId: CATEGORY_IDS.EXPENSE_SHOPPING, percentage: 4 },
  { categoryId: CATEGORY_IDS.EXPENSE_LEISURE_CULTURE, percentage: 4 },
  { categoryId: CATEGORY_IDS.EXPENSE_HEALTH, percentage: 2 },
  { categoryId: CATEGORY_IDS.EXPENSE_EDUCATION, percentage: 1 },
  { categoryId: CATEGORY_IDS.EXPENSE_RELATIONSHIP, percentage: 2 },
  { categoryId: CATEGORY_IDS.EXPENSE_OTHER, percentage: 1 },
  { categoryId: CATEGORY_IDS.SAVING, percentage: 20 },
  { categoryId: CATEGORY_IDS.INVESTMENT, percentage: 10 },
];

export const budgetCategoryName = (categoryId: string) => categoryName.get(categoryId) ?? categoryId;
export const isBudgetCategoryId = (categoryId: string): categoryId is BudgetCategoryId => (BUDGET_CATEGORY_IDS as readonly string[]).includes(categoryId);
export const isExpenseBudgetCategory = (categoryId: string) => categoryId.startsWith('core.expense.');
// The 10 지출 대분류 the budget plan allocates to. Every EXPENSE category is
// one of these or sits directly under one, so all spending has a budget.
export const isExpenseBudgetRoot = (categoryId: string) => isBudgetCategoryId(categoryId) && isExpenseBudgetCategory(categoryId);
export const isDailySpendableBudgetCategory = (categoryId: string) => isExpenseBudgetCategory(categoryId) && categoryId !== CATEGORY_IDS.EXPENSE_FIXED;
export const allocationTypeForCategory = (categoryId: string) => categoryId === CATEGORY_IDS.SAVING ? 'SAVING' : categoryId === CATEGORY_IDS.INVESTMENT ? 'INVESTMENT' : categoryId === CATEGORY_IDS.EXPENSE_FIXED ? 'FIXED_LIVING' : 'FLEXIBLE';
export const spendabilityForCategory = (categoryId: string) => categoryId === CATEGORY_IDS.SAVING || categoryId === CATEGORY_IDS.INVESTMENT ? 'LOCKED' : categoryId === CATEGORY_IDS.EXPENSE_FIXED ? 'RESERVED' : 'FLEXIBLE';
