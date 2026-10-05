import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN, allocationTypeForCategory, budgetCategoryName, spendabilityForCategory } from '../src/constants/budgetPlan';
import { home } from '../src/controllers/dashboardController';
import { upsertBudgetPlan, upsertFinanceSetting } from '../src/controllers/financeController';
import { BudgetAllocation, BudgetCycle, BudgetCycleAllocation, Transaction, User, UserFinanceSetting } from '../src/models';
import { BudgetCycleService } from '../src/services/budgetCycleService';
import { ReportService } from '../src/services/reportService';
import { addDays, dateOnly, parseDateOnly } from '../src/utils/dates';
import { newId } from '../src/utils/ids';

// Runs against DATABASE_URL, so it is opt-in: RUN_DB_TESTS=1 npm test.
// Every case uses its own throwaway user, deleted (with its cascade) after.
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

const day = (value: string) => parseDateOnly(value);
const at = (value: string) => new BudgetCycleService(() => day(value));
const createdUsers: string[] = [];

async function createUser(salaryAmount: number, salaryDay: number) {
  const userId = randomUUID();
  createdUsers.push(userId);
  await User.create({ id: userId, email: `rollover-${userId}@example.invalid` });
  await UserFinanceSetting.create({ userId, salaryAmount: String(salaryAmount), salaryDay, reportingStartDay: 1 });
  return userId;
}

async function savePlan(userId: string) {
  await BudgetAllocation.bulkCreate(DEFAULT_BUDGET_PLAN.map((item) => ({
    id: newId(),
    userId,
    categoryId: item.categoryId,
    name: budgetCategoryName(item.categoryId),
    allocationType: allocationTypeForCategory(item.categoryId),
    percentage: item.percentage,
    spendability: spendabilityForCategory(item.categoryId),
    active: true,
  })));
}

const cyclesOf = (userId: string) => BudgetCycle.findAll({ where: { userId }, include: [{ model: BudgetCycleAllocation, as: 'allocations' }], order: [['startDate', 'ASC']] });
const amountOf = (cycle: any, categoryId: string) => Number(cycle.allocations.find((item: any) => item.categoryId === categoryId).amount);
const totalOf = (cycle: any) => cycle.allocations.reduce((sum: number, item: any) => sum + Number(item.amount), 0);

async function callController(handler: (req: any, res: any) => Promise<void>, userId: string, body: unknown) {
  const res: any = { json: jest.fn(), status: jest.fn(() => res) };
  await handler({ authUser: { id: userId }, body }, res);
  return res.json.mock.calls[0][0];
}

async function addIncome(userId: string, cycleId: string, amount: number, occurredAt: string) {
  await Transaction.create({ id: newId(), userId, budgetCycleId: cycleId, categoryId: 'core.income', type: 'INCOME', amount: String(amount), occurredAt, merchantOrTitle: '추가 수입', status: 'CONFIRMED' });
}

