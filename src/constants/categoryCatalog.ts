export type CategoryCatalogItem = {
  id: string;
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'SAVING';
  purposeType: 'GENERAL' | 'SAVING' | 'INVESTMENT';
  parentCategoryId?: string;
  sortOrder: number;
};

// Stable IDs are intentionally independent from Korean display names.
// The `core.` prefix separates system categories from user-created categories.
export const CATEGORY_IDS = {
  SAVING: 'core.saving',
  INVESTMENT: 'core.investment',
  EXPENSE: 'core.expense',
  INCOME: 'core.income',
  SAVING_EMERGENCY_FUND: 'core.saving.emergency-fund',
  SAVING_GOAL: 'core.saving.goal',
  SAVING_INSTALLMENT: 'core.saving.installment',
  SAVING_DEPOSIT: 'core.saving.deposit',
  SAVING_HOUSING: 'core.saving.housing',
  SAVING_PENSION: 'core.saving.pension',
  INVESTMENT_STOCK: 'core.investment.stock',
  INVESTMENT_ETF: 'core.investment.etf',
  INVESTMENT_FUND: 'core.investment.fund',
  INVESTMENT_BOND: 'core.investment.bond',
  INVESTMENT_CRYPTO: 'core.investment.crypto',
  INVESTMENT_PENSION: 'core.investment.pension',
  EXPENSE_HOUSING: 'core.expense.housing',
  EXPENSE_FOOD: 'core.expense.food',
  EXPENSE_TRANSPORT: 'core.expense.transport',
  EXPENSE_COMMUNICATION: 'core.expense.communication',
  EXPENSE_DAILY_NECESSITIES: 'core.expense.daily-necessities',
  EXPENSE_HEALTH: 'core.expense.health',
  EXPENSE_INSURANCE_TAX: 'core.expense.insurance-tax',
  EXPENSE_DEBT_REPAYMENT: 'core.expense.debt-repayment',
  EXPENSE_UNCLASSIFIED: 'core.expense.unclassified',
  INCOME_SALARY: 'core.income.salary',
} as const;

export const CATEGORY_CATALOG: CategoryCatalogItem[] = [
  { id: CATEGORY_IDS.SAVING, name: '저축', type: 'SAVING', purposeType: 'SAVING', sortOrder: 10 },
  { id: CATEGORY_IDS.INVESTMENT, name: '투자', type: 'SAVING', purposeType: 'INVESTMENT', sortOrder: 20 },
  { id: CATEGORY_IDS.EXPENSE, name: '지출', type: 'EXPENSE', purposeType: 'GENERAL', sortOrder: 30 },
  { id: CATEGORY_IDS.INCOME, name: '수입', type: 'INCOME', purposeType: 'GENERAL', sortOrder: 40 },

  { id: CATEGORY_IDS.SAVING_EMERGENCY_FUND, name: '비상금', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 110 },
  { id: CATEGORY_IDS.SAVING_GOAL, name: '목적성 저축', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 120 },
  { id: CATEGORY_IDS.SAVING_INSTALLMENT, name: '적금', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 130 },
  { id: CATEGORY_IDS.SAVING_DEPOSIT, name: '예금', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 140 },
  { id: CATEGORY_IDS.SAVING_HOUSING, name: '주택청약', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 150 },
  { id: CATEGORY_IDS.SAVING_PENSION, name: '연금저축', type: 'SAVING', purposeType: 'SAVING', parentCategoryId: CATEGORY_IDS.SAVING, sortOrder: 160 },

  { id: CATEGORY_IDS.INVESTMENT_STOCK, name: '주식', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 210 },
  { id: CATEGORY_IDS.INVESTMENT_ETF, name: 'ETF', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 220 },
  { id: CATEGORY_IDS.INVESTMENT_FUND, name: '펀드', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 230 },
  { id: CATEGORY_IDS.INVESTMENT_BOND, name: '채권', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 240 },
  { id: CATEGORY_IDS.INVESTMENT_CRYPTO, name: '가상자산', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 250 },
  { id: CATEGORY_IDS.INVESTMENT_PENSION, name: '퇴직연금·IRP', type: 'SAVING', purposeType: 'INVESTMENT', parentCategoryId: CATEGORY_IDS.INVESTMENT, sortOrder: 260 },

  { id: CATEGORY_IDS.EXPENSE_HOUSING, name: '주거', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 310 },
  { id: CATEGORY_IDS.EXPENSE_FOOD, name: '식비', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 320 },
  { id: CATEGORY_IDS.EXPENSE_TRANSPORT, name: '교통', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 330 },
  { id: CATEGORY_IDS.EXPENSE_COMMUNICATION, name: '통신', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 340 },
  { id: CATEGORY_IDS.EXPENSE_DAILY_NECESSITIES, name: '생활필수품', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 350 },
  { id: CATEGORY_IDS.EXPENSE_HEALTH, name: '의료·건강', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 360 },
  { id: CATEGORY_IDS.EXPENSE_INSURANCE_TAX, name: '보험·세금', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 370 },
  { id: CATEGORY_IDS.EXPENSE_DEBT_REPAYMENT, name: '부채상환', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 380 },
  { id: CATEGORY_IDS.EXPENSE_UNCLASSIFIED, name: '미분류', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.EXPENSE, sortOrder: 390 },

  { id: CATEGORY_IDS.INCOME_SALARY, name: '급여', type: 'INCOME', purposeType: 'GENERAL', parentCategoryId: CATEGORY_IDS.INCOME, sortOrder: 410 },
];
