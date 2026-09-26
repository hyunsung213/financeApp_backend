export type CategoryReportTransaction = {
  amount: number | string;
  categoryId: string;
  category?: { name?: string | null; parentCategoryId?: string | null } | null;
};

export type CategoryReportRow = {
  /** Stable id of the category the amounts were saved on (a 대분류 id for legacy rows saved directly on one). */
  categoryId: string;
  category: string;
  /** null for a root/대분류 category (and when the category row no longer exists). */
  parentCategoryId: string | null;
  amount: number;
  transactionCount: number;
  percentage: number;
};

/**
 * Groups expense transactions by the category each one is saved on. Existing
 * response fields (`category` name, `amount`, `transactionCount`, `percentage`)
 * are unchanged; `categoryId`/`parentCategoryId` are metadata so clients can
 * tell a 대분류 row from a 소분류 row without guessing from the name. A
 * transaction saved directly on a 대분류 (legacy data) keeps its own row.
 */
export function buildCategoryReportRows(transactions: CategoryReportTransaction[]): CategoryReportRow[] {
  const total = transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const rows = new Map<string, Omit<CategoryReportRow, 'percentage'>>();
  for (const transaction of transactions) {
    const row = rows.get(transaction.categoryId) ?? { categoryId: transaction.categoryId, category: transaction.category?.name ?? '기타', parentCategoryId: transaction.category?.parentCategoryId ?? null, amount: 0, transactionCount: 0 };
    row.amount += Number(transaction.amount);
    row.transactionCount++;
    rows.set(transaction.categoryId, row);
  }
  return [...rows.values()].map((row) => ({ ...row, percentage: total ? row.amount / total * 100 : 0 }));
}
