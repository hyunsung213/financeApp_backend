const rows = new Map<string, any>();
const preferences = new Map<string, any>();
const prefKey = (userId: string, categoryId: string) => `${userId}|${categoryId}`;

function preferenceRow(values: Record<string, unknown>) {
  const data: Record<string, unknown> = { displayName: null, icon: null, color: null, ...values };
  const key = prefKey(String(data.userId), String(data.categoryId));
  const instance: any = {
    data,
    toJSON: () => ({ ...data }),
    update: jest.fn(async (changes: Record<string, unknown>) => {
      Object.assign(data, changes);
      return instance;
    }),
    destroy: jest.fn(async () => {
      preferences.delete(key);
    }),
  };
  preferences.set(key, instance);
  return instance;
}

jest.mock('../src/models', () => {
  const Category = {
    upsert: jest.fn(async () => undefined),
    update: jest.fn(async () => [0]),
    create: jest.fn(async (values: Record<string, unknown>) => row(values)),
    count: jest.fn(async () => 0),
    findAll: jest.fn(async ({ where }: any) => {
      if (where.sourceCategoryId) return [];
      const owners = where[Object.getOwnPropertySymbols(where)[0]].map((clause: any) => clause.ownerUserId);
      return [...rows.values()].filter((r) => r.data.isActive && owners.includes(r.data.ownerUserId));
    }),
    findByPk: jest.fn(async (id: string) => rows.get(id) ?? null),
    findOne: jest.fn(async ({ where }: any) => {
      if (where.sourceCategoryId) return null;
      return rows.get(where.id) ?? null;
    }),
  };
  const UserCategoryPreference = {
    findAll: jest.fn(async ({ where }: any) => [...preferences.values()].filter((p) => p.data.userId === where.userId && (!where.categoryId || where.categoryId.includes(p.data.categoryId)))),
    findOne: jest.fn(async ({ where }: any) => preferences.get(prefKey(where.userId, where.categoryId)) ?? null),
    create: jest.fn(async (values: Record<string, unknown>) => preferenceRow(values)),
    destroy: jest.fn(async ({ where }: any) => {
      preferences.delete(prefKey(where.userId, where.categoryId));
    }),
  };
  return { Category, UserCategoryPreference, Transaction: { update: jest.fn() }, FixedExpense: { update: jest.fn() } };
});

import { Category, UserCategoryPreference } from '../src/models';
import { CategoryService } from '../src/services/categoryService';
import { parseNotification } from '../src/services/notificationParsers';
import { categoryPatchSchema } from '../src/validators/schemas';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function row(values: Record<string, unknown>) {
  const data: Record<string, unknown> = { isActive: true, sortOrder: 0, sourceCategoryId: null, parentCategoryId: null, ...values };
  const instance: any = {
    data,
    get: (key: string) => data[key],
    toJSON: () => ({ ...data }),
    update: jest.fn(async (changes: Record<string, unknown>) => {
      Object.assign(data, changes);
      return instance;
    }),
  };
  rows.set(String(data.id), instance);
  return instance;
}

