import { assertAssignableTransactionCategory, CATEGORY_HAS_CHILDREN_MESSAGE, type CategoryLookup } from '../src/services/transactionCategoryValidator';
import { AppError } from '../src/utils/errors';

// Mirrors the live tree shape: 식비 is a root with children, 식사/카페 are leaves,
// 'my-root' is a childless custom category, and 'other-user-leaf' belongs to someone else.
type Row = { id: string; parentCategoryId: string | null; ownerUserId: string | null; isActive: boolean };
const rows: Row[] = [
  { id: 'core.expense.food', parentCategoryId: null, ownerUserId: null, isActive: true },
  { id: 'core.expense.food.meal', parentCategoryId: 'core.expense.food', ownerUserId: null, isActive: true },
  { id: 'core.expense.food.cafe', parentCategoryId: 'core.expense.food', ownerUserId: null, isActive: true },
  { id: 'core.expense.transport', parentCategoryId: null, ownerUserId: null, isActive: true },
  { id: 'core.expense.transport.old', parentCategoryId: 'core.expense.transport', ownerUserId: null, isActive: false },
  { id: 'my-root', parentCategoryId: null, ownerUserId: 'user-1', isActive: true },
  { id: 'other-user-leaf', parentCategoryId: null, ownerUserId: 'user-2', isActive: true },
  { id: 'other-user-child', parentCategoryId: 'my-root', ownerUserId: 'user-2', isActive: true },
];
const visible = (row: Row, userId: string) => row.ownerUserId === null || row.ownerUserId === userId;
const lookup: CategoryLookup = {
  isVisible: async (id, userId) => rows.some((row) => row.id === id && visible(row, userId)),
  hasActiveChildren: async (id, userId) => rows.some((row) => row.parentCategoryId === id && row.isActive && visible(row, userId)),
};
const assign = (categoryId: string, currentCategoryId?: string) => assertAssignableTransactionCategory(lookup, categoryId, 'user-1', currentCategoryId);

async function rejection(promise: Promise<void>) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('transaction category assignment (create)', () => {
  it('rejects a 대분류 that has child categories with 400 and the documented message', async () => {
    const error = await rejection(assign('core.expense.food'));
    expect(error.status).toBe(400);
    expect(error.code).toBe('CATEGORY_HAS_CHILDREN');
    expect(error.message).toBe(CATEGORY_HAS_CHILDREN_MESSAGE);
  });

  it('accepts a leaf category', async () => {
    await expect(assign('core.expense.food.meal')).resolves.toBeUndefined();
    await expect(assign('core.expense.food.cafe')).resolves.toBeUndefined();
  });

  it('accepts a root that has no children (it is a leaf)', async () => {
    await expect(assign('my-root')).resolves.toBeUndefined();
  });

  it('only counts active children: a root whose children are all inactive is assignable', async () => {
    await expect(assign('core.expense.transport')).resolves.toBeUndefined();
  });

  it('does not count children the user cannot see', async () => {
    // user-2's child under my-root is invisible to user-1, so my-root is still a leaf for user-1.
    await expect(assign('my-root')).resolves.toBeUndefined();
  });

  it('keeps rejecting unknown or not-visible categories with INVALID_CATEGORY', async () => {
    for (const id of ['does-not-exist', 'other-user-leaf']) {
      const error = await rejection(assign(id));
      expect(error.status).toBe(400);
      expect(error.code).toBe('INVALID_CATEGORY');
    }
  });
});

describe('transaction category assignment (update)', () => {
  it('rejects changing a leaf transaction to a 대분류', async () => {
    const error = await rejection(assign('core.expense.food', 'core.expense.food.meal'));
    expect(error.code).toBe('CATEGORY_HAS_CHILDREN');
    expect(error.status).toBe(400);
  });

  it('accepts changing a legacy 대분류 transaction to a real 소분류', async () => {
    await expect(assign('core.expense.food.cafe', 'core.expense.food')).resolves.toBeUndefined();
  });

  it('lets a legacy transaction resend its unchanged 대분류 id (editing only the memo must not fail)', async () => {
    await expect(assign('core.expense.food', 'core.expense.food')).resolves.toBeUndefined();
  });

  it('still requires the unchanged category to exist', async () => {
    const error = await rejection(assign('does-not-exist', 'does-not-exist'));
    expect(error.code).toBe('INVALID_CATEGORY');
  });
});
