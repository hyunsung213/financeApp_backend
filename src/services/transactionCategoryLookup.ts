import { Op } from 'sequelize';
import { Category } from '../models';
import { assertAssignableTransactionCategory, type CategoryLookup } from './transactionCategoryValidator';

// System categories (ownerUserId null) plus the caller's own custom ones.
const visibleTo = (userId: string) => ({ [Op.or]: [{ ownerUserId: userId }, { ownerUserId: null }] });

export const sequelizeCategoryLookup: CategoryLookup = {
  isVisible: async (categoryId, userId) => (await Category.count({ where: { id: categoryId, ...visibleTo(userId) } })) > 0,
  hasActiveChildren: async (categoryId, userId) => (await Category.count({ where: { parentCategoryId: categoryId, isActive: true, ...visibleTo(userId) } })) > 0,
};

/** Shared by createTransaction and updateTransaction so both apply the same rule. */
export const assertTransactionCategory = (categoryId: string, userId: string, currentCategoryId?: string) =>
  assertAssignableTransactionCategory(sequelizeCategoryLookup, categoryId, userId, currentCategoryId);
