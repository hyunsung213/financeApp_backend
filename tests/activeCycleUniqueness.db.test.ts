import { UniqueConstraintError } from 'sequelize';
import { deleteUsers, registerUser, startServer, type TestUser } from './helpers/apiHarness';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN } from '../src/constants/budgetPlan';
import { BudgetCycle } from '../src/models';
import { BudgetCycleService } from '../src/services/budgetCycleService';
import { addDays, dateOnly, parseDateOnly } from '../src/utils/dates';
import { newId } from '../src/utils/ids';

// One ACTIVE cycle per user, enforced both by the per-user lock in the
// service and by the partial unique index in the database (audit P0-07).
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(180_000);

describeDb('single ACTIVE budget cycle per user', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let call: Awaited<ReturnType<typeof startServer>>['call'];
  const users: TestUser[] = [];
  const today = dateOnly(new Date());
  const salaryDay = ((Number(today.slice(8, 10)) + 15) % 28) + 1;

  async function onboard(label: string) {
    const user = registerUser(label); users.push(user);
    await call('PUT', '/api/finance/setting', user.token, { salaryAmount: 2_000_000, salaryDay, reportingStartDay: 1 });
    await call('PUT', '/api/finance/budget-plan', user.token, { allocations: DEFAULT_BUDGET_PLAN });
    return user;
  }
  const activeCycles = (userId: string) => BudgetCycle.findAll({ where: { userId, status: 'ACTIVE' } });
  const allCycles = (userId: string) => BudgetCycle.findAll({ where: { userId }, order: [['startDate', 'ASC']] });
  const salary = (user: TestUser, occurredAt: string, amount = 2_000_000) => call('POST', '/api/transactions', user.token, { categoryId: 'core.income.salary', type: 'INCOME', amount, occurredAt, merchantOrTitle: '월급' });

  beforeAll(async () => { server = await startServer(); call = server.call; });
  afterAll(async () => { await deleteUsers(users.map((user) => user.id)); await server.close(); await sequelize.close(); });

  it('the database rejects a second ACTIVE cycle for the same user', async () => {
    const user = await onboard('active-db');
    const [active] = await activeCycles(user.id);
    const insert = BudgetCycle.create({ id: newId(), userId: user.id, startDate: '2099-01-01', endDate: '2099-01-31', salarySnapshot: '1', status: 'ACTIVE' });
    await expect(insert).rejects.toBeInstanceOf(UniqueConstraintError);
    await expect(insert).rejects.toMatchObject({ parent: { constraint: 'budget_cycle_user_active_unique' } });
    expect((await activeCycles(user.id)).map((cycle: any) => cycle.id)).toEqual([active.id]);
    // a CLOSED cycle with another start date is still allowed
    await BudgetCycle.create({ id: newId(), userId: user.id, startDate: '2099-01-01', endDate: '2099-01-31', salarySnapshot: '1', status: 'CLOSED' });
  });

  it('salary entries with different dates sent at the same time leave exactly one ACTIVE cycle', async () => {
    const user = await onboard('active-race');
    const [first] = await allCycles(user.id);
    const start = parseDateOnly(String(first.startDate));
    const dates = [1, 2, 3, 4].map((offset) => dateOnly(addDays(start, offset)));
    const results = await Promise.all(dates.map((date) => salary(user, date)));
    // Each request either started/moved the cycle or was refused because a
    // later salary already started one; never two ACTIVE cycles.
    expect(results.every((result) => result.status === 201 || (result.status === 400 && result.error.code === 'INVALID_SALARY_DATE'))).toBe(true);
    expect(results.some((result) => result.status === 201)).toBe(true);
    const active = await activeCycles(user.id);
    expect(active).toHaveLength(1);
    const cycles = await allCycles(user.id);
    for (let index = 1; index < cycles.length; index++) {
      expect(String(cycles[index - 1].endDate) < String(cycles[index].startDate)).toBe(true);
      expect(cycles[index - 1].status).toBe('CLOSED');
    }
    expect(String(active[0].startDate)).toBe(String(cycles[cycles.length - 1].startDate));
  });

  it('the same salary date sent six times at once re-enters one cycle', async () => {
    const user = await onboard('active-same');
    const results = await Promise.all(Array.from({ length: 6 }, () => salary(user, today, 2_200_000)));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201, 201, 201, 201]);
    const active = await activeCycles(user.id);
    expect(active).toHaveLength(1);
    expect([String(active[0].startDate), Number(active[0].salarySnapshot)]).toEqual([today, 2_200_000]);
  });

  it('a salary restart racing a lazy rollover still ends with one ACTIVE cycle', async () => {
    const user = await onboard('active-rollover');
    const [first] = await allCycles(user.id);
    const results = await Promise.all([
      ...Array.from({ length: 3 }, () => new BudgetCycleService().ensureCurrentCycle(user.id)),
      salary(user, dateOnly(addDays(parseDateOnly(String(first.startDate)), 5))),
      new BudgetCycleService().applyPlanToActiveCycle(user.id),
    ]);
    expect(results[3]).toMatchObject({ status: 201 });
    expect(await activeCycles(user.id)).toHaveLength(1);
  });
});
