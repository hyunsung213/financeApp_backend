import { deleteUsers, registerUser, startServer, type TestUser } from './helpers/apiHarness';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN } from '../src/constants/budgetPlan';
import { BudgetCycle, BudgetCycleAllocation, UserFinanceSetting } from '../src/models';
import { BudgetCycleService } from '../src/services/budgetCycleService';
import { dateOnly } from '../src/utils/dates';

// Concurrent income writes on one cycle must all land in the snapshot
// (audit P0-06: 1000 + 200 + 300 ended as 1300). Opt-in: RUN_DB_TESTS=1.
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(180_000);

describeDb('concurrent income updates', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let call: Awaited<ReturnType<typeof startServer>>['call'];
  let user: TestUser;
  let incomeCategoryId: string;
  let cycleId: string;
  const today = dateOnly(new Date());
  const SALARY = 1_000_000;
  const cycles = new BudgetCycleService();

  const snapshot = async () => Number((await BudgetCycle.findByPk(cycleId)).salarySnapshot);
  const allocationTotal = async () => (await BudgetCycleAllocation.findAll({ where: { budgetCycleId: cycleId } })).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
  const income = (amount: number, title: string) => call('POST', '/api/transactions', user.token, { categoryId: incomeCategoryId, type: 'INCOME', amount, occurredAt: today, merchantOrTitle: title });
  const expectConsistent = async () => {
    const applied = await cycles.additionalIncomeAmount(cycleId);
    expect(await snapshot()).toBe(SALARY + applied);
    expect(await allocationTotal()).toBe(SALARY + applied);
    expect(await BudgetCycleAllocation.count({ where: { budgetCycleId: cycleId } })).toBe(12);
    return applied;
  };

  beforeAll(async () => {
    server = await startServer(); call = server.call;
    user = registerUser('income-race');
    await call('PUT', '/api/finance/setting', user.token, { salaryAmount: SALARY, salaryDay: ((Number(today.slice(8, 10)) + 15) % 28) + 1, reportingStartDay: 1 });
    await call('PUT', '/api/finance/budget-plan', user.token, { allocations: DEFAULT_BUDGET_PLAN });
    incomeCategoryId = (await call('POST', '/api/categories', user.token, { name: '부수입', type: 'INCOME', parentCategoryId: 'core.income' })).data.id;
    cycleId = (await BudgetCycle.findOne({ where: { userId: user.id, status: 'ACTIVE' } })).id;
  });

  afterAll(async () => { await deleteUsers([user.id]); await server.close(); await sequelize.close(); });

  it('five incomes saved at the same time all end up in the budget', async () => {
    const amounts = [100, 200, 300, 400, 500];
    const results = await Promise.all(amounts.map((amount) => income(amount, `동시 수입 ${amount}`)));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await snapshot()).toBe(SALARY + 1500);
    expect(await expectConsistent()).toBe(1500);
    expect((await call('GET', '/api/home', user.token)).data.budget.additionalIncomeAmount).toBe(1500);
  });

  it('an income write waits for the user\'s cycle lock instead of overwriting a stale snapshot', async () => {
    // Hold the per-user lock (finance setting row) in a transaction of our
    // own: the income must block until it is released, then apply on top of
    // whatever was committed meanwhile.
    const holder = await sequelize.transaction();
    await UserFinanceSetting.findByPk(user.id, { transaction: holder, lock: true });
    const before = await snapshot();
    let settled = false;
    const pending = cycles.addAdditionalIncome(cycleId, 1000).then((result) => { settled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(settled).toBe(false);
    await BudgetCycle.update({ salarySnapshot: String(before + 7) }, { where: { id: cycleId }, transaction: holder });
    await holder.commit();
    await pending;
    expect(settled).toBe(true);
    expect(await snapshot()).toBe(before + 7 + 1000);
    // restore so the consistency invariant (snapshot = salary + incomes) holds again
    await cycles.reverseAdditionalIncome(cycleId, 1007);
    await expectConsistent();
  });

  it('simultaneous edit, delete and create of incomes leave the snapshot equal to the remaining incomes', async () => {
    const items = (await call('GET', '/api/transactions?type=INCOME&limit=100', user.token)).data.items;
    const [edit, remove] = items;
    const results = await Promise.all([
      call('PATCH', `/api/transactions/${edit.id}`, user.token, { amount: 999 }),
      call('DELETE', `/api/transactions/${remove.id}`, user.token),
      income(250, '추가 수입'),
      call('PATCH', `/api/transactions/${items[2].id}`, user.token, { memo: '메모만 수정' }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200, 201, 200]);
    const applied = await expectConsistent();
    expect(applied).toBe(1500 - Number(edit.amount) + 999 - Number(remove.amount) + 250);
  });

  it('a budget plan change racing an income keeps 12 snapshot rows that add up to the snapshot', async () => {
    const plan = DEFAULT_BUDGET_PLAN.map((item) => item.categoryId === 'core.saving' ? { ...item, percentage: 25 } : item.categoryId === 'core.expense.fixed' ? { ...item, percentage: 20 } : item);
    const results = await Promise.all([
      call('PUT', '/api/finance/budget-plan', user.token, { allocations: plan }),
      income(333, '플랜 변경 중 수입'),
      call('PUT', '/api/finance/setting', user.token, { salaryAmount: SALARY, salaryDay: ((Number(today.slice(8, 10)) + 15) % 28) + 1, reportingStartDay: 1 }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 201, 200]);
    await expectConsistent();
    const saving = await BudgetCycleAllocation.findOne({ where: { budgetCycleId: cycleId, categoryId: 'core.saving' } });
    expect(Number(saving.amount)).toBe(Math.floor((await snapshot()) * 25 / 100));
  });
});
