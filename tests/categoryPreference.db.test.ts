import { randomUUID } from 'crypto';
import { sequelize } from '../src/config/database';
import { CATEGORY_IDS } from '../src/constants/categoryCatalog';
import { BudgetAllocation, Category, Transaction, User, UserCategoryPreference } from '../src/models';
import { CategoryService } from '../src/services/categoryService';

// Runs against DATABASE_URL once the UserCategoryPreference migration is
// applied, so it is opt-in: RUN_DB_TESTS=1 npm test. Every case uses its own
// throwaway users, deleted (with their preference rows, by cascade) after.
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

// The shared DB is remote; round trips can take seconds each.
jest.setTimeout(60_000);

const TAXI = CATEGORY_IDS.EXPENSE_TRANSPORT_TAXI;
const createdUsers: string[] = [];

async function createUser() {
  const userId = randomUUID();
  createdUsers.push(userId);
  await User.create({ id: userId, email: `category-pref-${userId}@example.invalid` });
  return userId;
}

describeDb('UserCategoryPreference (database)', () => {
  const service = new CategoryService();

  // Checksums of the shared rows this feature must never write.
  const fingerprint = async () => {
    const [rows] = await sequelize.query(`select
      (select md5(string_agg(id||'|'||name||'|'||coalesce("parentCategoryId",'')||'|'||"isActive"||'|'||"sortOrder"||'|'||coalesce("ownerUserId"::text,''), ',' order by id)) from "Category") category,
      (select md5(string_agg(id||'|'||"categoryId", ',' order by id)) from "Transaction") tx,
      (select md5(string_agg(id||'|'||coalesce("categoryId",'')||'|'||percentage, ',' order by id)) from "BudgetAllocation") alloc`);
    return rows[0];
  };
  let before: unknown;

  beforeAll(async () => {
    before = await fingerprint();
  });

  afterAll(async () => {
    await User.destroy({ where: { id: createdUsers } });
    await sequelize.close();
  });

  it("personalises a system category for one user without touching the shared row", async () => {
    const [userA, userB] = [await createUser(), await createUser()];
    const before = (await Category.findByPk(TAXI))!.toJSON();

    const updated = await service.update(userA, TAXI, { name: '카카오택시', icon: 'local_taxi', color: '#ED5564' });
    expect(updated).toMatchObject({ id: TAXI, name: '카카오택시', canonicalName: before.name, icon: 'local_taxi', color: '#ED5564' });

    const after = (await Category.findByPk(TAXI))!.toJSON();
    expect(after).toMatchObject({ id: before.id, name: before.name, parentCategoryId: before.parentCategoryId, isActive: before.isActive, sortOrder: before.sortOrder });

    const forB = (await service.list(userB)).find((c: any) => c.id === TAXI);
    expect(forB).toMatchObject({ name: before.name, icon: null, color: null, isCustomized: false });

    await service.resetPreference(userA, TAXI);
    expect(await UserCategoryPreference.count({ where: { userId: userA } })).toBe(0);
    expect((await service.list(userA)).find((c: any) => c.id === TAXI)).toMatchObject({ name: before.name, isCustomized: false });
  });

  it('rejects deleting a system category', async () => {
    const userId = await createUser();
    await expect(service.remove(userId, TAXI)).rejects.toMatchObject({ status: 403 });
    expect((await Category.findByPk(TAXI))!.get('isActive')).toBe(true);
  });

  it('rejects an invalid color and unknown users or categories at the database', async () => {
    const userId = await createUser();
    await expect(UserCategoryPreference.create({ userId, categoryId: TAXI, color: 'red' })).rejects.toThrow(/UserCategoryPreference_color_valid/);
    await expect(UserCategoryPreference.create({ userId, categoryId: 'no.such.category', icon: 'pets_outlined' })).rejects.toThrow(/UserCategoryPreference_categoryId_fkey/);
    await expect(UserCategoryPreference.create({ userId: randomUUID(), categoryId: TAXI, icon: 'pets_outlined' })).rejects.toThrow(/UserCategoryPreference_userId_fkey/);
    expect(await UserCategoryPreference.count({ where: { userId } })).toBe(0);
  });

  it("removes a user's preferences when the user is deleted", async () => {
    const userId = await createUser();
    await service.update(userId, TAXI, { name: '이동' });
    expect(await UserCategoryPreference.count({ where: { userId } })).toBe(1);
    await User.destroy({ where: { id: userId } });
    expect(await UserCategoryPreference.count({ where: { userId } })).toBe(0);
  });

  it('a custom category renames in place and keeps icon/color as a preference', async () => {
    const userId = await createUser();
    const created = await service.create(userId, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.living', icon: 'pets_outlined', color: '#00AE76' });
    await service.update(userId, created.id, { name: '반려견', color: '#ED5564' });
    const listed = (await service.list(userId)).find((c: any) => c.id === created.id);
    expect(listed).toMatchObject({ name: '반려견', canonicalName: '반려견', icon: 'pets_outlined', color: '#ED5564', isCustom: true });
    await service.remove(userId, created.id);
    expect((await Category.findByPk(created.id))!.get('isActive')).toBe(false);
    expect((await service.list(userId)).some((c: any) => c.id === created.id)).toBe(false);

    // Nothing references the test category, so it goes with its user.
    expect(await Transaction.count({ where: { categoryId: created.id } })).toBe(0);
    await User.destroy({ where: { id: userId } });
    expect(await Category.findByPk(created.id)).toBeNull();
  });

  it('leaves the shared Category, Transaction and BudgetAllocation rows as they were', async () => {
    expect(await fingerprint()).toEqual(before);
    expect(await Transaction.count({ where: { userId: createdUsers } })).toBe(0);
    expect(await BudgetAllocation.count({ where: { userId: createdUsers } })).toBe(0);
  });
});