describe('CategoryService system category protection', () => {
  let service: CategoryService;
  let food: any;
  let taxi: any;
  let custom: any;

  beforeEach(() => {
    rows.clear();
    preferences.clear();
    jest.clearAllMocks();
    service = new CategoryService();
    food = row({ id: 'core.expense.food', ownerUserId: null, name: '식비', type: 'EXPENSE', sortOrder: 100 });
    row({ id: 'core.expense.transport', ownerUserId: null, name: '교통', type: 'EXPENSE', sortOrder: 200 });
    taxi = row({ id: 'core.expense.transport.taxi', ownerUserId: null, name: '택시', type: 'EXPENSE', parentCategoryId: 'core.expense.transport', sortOrder: 202 });
    custom = row({ id: 'custom-1', ownerUserId: USER, name: '야식', type: 'EXPENSE', parentCategoryId: 'core.expense.food', sortOrder: 102 });
    (Category.create as jest.Mock).mockClear();
  });

  const expectNoCopy = () => {
    expect(Category.create).not.toHaveBeenCalled();
    expect(require('../src/models').Transaction.update).not.toHaveBeenCalled();
    expect(require('../src/models').FixedExpense.update).not.toHaveBeenCalled();
  };

  it('renames a system category for the user only, keeping its id and Category row', async () => {
    const before = { ...taxi.data };
    const updated = await service.update(USER, taxi.data.id, { name: '카카오택시' });

    expect(updated).toMatchObject({
      id: 'core.expense.transport.taxi',
      name: '카카오택시',
      canonicalName: '택시',
      parentCategoryId: 'core.expense.transport',
      isSystem: true,
      isCustom: false,
      isCustomized: true,
    });
    expect(taxi.update).not.toHaveBeenCalled();
    expect(taxi.data).toEqual(before);
    expect(preferences.get(prefKey(USER, taxi.data.id))?.data).toMatchObject({ userId: USER, categoryId: 'core.expense.transport.taxi', displayName: '카카오택시' });
    expectNoCopy();
  });

  it("does not show one user's override to another user", async () => {
    await service.update(USER, taxi.data.id, { name: '카카오택시', icon: 'local_taxi', color: '#ED5564' });

    const mine = (await service.list(USER)).find((c: any) => c.id === taxi.data.id);
    const theirs = (await service.list(OTHER)).find((c: any) => c.id === taxi.data.id);
    expect(mine).toMatchObject({ name: '카카오택시', icon: 'local_taxi', color: '#ED5564', isCustomized: true });
    expect(theirs).toMatchObject({ name: '택시', canonicalName: '택시', icon: null, color: null, isCustomized: false });
  });

  it('stores icon and color and returns them on the next list', async () => {
    await service.update(USER, taxi.data.id, { icon: 'local_taxi' });
    await service.update(USER, taxi.data.id, { color: '#5D9CEC' });

    const listed = (await service.list(USER)).find((c: any) => c.id === taxi.data.id);
    expect(listed).toMatchObject({ name: '택시', icon: 'local_taxi', color: '#5D9CEC', isCustomized: true });
  });

  it('renames a 대분류 without touching the id the budget plan uses', async () => {
    const updated = await service.update(USER, food.data.id, { name: '먹는 돈' });
    expect(updated).toMatchObject({ id: 'core.expense.food', name: '먹는 돈', canonicalName: '식비' });
    expect(food.data.name).toBe('식비');
  });

  it('saving the canonical name back clears the rename', async () => {
    await service.update(USER, taxi.data.id, { name: '카카오택시' });
    const updated = await service.update(USER, taxi.data.id, { name: '택시' });
    expect(updated).toMatchObject({ name: '택시', isCustomized: false });
    expect(preferences.has(prefKey(USER, taxi.data.id))).toBe(false);
  });

  it('resets a system category to its canonical name, icon and color', async () => {
    await service.update(USER, taxi.data.id, { name: '카카오택시', icon: 'local_taxi', color: '#ED5564' });
    await service.update(OTHER, taxi.data.id, { name: '이동' });

    const reset = await service.resetPreference(USER, taxi.data.id);
    expect(reset).toMatchObject({ id: taxi.data.id, name: '택시', icon: null, color: null, isCustomized: false });
    expect(UserCategoryPreference.destroy).toHaveBeenCalledWith({ where: { userId: USER, categoryId: taxi.data.id } });
    // Only the caller's override goes.
    expect(preferences.get(prefKey(OTHER, taxi.data.id))?.data.displayName).toBe('이동');
  });

  it.each([
    ['reorder', { sortOrder: 1 }],
    ['re-parent', { parentCategoryId: 'core.expense.food' }],
    ['deactivate', { isActive: false }],
    ['rename while re-parenting', { name: '이동', parentCategoryId: 'core.expense.food' }],
  ])('rejects a system category %s with 403 and leaves it as it was', async (_label, patch) => {
    const before = { ...taxi.data };
    await expect(service.update(USER, taxi.data.id, patch)).rejects.toMatchObject({ code: 'SYSTEM_CATEGORY_IMMUTABLE', status: 403 });
    expect(taxi.update).not.toHaveBeenCalled();
    expect(taxi.data).toEqual(before);
    expect(preferences.size).toBe(0);
    expectNoCopy();
  });

  it('rejects deleting a system category and keeps it active', async () => {
    await expect(service.remove(USER, food.data.id)).rejects.toMatchObject({ code: 'SYSTEM_CATEGORY_IMMUTABLE', status: 403 });
    expect(food.data.isActive).toBe(true);
    expect(food.update).not.toHaveBeenCalled();
    expectNoCopy();
  });

  it('renames a custom category in place', async () => {
    const updated = await service.update(USER, custom.data.id, { name: '야식·간식' });
    expect(updated).toMatchObject({ id: 'custom-1', name: '야식·간식', canonicalName: '야식·간식', parentCategoryId: 'core.expense.food', isCustom: true });
    expect(custom.data.name).toBe('야식·간식');
    expect(preferences.size).toBe(0);
    expectNoCopy();
  });

  it("keeps a custom category's icon and color in the preference table", async () => {
    const updated = await service.update(USER, custom.data.id, { icon: 'pets_outlined', color: '#FFCE55' });
    expect(updated).toMatchObject({ id: 'custom-1', name: '야식', icon: 'pets_outlined', color: '#FFCE55' });
    expect(custom.data).not.toHaveProperty('icon');
    expect(preferences.get(prefKey(USER, 'custom-1'))?.data).toMatchObject({ displayName: null, icon: 'pets_outlined', color: '#FFCE55' });
  });

  it('saves the icon and color picked when adding a category', async () => {
    const created = await service.create(USER, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.food', icon: 'pets_outlined', color: '#00AE76' });
    expect(created).toMatchObject({ name: '반려동물', icon: 'pets_outlined', color: '#00AE76', isCustom: true });
    expect((Category.create as jest.Mock).mock.calls[0][0]).not.toHaveProperty('icon');
  });

  it('deletes a custom category by deactivating it', async () => {
    await service.remove(USER, custom.data.id);
    expect(custom.data.isActive).toBe(false);
    expect(rows.has('custom-1')).toBe(true);
    expectNoCopy();
  });

  it("does not let a user touch another user's category", async () => {
    row({ id: 'other-1', ownerUserId: OTHER, name: '남의 것', type: 'EXPENSE' });
    (Category.findOne as jest.Mock).mockImplementationOnce(async () => null);
    await expect(service.update(USER, 'other-1', { name: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses another user's custom category even if the lookup returns it", async () => {
    const theirs = row({ id: 'other-2', ownerUserId: OTHER, name: '남의 것', type: 'EXPENSE' });
    await expect(service.update(USER, 'other-2', { name: 'x', icon: 'pets_outlined' })).rejects.toMatchObject({ status: 404 });
    expect(theirs.data.name).toBe('남의 것');
    expect(preferences.size).toBe(0);
  });

  it('auto-categorisation keeps the canonical id after a rename', async () => {
    await service.update(USER, taxi.data.id, { name: '이동', icon: 'local_taxi' });
    const parsed = parseNotification({
      packageName: 'com.shcard.smartpay',
      title: '[신한체크승인]',
      content: '홍*동 12,000원(일시불) 08/31 23:10 카카오택시 잔액 150,000원',
      timestamp: Date.parse('2026-08-31T23:10:00+09:00'),
    });
    expect(parsed.categoryId).toBe('core.expense.transport.taxi');
    await expect(service.resolveForUser(USER, parsed.categoryId!)).resolves.toBe('core.expense.transport.taxi');
  });

  it('answers 503 (not 500) to a system rename before the table exists, writing nothing', async () => {
    (UserCategoryPreference.findOne as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { parent: { code: '42P01' } }));
    const before = { ...taxi.data };
    await expect(service.update(USER, taxi.data.id, { name: '카카오택시' })).rejects.toMatchObject({ code: 'CATEGORY_PREFERENCE_UNAVAILABLE', status: 503 });
    expect(taxi.data).toEqual(before);
  });

  it('still adds a custom category before the table exists, without its icon', async () => {
    (UserCategoryPreference.findOne as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { parent: { code: '42P01' } }));
    (UserCategoryPreference.findAll as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { parent: { code: '42P01' } }));
    const created = await service.create(USER, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.food', icon: 'pets_outlined' });
    expect(created).toMatchObject({ name: '반려동물', icon: null });
  });

  it('lists canonical values when the preference table does not exist yet', async () => {
    (UserCategoryPreference.findAll as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { parent: { code: '42P01' } }));
    const listed = (await service.list(USER)).find((c: any) => c.id === taxi.data.id);
    expect(listed).toMatchObject({ name: '택시', canonicalName: '택시', icon: null, isCustomized: false });
  });
});

// P0-04: a custom EXPENSE category is always a 소분류 of one of the 10 지출
// 대분류 the budget plan allocates to, so its spending can never bypass Home.
describe('CategoryService custom EXPENSE parent rule', () => {
  let service: CategoryService;
  let custom: any;

  beforeEach(() => {
    rows.clear();
    preferences.clear();
    jest.clearAllMocks();
    service = new CategoryService();
    row({ id: 'core.expense.food', ownerUserId: null, name: '식비', type: 'EXPENSE' });
    row({ id: 'core.expense.transport', ownerUserId: null, name: '교통', type: 'EXPENSE' });
    row({ id: 'core.expense.finance', ownerUserId: null, name: '금융', type: 'EXPENSE', isActive: false });
    row({ id: 'core.expense.food.meal', ownerUserId: null, name: '식사', type: 'EXPENSE', parentCategoryId: 'core.expense.food' });
    row({ id: 'core.saving', ownerUserId: null, name: '저축', type: 'SAVING', purposeType: 'SAVING' });
    row({ id: 'core.income', ownerUserId: null, name: '수입', type: 'INCOME' });
    custom = row({ id: 'custom-1', ownerUserId: USER, name: '야식', type: 'EXPENSE', parentCategoryId: 'core.expense.food' });
  });

  it.each([
    ['no parent', undefined],
    ['parent null', null],
    ['a custom category as parent', 'custom-1'],
    ['a 소분류 as parent', 'core.expense.food.meal'],
    ['a retired system 대분류', 'core.expense.finance'],
    ['a non-expense root', 'core.saving'],
    ['an unknown id', 'nope'],
  ])('rejects a custom EXPENSE category with %s', async (_label, parentCategoryId) => {
    await expect(service.create(USER, { name: '내 대분류', type: 'EXPENSE', parentCategoryId: parentCategoryId as any })).rejects.toMatchObject({ code: 'EXPENSE_CATEGORY_PARENT_REQUIRED', status: 400 });
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('creates a custom EXPENSE category under an official 지출 대분류', async () => {
    const created = await service.create(USER, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.food' });
    expect(created).toMatchObject({ name: '반려동물', parentCategoryId: 'core.expense.food', isCustom: true });
  });

  it('rejects moving a custom EXPENSE category to the top level or under a non-budget parent', async () => {
    await expect(service.update(USER, 'custom-1', { parentCategoryId: null })).rejects.toMatchObject({ code: 'EXPENSE_CATEGORY_PARENT_REQUIRED' });
    await expect(service.update(USER, 'custom-1', { parentCategoryId: 'core.expense.finance' })).rejects.toMatchObject({ code: 'EXPENSE_CATEGORY_PARENT_REQUIRED' });
    expect(custom.data.parentCategoryId).toBe('core.expense.food');
  });

  it('moves a custom EXPENSE category between official 대분류', async () => {
    await service.update(USER, 'custom-1', { parentCategoryId: 'core.expense.transport' });
    expect(custom.data.parentCategoryId).toBe('core.expense.transport');
  });

  it('still renames a legacy custom EXPENSE root without demanding a parent', async () => {
    const legacy = row({ id: 'legacy-root', ownerUserId: USER, name: '옛 대분류', type: 'EXPENSE', parentCategoryId: null });
    await service.update(USER, 'legacy-root', { name: '새 이름' });
    expect(legacy.data).toMatchObject({ name: '새 이름', parentCategoryId: null });
  });

  it('leaves INCOME categories as they were', async () => {
    const created = await service.create(USER, { name: '부수입', type: 'INCOME', parentCategoryId: 'core.income' });
    expect(created).toMatchObject({ parentCategoryId: 'core.income' });
  });
});

describe('categoryPatchSchema', () => {
  it('accepts name, icon and color and drops a userId from the body', () => {
    expect(categoryPatchSchema.parse({ name: ' 카카오택시 ', icon: 'local_taxi', color: '#ed5564', userId: OTHER })).toEqual({ name: '카카오택시', icon: 'local_taxi', color: '#ED5564' });
  });

  it('accepts null to clear an icon or color', () => {
    expect(categoryPatchSchema.parse({ icon: null })).toEqual({ icon: null });
  });

  it.each([
    [{ name: '   ' }],
    [{ color: 'red' }],
    [{ icon: 'Bad Icon!' }],
    [{}],
  ])('rejects %j', (body) => {
    expect(() => categoryPatchSchema.parse(body)).toThrow();
  });
});
