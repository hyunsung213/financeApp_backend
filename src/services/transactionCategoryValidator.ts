import { AppError } from '../utils/errors';

export const CATEGORY_HAS_CHILDREN_MESSAGE = '하위 카테고리가 있는 대분류는 거래 카테고리로 직접 선택할 수 없습니다.';

/**
 * Read access the validator needs. Kept as an interface (rather than importing
 * the Sequelize models here) so the rule itself stays a pure function that unit
 * tests can drive without a database; the Sequelize-backed implementation lives
 * in `transactionCategoryLookup.ts`.
 */
export interface CategoryLookup {
  /** Whether [categoryId] exists and is visible to [userId] (system category or the user's own). */
  isVisible(categoryId: string, userId: string): Promise<boolean>;
  /** Whether [categoryId] has at least one active child category visible to [userId]. */
  hasActiveChildren(categoryId: string, userId: string): Promise<boolean>;
}

/**
 * Throws unless [categoryId] may be stored as a transaction's final category.
 *
 * - Unknown / not-visible category -> 400 `INVALID_CATEGORY` (unchanged behaviour).
 * - A category that has active child categories (a 대분류 such as 식비) -> 400
 *   `CATEGORY_HAS_CHILDREN`: a transaction must point at a leaf (소분류).
 *
 * [currentCategoryId] is the category the transaction being *updated* already
 * has. Sending that same id back is not a category change, so it is not
 * re-checked against the leaf rule; this keeps a legacy transaction that was
 * saved directly on a 대분류 editable (memo, amount, ...) until its owner picks
 * a real 소분류. Pass nothing on create - every category is a new assignment there.
 */
export async function assertAssignableTransactionCategory(lookup: CategoryLookup, categoryId: string, userId: string, currentCategoryId?: string): Promise<void> {
  if (!(await lookup.isVisible(categoryId, userId))) throw new AppError('INVALID_CATEGORY', 'Category not found', 400);
  if (categoryId === currentCategoryId) return;
  if (await lookup.hasActiveChildren(categoryId, userId)) throw new AppError('CATEGORY_HAS_CHILDREN', CATEGORY_HAS_CHILDREN_MESSAGE, 400);
}
