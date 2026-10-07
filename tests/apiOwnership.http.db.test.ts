import { randomUUID } from 'crypto';
import { deleteUsers, registerUser, startServer, type TestUser } from './helpers/apiHarness';
import { sequelize } from '../src/config/database';
import { DEFAULT_BUDGET_PLAN } from '../src/constants/budgetPlan';
import { Policy, PolicyBookmark, PolicyCalendarEvent, Transaction } from '../src/models';
import { dateOnly } from '../src/utils/dates';

// Two real users over HTTP: user B must never be able to read, change or
// delete anything that belongs to user A, whichever endpoint or parameter
// carries A's id. Opt-in: RUN_DB_TESTS=1 npm test (runs against DATABASE_URL).
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

describeDb('API authentication and ownership (HTTP)', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let call: Awaited<ReturnType<typeof startServer>>['call'];
  let A: TestUser; let B: TestUser;
  const today = dateOnly(new Date());
  const policyId = `test-policy-${randomUUID()}`;
  const owned: Record<string, any> = {}; // A's resources
  const mine: Record<string, any> = {}; // B's resources

  async function onboard(user: TestUser, salaryAmount: number) {
    expect((await call('PUT', '/api/finance/setting', user.token, { salaryAmount, salaryDay: 25, reportingStartDay: 1 })).status).toBe(200);
    expect((await call('PUT', '/api/finance/budget-plan', user.token, { allocations: DEFAULT_BUDGET_PLAN })).status).toBe(200);
  }

  async function createResources(user: TestUser, bag: Record<string, any>, salaryAmount: number) {
    await onboard(user, salaryAmount);
    bag.tx = (await call('POST', '/api/transactions', user.token, { categoryId: 'core.expense.food.meal', type: 'EXPENSE', amount: 12000, occurredAt: today, merchantOrTitle: `${user.email} lunch` })).data;
    expect(bag.tx.userId).toBe(user.id);
    bag.category = (await call('POST', '/api/categories', user.token, { name: '반려동물', type: 'EXPENSE', parentCategoryId: 'core.expense.living' })).data;
    expect(bag.category.ownerUserId).toBe(user.id);
    bag.taxiName = `taxi-${user.id.slice(0, 8)}`;
    expect((await call('PATCH', '/api/categories/core.expense.transport.taxi', user.token, { name: bag.taxiName })).status).toBe(200);
    bag.fixed = (await call('POST', '/api/fixed-expenses', user.token, { categoryId: 'core.expense.communication', name: '통신비', expectedAmount: 50000, billingDay: 10, recurrenceType: 'MONTHLY', startDate: today })).data;
    bag.occurrence = (await call('GET', '/api/fixed-expenses', user.token)).data.find((item: any) => item.id === bag.fixed.id).occurrences[0];
    expect((await call('POST', `/api/policies/${policyId}/bookmark`, user.token)).status).toBe(201);
    expect((await call('POST', `/api/policies/${policyId}/calendar`, user.token, { eventDate: today })).status).toBe(201);
  }

  beforeAll(async () => {
    server = await startServer(); call = server.call;
    A = registerUser('owner-a'); B = registerUser('other-b');
    await Policy.create({ id: policyId, title: '[TEST] ownership policy', provider: 'test', providerType: 'GOVERNMENT', category: 'test', summary: 'test', description: 'test', applicationUrl: 'https://example.invalid', sourceUrl: 'https://example.invalid', dataCollectedAt: new Date() });
    await createResources(A, owned, 3_000_000);
    await createResources(B, mine, 1_000_000);
  });

  afterAll(async () => {
    await deleteUsers([A.id, B.id].filter(Boolean));
    await Policy.destroy({ where: { id: policyId } });
    await server.close();
    await sequelize.close();
  });

  describe('authentication', () => {
    const protectedRoutes: Array<[string, string]> = [
      ['GET', '/api/home'], ['GET', '/api/profile'], ['GET', '/api/finance/setting'], ['GET', '/api/finance/budget-plan'],
      ['GET', '/api/transactions'], ['POST', '/api/transactions'], ['GET', '/api/reports/summary'], ['GET', '/api/categories'],
      ['GET', '/api/fixed-expenses'], ['GET', '/api/policies/bookmarks'], ['GET', '/api/policies/calendar'], ['POST', '/api/notifications'],
      ['POST', '/api/policies/sync'],
    ];
    it.each(protectedRoutes)('%s %s rejects a request without a token', async (method, path) => {
      const res = await call(method, path);
      expect([res.status, res.error?.code]).toEqual([401, 'UNAUTHORIZED']);
    });
    it.each(protectedRoutes)('%s %s rejects an invalid token', async (method, path) => {
      const res = await call(method, path, 'not-a-real-token');
      expect([res.status, res.error?.code]).toEqual([401, 'UNAUTHORIZED']);
    });
    it('the public policy catalog stays readable without a token', async () => {
      expect((await call('GET', '/api/policies')).status).toBe(200);
    });
    it('identifies the caller from the token, not from any id in the request', async () => {
      const profile = await call('GET', '/api/profile', B.token);
      expect(profile.data).toMatchObject({ id: B.id, email: B.email });
      const spoofed = await call('POST', '/api/transactions', B.token, { userId: A.id, categoryId: 'core.expense.food.meal', type: 'EXPENSE', amount: 1000, occurredAt: today, merchantOrTitle: 'spoof' });
      expect(spoofed.status).toBe(201);
      expect(spoofed.data.userId).toBe(B.id);
      const patched = await call('PATCH', `/api/transactions/${spoofed.data.id}`, B.token, { userId: A.id, memo: 'still mine' });
      expect(patched.data.userId).toBe(B.id);
      const listed = await call('GET', `/api/transactions?userId=${A.id}`, B.token);
      expect(listed.data.items.every((item: any) => item.userId === B.id)).toBe(true);
    });
  });

  describe('transactions', () => {
    it('B cannot read, update, refund or delete A\'s transaction', async () => {
      expect((await call('GET', `/api/transactions/${owned.tx.id}`, B.token)).status).toBe(404);
      expect((await call('PATCH', `/api/transactions/${owned.tx.id}`, B.token, { amount: 1 })).status).toBe(404);
      expect((await call('PATCH', `/api/transactions/${owned.tx.id}/refund`, B.token, { amount: 1 })).status).toBe(404);
      expect((await call('DELETE', `/api/transactions/${owned.tx.id}`, B.token)).status).toBe(404);
      const untouched = await Transaction.findByPk(owned.tx.id);
      expect([untouched.userId, Number(untouched.amount), Number(untouched.refundedAmount)]).toEqual([A.id, 12000, 0]);
    });
    it('B\'s list never contains A\'s transactions', async () => {
      const list = await call('GET', '/api/transactions?limit=100', B.token);
      expect(list.data.items.map((item: any) => item.id)).not.toContain(owned.tx.id);
      expect(list.data.items.every((item: any) => item.userId === B.id)).toBe(true);
    });
    it('A still has full access to their own transaction', async () => {
      expect((await call('GET', `/api/transactions/${owned.tx.id}`, A.token)).data.id).toBe(owned.tx.id);
      expect((await call('PATCH', `/api/transactions/${owned.tx.id}`, A.token, { memo: 'edited' })).data.memo).toBe('edited');
    });
  });

  describe('cycle, budget, settings, reports', () => {
    it('Home, settings, plan and reports only reflect the caller\'s own data', async () => {
      const home = await call('GET', '/api/home', B.token);
      expect(home.data.budget.salaryAmount).toBe(1_000_000);
      expect((await call('GET', '/api/finance/setting', B.token)).data.userId).toBe(B.id);
      expect(Number((await call('GET', '/api/finance/setting', B.token)).data.salaryAmount)).toBe(1_000_000);
      expect((await call('GET', '/api/finance/budget-plan', B.token)).data.salaryAmount).toBe(1_000_000);
      expect((await call('GET', '/api/finance/allocations', B.token)).data.every((item: any) => item.userId === B.id)).toBe(true);
      expect((await call('GET', '/api/reports/budget', B.token)).data.cycle.salaryAmount).toBe(1_000_000);
      const summary = await call('GET', '/api/reports/summary', B.token);
      expect(summary.data.expense).toBe(13000); // B's 12,000 lunch + the 1,000 spoof attempt, never A's 12,000
    });
    it('there is no endpoint that takes another user\'s cycle id', async () => {
      // Cycle ids are never accepted from the client: the cycle is always
      // resolved from the authenticated user (see BudgetCycleService).
      const pathsWithId = ['/api/finance/cycles/x', '/api/cycles/x', '/api/budget-cycles/x'];
      for (const path of pathsWithId) expect((await call('GET', path, B.token)).status).toBe(404);
    });
  });

  describe('categories', () => {
    it('B cannot see, update or delete A\'s custom category or display preference', async () => {
      expect((await call('GET', '/api/categories', B.token)).data.map((item: any) => item.id)).not.toContain(owned.category.id);
      expect((await call('PATCH', `/api/categories/${owned.category.id}`, B.token, { name: 'hacked' })).status).toBe(404);
      expect((await call('DELETE', `/api/categories/${owned.category.id}`, B.token)).status).toBe(404);
      expect((await call('DELETE', `/api/categories/${owned.category.id}/preference`, B.token)).status).toBe(404);
      const taxiForA = (await call('GET', '/api/categories', A.token)).data.find((item: any) => item.id === 'core.expense.transport.taxi');
      const taxiForB = (await call('GET', '/api/categories', B.token)).data.find((item: any) => item.id === 'core.expense.transport.taxi');
      expect(taxiForA.name).toBe(owned.taxiName);
      expect(taxiForB.name).toBe(mine.taxiName);
      await call('DELETE', '/api/categories/core.expense.transport.taxi/preference', B.token);
      expect((await call('GET', '/api/categories', A.token)).data.find((item: any) => item.id === 'core.expense.transport.taxi').name).toBe(owned.taxiName);
    });
    it('B cannot record a transaction on A\'s custom category', async () => {
      const res = await call('POST', '/api/transactions', B.token, { categoryId: owned.category.id, type: 'EXPENSE', amount: 1000, occurredAt: today, merchantOrTitle: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('fixed expenses', () => {
    it('B cannot list or match A\'s fixed expense occurrences, nor match A\'s transaction', async () => {
      expect((await call('GET', '/api/fixed-expenses', B.token)).data.map((item: any) => item.id)).not.toContain(owned.fixed.id);
      expect((await call('POST', `/api/fixed-expenses/occurrences/${owned.occurrence.id}/match`, B.token, { transactionId: mine.tx.id })).status).toBe(404);
      expect((await call('POST', `/api/fixed-expenses/occurrences/${mine.occurrence.id}/match`, B.token, { transactionId: owned.tx.id })).status).toBe(404);
    });
  });

  describe('policies (bookmarks and calendar)', () => {
    it('B only sees and deletes their own bookmark and calendar event', async () => {
      expect((await call('GET', '/api/policies/bookmarks', B.token)).data).toHaveLength(1);
      expect((await call('GET', '/api/policies/calendar', B.token)).data).toHaveLength(1);
      await call('DELETE', `/api/policies/${policyId}/bookmark`, B.token);
      await call('DELETE', `/api/policies/${policyId}/calendar`, B.token);
      expect(await PolicyBookmark.count({ where: { userId: A.id, policyId } })).toBe(1);
      expect(await PolicyCalendarEvent.count({ where: { userId: A.id, policyId } })).toBe(1);
      expect(await PolicyBookmark.count({ where: { userId: B.id, policyId } })).toBe(0);
    });
  });

  describe('data management', () => {
    it('A can delete their own transaction, and B\'s delete of it was a no-op', async () => {
      expect((await call('DELETE', `/api/transactions/${owned.tx.id}`, A.token)).data).toEqual({ deleted: true });
      expect((await call('GET', `/api/transactions/${owned.tx.id}`, A.token)).status).toBe(404);
    });
  });
});
