import { deleteUsers, registerUser, startServer, type TestUser } from './helpers/apiHarness';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN } from '../src/constants/budgetPlan';
import { Category } from '../src/models';
import { dateOnly } from '../src/utils/dates';

// P0-04: every confirmed expense counts against one 지출 대분류 budget on Home.
// A custom 지출 대분류 cannot be created, and moving a transaction between
// official and custom categories moves its amount between budgets.
// Opt-in: RUN_DB_TESTS=1 npm test (runs against DATABASE_URL).
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

describeDb('expense budget coverage (HTTP)', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let call: Awaited<ReturnType<typeof startServer>>['call'];
  let user: TestUser;
  const today = dateOnly(new Date());
  let pet: string; // custom 소분류 under 생활

  const home = async () => (await call('GET', '/api/home', user.token)).data;
  const spent = async (categoryId: string) => (await home()).budget.categories.find((category: any) => category.categoryId === categoryId).spentAmount;
  const spend = async (categoryId: string, amount: number) => {
    const res = await call('POST', '/api/transactions', user.token, { categoryId, type: 'EXPENSE', amount, occurredAt: today, merchantOrTitle: 'p0-04' });
    expect(res.status).toBe(201);
    return res.data.id as string;
  };

  beforeAll(async () => {
    server = await startServer(); call = server.call;
    user = registerUser('p004');
    expect((await call('PUT', '/api/finance/setting', user.token, { salaryAmount: 3_000_000, salaryDay: 25, reportingStartDay: 1 })).status).toBe(200);
    expect((await call('PUT', '/api/finance/budget-plan', user.token, { allocations: DEFAULT_BUDGET_PLAN })).status).toBe(200);
    const created = await call('POST', '/api/categories', user.token, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.living' });
    expect(created.status).toBe(201);
    pet = created.data.id;
  });

  afterAll(async () => { await deleteUsers([user.id]); await server.close(); await sequelize.close(); });

  it('an expense on an official 소분류 reduces its 대분류 budget and today\'s money', async () => {
    const before = await home();
    await spend('core.expense.food.meal', 12_000);
    const after = await home();
    expect(after.budget.remainingUsableAmount).toBe(before.budget.remainingUsableAmount - 12_000);
    expect(after.today.spentAmount).toBe(before.today.spentAmount + 12_000);
    expect(await spent('core.expense.food')).toBe(12_000);
  });

  it('an expense on a custom 소분류 reduces its parent 대분류 budget', async () => {
    const before = await home();
    await spend(pet, 30_000);
    const after = await home();
    expect(await spent('core.expense.living')).toBe(30_000);
    expect(after.budget.remainingUsableAmount).toBe(before.budget.remainingUsableAmount - 30_000);
  });

  it('a custom 지출 대분류 is rejected by the API and by the database', async () => {
    for (const body of [{ name: '내 대분류', type: 'EXPENSE' }, { name: '내 대분류', type: 'EXPENSE', parentCategoryId: null }, { name: '손자', type: 'EXPENSE', parentCategoryId: pet }]) {
      const res = await call('POST', '/api/categories', user.token, body);
      expect([res.status, res.error?.code]).toEqual([400, 'EXPENSE_CATEGORY_PARENT_REQUIRED']);
    }
    const moved = await call('PATCH', `/api/categories/${pet}`, user.token, { parentCategoryId: null });
    expect([moved.status, moved.error?.code]).toEqual([400, 'EXPENSE_CATEGORY_PARENT_REQUIRED']);
    expect((await call('GET', '/api/categories', user.token)).data.filter((c: any) => c.isCustom && c.type === 'EXPENSE' && !c.parentCategoryId)).toEqual([]);
    await expect(Category.create({ id: `p004-${user.id}`, ownerUserId: user.id, name: 'raw root', type: 'EXPENSE', purposeType: 'GENERAL', parentCategoryId: null }))
      .rejects.toMatchObject({ parent: { code: '23514' } });
  });

  it('changing a transaction between official and custom categories moves the amount between budgets', async () => {
    const id = await spend('core.expense.transport.taxi', 7_000);
    const total = (await home()).budget.variableExpenseAmount;
    expect(await spent('core.expense.transport')).toBe(7_000);

    expect((await call('PATCH', `/api/transactions/${id}`, user.token, { categoryId: pet })).status).toBe(200);
    expect([await spent('core.expense.transport'), await spent('core.expense.living')]).toEqual([0, 37_000]);
    expect((await home()).budget.variableExpenseAmount).toBe(total);

    expect((await call('PATCH', `/api/transactions/${id}`, user.token, { categoryId: 'core.expense.transport.taxi' })).status).toBe(200);
    expect([await spent('core.expense.transport'), await spent('core.expense.living')]).toEqual([7_000, 30_000]);
    expect((await home()).budget.variableExpenseAmount).toBe(total);
  });

  it('deleting a custom category keeps its transactions in the parent budget; deleting a transaction restores it', async () => {
    const id = await spend(pet, 5_000);
    expect(await spent('core.expense.living')).toBe(35_000);
    expect((await call('DELETE', `/api/categories/${pet}`, user.token)).status).toBe(200);
    expect(await spent('core.expense.living')).toBe(35_000);
    // A deleted category cannot take new spending.
    expect((await call('POST', '/api/transactions', user.token, { categoryId: pet, type: 'EXPENSE', amount: 1, occurredAt: today, merchantOrTitle: 'x' })).status).toBe(400);

    const before = await home();
    expect((await call('DELETE', `/api/transactions/${id}`, user.token)).status).toBe(200);
    const after = await home();
    expect(await spent('core.expense.living')).toBe(30_000);
    expect(after.budget.remainingUsableAmount).toBe(before.budget.remainingUsableAmount + 5_000);
  });

  it('Home spending equals every confirmed expense of the cycle, and the reports agree', async () => {
    const result = await home();
    const categoryTotal = result.budget.categories.reduce((sum: number, category: any) => sum + category.spentAmount, 0);
    expect(categoryTotal).toBe(result.budget.variableExpenseAmount + result.budget.fixedExpenseAmount);
    const summary = (await call('GET', `/api/reports/summary?startDate=${result.cycle.startDate}&endDate=${today}`, user.token)).data;
    expect(summary.expense).toBe(categoryTotal);
    const rows = (await call('GET', `/api/reports/categories?startDate=${result.cycle.startDate}&endDate=${today}`, user.token)).data;
    expect(rows.reduce((sum: number, row: any) => sum + row.amount, 0)).toBe(categoryTotal);
  });
});
