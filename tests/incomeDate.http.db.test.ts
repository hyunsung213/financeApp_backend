import { deleteUsers, registerUser, startServer, type TestUser } from './helpers/apiHarness';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN } from '../src/constants/budgetPlan';
import { BudgetCycle } from '../src/models';
import { addDays, dateOnly } from '../src/utils/dates';

// Income counts from the day it occurs: past and today's income raise the
// current cycle budget, future-dated income is rejected (audit P0-05).
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

describeDb('income effective date (HTTP)', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let call: Awaited<ReturnType<typeof startServer>>['call'];
  let user: TestUser;
  let incomeCategoryId: string;
  const now = new Date();
  const today = dateOnly(now);
  const tomorrow = dateOnly(addDays(now, 1));
  const SALARY = 2_000_000;
  const salaryAmountOnHome = async () => (await call('GET', '/api/home', user.token)).data.budget;
  const activeCycle = () => BudgetCycle.findOne({ where: { userId: user.id, status: 'ACTIVE' } });

  beforeAll(async () => {
    server = await startServer(); call = server.call;
    user = registerUser('income');
    // A payday ~2 weeks ago so the cycle has past days to record income on.
    const salaryDay = ((Number(today.slice(8, 10)) + 15) % 28) + 1;
    await call('PUT', '/api/finance/setting', user.token, { salaryAmount: SALARY, salaryDay, reportingStartDay: 1 });
    await call('PUT', '/api/finance/budget-plan', user.token, { allocations: DEFAULT_BUDGET_PLAN });
    incomeCategoryId = (await call('POST', '/api/categories', user.token, { name: '부수입', type: 'INCOME', parentCategoryId: 'core.income' })).data.id;
  });

  afterAll(async () => { await deleteUsers([user.id]); await server.close(); await sequelize.close(); });

  it('a future-dated additional income is rejected and does not touch the budget', async () => {
    const before = await salaryAmountOnHome();
    const res = await call('POST', '/api/transactions', user.token, { categoryId: incomeCategoryId, type: 'INCOME', amount: 100_000, occurredAt: tomorrow, merchantOrTitle: '미래 수입' });
    expect([res.status, res.error?.code]).toEqual([400, 'FUTURE_INCOME_NOT_ALLOWED']);
    const far = await call('POST', '/api/transactions', user.token, { categoryId: incomeCategoryId, type: 'INCOME', amount: 100_000, occurredAt: '2099-01-01', merchantOrTitle: '미래 수입' });
    expect(far.status).toBe(400);
    expect(await salaryAmountOnHome()).toEqual(before);
    expect((await call('GET', '/api/transactions?type=INCOME', user.token)).data.total).toBe(0);
  });

  it('today\'s additional income raises the current budget immediately', async () => {
    const res = await call('POST', '/api/transactions', user.token, { categoryId: incomeCategoryId, type: 'INCOME', amount: 100_000, occurredAt: today, merchantOrTitle: '오늘 수입' });
    expect(res.status).toBe(201);
    const budget = await salaryAmountOnHome();
    expect([budget.salaryAmount, budget.additionalIncomeAmount]).toEqual([SALARY + 100_000, 100_000]);
  });

  it('a past income inside the cycle counts as well', async () => {
    const cycle = await activeCycle();
    const res = await call('POST', '/api/transactions', user.token, { categoryId: incomeCategoryId, type: 'INCOME', amount: 50_000, occurredAt: String(cycle.startDate), merchantOrTitle: '지난 수입' });
    expect(res.status).toBe(201);
    expect((await salaryAmountOnHome()).additionalIncomeAmount).toBe(150_000);
  });

  it('an income cannot be moved into the future, and an expense cannot become a future income', async () => {
    const incomeId = (await call('GET', '/api/transactions?type=INCOME', user.token)).data.items[0].id;
    const moved = await call('PATCH', `/api/transactions/${incomeId}`, user.token, { occurredAt: tomorrow });
    expect([moved.status, moved.error?.code]).toEqual([400, 'FUTURE_INCOME_NOT_ALLOWED']);
    const expense = (await call('POST', '/api/transactions', user.token, { categoryId: 'core.expense.food.meal', type: 'EXPENSE', amount: 5000, occurredAt: tomorrow, merchantOrTitle: '내일 점심' })).data;
    const turned = await call('PATCH', `/api/transactions/${expense.id}`, user.token, { type: 'INCOME', categoryId: incomeCategoryId });
    expect(turned.status).toBe(400);
    expect((await salaryAmountOnHome()).additionalIncomeAmount).toBe(150_000);
  });

  it('a future-dated salary is rejected and the active cycle is left alone', async () => {
    const before = (await activeCycle()).toJSON();
    const res = await call('POST', '/api/transactions', user.token, { categoryId: 'core.income.salary', type: 'INCOME', amount: SALARY, occurredAt: tomorrow, merchantOrTitle: '다음 달 월급' });
    expect([res.status, res.error?.code]).toEqual([400, 'FUTURE_INCOME_NOT_ALLOWED']);
    const after = (await activeCycle()).toJSON();
    expect([after.id, after.startDate, after.endDate, after.status, after.salarySnapshot]).toEqual([before.id, before.startDate, before.endDate, 'ACTIVE', before.salarySnapshot]);
    expect(await BudgetCycle.count({ where: { userId: user.id } })).toBe(1);
  });

  it('a salary dated today restarts the cycle from today', async () => {
    const res = await call('POST', '/api/transactions', user.token, { categoryId: 'core.income.salary', type: 'INCOME', amount: 2_100_000, occurredAt: today, merchantOrTitle: '월급' });
    expect(res.status).toBe(201);
    const active = await activeCycle();
    expect([String(active.startDate), Number(active.salarySnapshot)]).toEqual([today, 2_100_000]);
    expect(await BudgetCycle.count({ where: { userId: user.id, status: 'ACTIVE' } })).toBe(1);
  });
});