describeDb('salary cycle lazy rollover', () => {
  jest.setTimeout(60000);

  afterAll(async () => {
    // BudgetCycleAllocation -> BudgetAllocation does not cascade, so the
    // snapshots go first; the user's delete cascades to the rest.
    if (createdUsers.length) {
      const cycles = await BudgetCycle.findAll({ where: { userId: { [Op.in]: createdUsers } } });
      await BudgetCycleAllocation.destroy({ where: { budgetCycleId: { [Op.in]: cycles.map((cycle: any) => cycle.id) } } });
      await User.destroy({ where: { id: { [Op.in]: createdUsers } } });
    }
    await sequelize.close();
  });

  it('CASE 1/7: payday 1 rolls 09-01~09-30 into 10-01~10-31 from the saved salary and plan, leaving September as it was', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    const september = await at('2025-09-15').ensureCurrentCycle(userId, day('2025-09-15'));
    expect([september.startDate, september.endDate]).toEqual(['2025-09-01', '2025-09-30']);
    const septemberBefore = september.toJSON();

    expect((await at('2025-09-30').ensureCurrentCycle(userId, day('2025-09-30'))).id).toBe(september.id);
    const october = await at('2025-10-01').ensureCurrentCycle(userId, day('2025-10-01'));

    expect([october.startDate, october.endDate, october.status]).toEqual(['2025-10-01', '2025-10-31', 'ACTIVE']);
    expect(Number(october.salarySnapshot)).toBe(2_500_000);
    expect(october.allocations).toHaveLength(12);
    expect(totalOf(october)).toBe(2_500_000);
    expect(amountOf(october, 'core.saving')).toBe(500_000);
    expect(amountOf(october, 'core.expense.food')).toBe(375_000);

    const [closed] = await cyclesOf(userId);
    expect([closed.startDate, closed.endDate, closed.status, closed.salarySnapshot]).toEqual(['2025-09-01', '2025-09-30', 'CLOSED', septemberBefore.salarySnapshot]);
    expect(closed.allocations.map((item: any) => [item.id, item.amount]).sort()).toEqual(septemberBefore.allocations.map((item: any) => [item.id, item.amount]).sort());
  });

  it('CASE 2: payday 25 rolls 09-25~10-24 into 10-25~11-24, and only from 10-25', async () => {
    const userId = await createUser(2_500_000, 25);
    await savePlan(userId);
    const first = await at('2025-09-30').ensureCurrentCycle(userId, day('2025-09-30'));
    expect([first.startDate, first.endDate]).toEqual(['2025-09-25', '2025-10-24']);
    expect((await at('2025-10-24').ensureCurrentCycle(userId, day('2025-10-24'))).id).toBe(first.id);
    // A report range ending in the future must not open the next cycle early.
    expect((await at('2025-10-20').ensureCurrentCycle(userId, day('2025-11-30'))).id).toBe(first.id);
    const next = await at('2025-10-25').ensureCurrentCycle(userId, day('2025-10-25'));
    expect([next.startDate, next.endDate]).toEqual(['2025-10-25', '2025-11-24']);
  });

  it('handles month lengths and catches up on several missed paydays (payday 31)', async () => {
    const userId = await createUser(2_000_000, 31);
    await savePlan(userId);
    await at('2025-01-31').ensureCurrentCycle(userId, day('2025-01-31'));
    await at('2025-04-02').ensureCurrentCycle(userId, day('2025-04-02'));
    const ranges = (await cyclesOf(userId)).map((cycle: any) => [cycle.startDate, cycle.endDate, cycle.status]);
    expect(ranges).toEqual([
      ['2025-01-31', '2025-02-27', 'CLOSED'],
      ['2025-02-28', '2025-03-30', 'CLOSED'],
      ['2025-03-31', '2025-04-29', 'ACTIVE'],
    ]);
  });

  it('CASE 3: Home after the rollover counts down to the next payday instead of awaiting salary', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    await at('2025-09-15').ensureCurrentCycle(userId, day('2025-09-15'));
    const context = await new ReportService().context(userId, day('2025-10-03'));
    expect(context.cycle.startDate).toBe('2025-10-01');
    expect(context.daysUntilSalary).toBe(29);
    expect(dateOnly(context.nextSalaryDate)).toBe('2025-11-01');
    expect(context.result.todayRecommendedAmount).toBe(Math.floor(context.result.usableBudgetAmount / 29));
  });

  it('CASE 4: concurrent first requests after payday create the new cycle once', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    await at('2025-09-15').ensureCurrentCycle(userId, day('2025-09-15'));
    const results = await Promise.all(Array.from({ length: 6 }, () => at('2025-10-01').ensureCurrentCycle(userId, day('2025-10-01'))));
    expect(new Set(results.map((cycle: any) => cycle.id)).size).toBe(1);
    const cycles = await cyclesOf(userId);
    expect(cycles.map((cycle: any) => [cycle.startDate, cycle.status])).toEqual([['2025-09-01', 'CLOSED'], ['2025-10-01', 'ACTIVE']]);
    expect(cycles[1].allocations).toHaveLength(12);
  });

  it('carries over transactions recorded while the old cycle ran past its end, with their additional income', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    const september = await at('2025-09-15').ensureCurrentCycle(userId, day('2025-09-15'));
    await addIncome(userId, september.id, 100_000, '2025-10-02');
    await at('2025-09-15').addAdditionalIncome(september.id, 100_000);
    await Transaction.create({ id: newId(), userId, budgetCycleId: september.id, categoryId: 'core.expense.food.meal', type: 'EXPENSE', amount: '9000', occurredAt: '2025-09-20', merchantOrTitle: '9월 점심' });

    const october = await at('2025-10-03').ensureCurrentCycle(userId, day('2025-10-03'));
    const [closed] = await cyclesOf(userId);
    expect(Number(closed.salarySnapshot)).toBe(2_500_000);
    expect(Number(october.salarySnapshot)).toBe(2_600_000);
    const moved = await Transaction.findAll({ where: { userId }, order: [['occurredAt', 'ASC']] });
    expect(moved.map((item: any) => [item.occurredAt, item.budgetCycleId])).toEqual([['2025-09-20', september.id], ['2025-10-02', october.id]]);
  });

  it('keeps an overdue cycle ACTIVE (awaiting salary) when it cannot be renewed', async () => {
    const userId = await createUser(0, 1);
    await savePlan(userId);
    const september = await at('2025-09-15').ensureCurrentCycle(userId, day('2025-09-15'));
    const context = await new ReportService().context(userId, day('2025-10-03'));
    expect(context.cycle.id).toBe(september.id);
    expect(context.daysUntilSalary).toBe(0);
  });

  // The controllers use the real clock, so these cases start from today's cycle.
  it('CASE 5/6: saving a new salary re-budgets the current cycle and keeps additional income', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    const current = await new BudgetCycleService().ensureCurrentCycle(userId);
    const body = { salaryAmount: 2_600_000, salaryDay: 1, reportingStartDay: 1 };

    await callController(upsertFinanceSetting, userId, body);
    let cycle = (await cyclesOf(userId))[0];
    expect([cycle.id, Number(cycle.salarySnapshot), totalOf(cycle), amountOf(cycle, 'core.saving')]).toEqual([current.id, 2_600_000, 2_600_000, 520_000]);

    await addIncome(userId, current.id, 500_000, String(current.startDate));
    await new BudgetCycleService().addAdditionalIncome(current.id, 500_000);
    await callController(upsertFinanceSetting, userId, { ...body, salaryAmount: 2_600_000 });
    expect(Number((await cyclesOf(userId))[0].salarySnapshot)).toBe(3_100_000);
    await callController(upsertFinanceSetting, userId, { ...body, salaryAmount: 2_500_000 });
    await callController(upsertFinanceSetting, userId, { ...body, salaryAmount: 2_600_000 });
    cycle = (await cyclesOf(userId))[0];
    expect([Number(cycle.salarySnapshot), totalOf(cycle)]).toEqual([3_100_000, 3_100_000]);

    // A plan change afterwards still keeps salary + additional income.
    await callController(upsertBudgetPlan, userId, { allocations: DEFAULT_BUDGET_PLAN.map((item) => item.categoryId === 'core.saving' ? { ...item, percentage: 25 } : item.categoryId === 'core.expense.fixed' ? { ...item, percentage: 20 } : item) });
    cycle = (await cyclesOf(userId))[0];
    expect([Number(cycle.salarySnapshot), amountOf(cycle, 'core.saving')]).toEqual([3_100_000, 775_000]);
    expect(await Transaction.count({ where: { userId } })).toBe(1);
  });

  it('Home reports the additional income included in the cycle budget, so a salary change can be previewed', async () => {
    const userId = await createUser(2_500_000, 1);
    await savePlan(userId);
    const current = await new BudgetCycleService().ensureCurrentCycle(userId);
    await addIncome(userId, current.id, 300_000, String(current.startDate));
    await new BudgetCycleService().addAdditionalIncome(current.id, 300_000);
    await callController(upsertFinanceSetting, userId, { salaryAmount: 800_000, salaryDay: 1, reportingStartDay: 1 });

    const { data } = await callController(home, userId, undefined);
    // salary 800,000 + additional 300,000; the daily-spendable pool is the
    // total minus 저축 20% / 투자 10% / 고정지출 25% (rounding lands in 기타).
    expect([data.budget.salaryAmount, data.budget.additionalIncomeAmount]).toEqual([1_100_000, 300_000]);
    expect(data.budget.usableBudgetAmount).toBe(1_100_000 - 220_000 - 110_000 - 275_000);
  });

  it('CASE 8: onboarding (setting then plan) starts the first cycle, which then renews on the next payday unaided', async () => {
    const userId = randomUUID();
    createdUsers.push(userId);
    await User.create({ id: userId, email: `rollover-${userId}@example.invalid` });
    await callController(upsertFinanceSetting, userId, { salaryAmount: 2_500_000, salaryDay: 1, reportingStartDay: 1 });
    expect(await cyclesOf(userId)).toHaveLength(0);
    await callController(upsertBudgetPlan, userId, { allocations: DEFAULT_BUDGET_PLAN });
    const [first] = await cyclesOf(userId);
    expect([first.status, Number(first.salarySnapshot), first.allocations.length]).toEqual(['ACTIVE', 2_500_000, 12]);

    const payday = dateOnly(addDays(day(String(first.endDate)), 1));
    const next = await at(payday).ensureCurrentCycle(userId, day(payday));
    expect([next.startDate, Number(next.salarySnapshot), next.allocations.length]).toEqual([payday, 2_500_000, 12]);
    expect((await cyclesOf(userId)).map((cycle: any) => cycle.status)).toEqual(['CLOSED', 'ACTIVE']);
  });
});
