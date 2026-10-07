import { randomUUID } from 'crypto';
import { QueryTypes, type Transaction as Tx } from 'sequelize';
import { sequelize } from '../src/config/database';
import { BudgetCycle, Transaction, User, UserFinanceSetting } from '../src/models';
import { deleteUsers } from './helpers/apiHarness';

// Verifies the applied RLS/grant migration (20261007090100) against the real
// database: client roles are locked out, ownership policies isolate rows.
// The backend itself connects as the table owner (BYPASSRLS) and is unaffected.
// Opt-in: RUN_DB_TESTS=1. Every check runs inside a rolled-back transaction.
const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

const USER_TABLES = ['UserFinanceSetting', 'BudgetAllocation', 'BudgetCycle', 'Transaction', 'FixedExpense', 'NotificationInbox', 'PolicyBookmark', 'PolicyCalendarEvent', 'UserCategoryPreference'];
const ALL_TABLES = [...USER_TABLES, 'BudgetCycleAllocation', 'FixedExpenseOccurrence', 'Category', 'User', 'Policy'];
const pgCode = (error: any) => error?.original?.code ?? error?.parent?.code ?? error?.code;

describeDb('row level security and grants', () => {
  const A = randomUUID(); const B = randomUUID();
  let cycleA: string;

  const q = (sql: string, transaction?: Tx) => sequelize.query(sql, { transaction, type: QueryTypes.SELECT }) as Promise<any[]>;
  const raw = (sql: string, transaction?: Tx) => sequelize.query(sql, { transaction });
  const actAs = async (transaction: Tx, role: 'anon' | 'authenticated', uid?: string) => {
    await raw(`set local role ${role}`, transaction);
    if (uid) await raw(`select set_config('request.jwt.claims', '{"sub":"${uid}","role":"${role}"}', true)`, transaction);
  };
  const denied = async (transaction: Tx, sql: string) => {
    await raw('savepoint s', transaction);
    try { await raw(sql, transaction); return null; } catch (error) { await raw('rollback to savepoint s', transaction); return pgCode(error); }
  };
  const rolledBack = async (work: (transaction: Tx) => Promise<void>) => {
    const transaction = await sequelize.transaction();
    try { await work(transaction); } finally { await transaction.rollback(); }
  };

  beforeAll(async () => {
    for (const id of [A, B]) {
      await User.create({ id, email: `rls-${id}@example.invalid` });
      await UserFinanceSetting.create({ userId: id, salaryAmount: '1000', salaryDay: 1, reportingStartDay: 1 });
    }
    cycleA = (await BudgetCycle.create({ id: `rls-${A}`, userId: A, startDate: '2026-01-01', endDate: '2026-01-31', salarySnapshot: '1000', status: 'ACTIVE' })).id;
    await Transaction.create({ id: `rls-tx-${A}`, userId: A, budgetCycleId: cycleA, categoryId: 'core.expense.food.meal', type: 'EXPENSE', amount: '100', occurredAt: '2026-01-02', merchantOrTitle: 'A lunch' });
  });

  afterAll(async () => { await deleteUsers([A, B]); await sequelize.close(); });

  it('RLS is enabled on all 14 tables and the only client privilege is SELECT on Policy', async () => {
    const rls = await q(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' and relrowsecurity`);
    expect(rls.map((row) => row.relname).sort()).toEqual([...ALL_TABLES].sort());
    const grants = await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3`);
    expect(grants).toEqual([{ grantee: 'anon', table_name: 'Policy', privilege_type: 'SELECT' }, { grantee: 'authenticated', table_name: 'Policy', privilege_type: 'SELECT' }]);
    expect((await q(`select indexname from pg_indexes where indexname = 'budget_cycle_user_active_unique'`)).length).toBe(1);
  });

  it('the backend connection (table owner) still reads every row', async () => {
    expect(await Transaction.count({ where: { userId: A } })).toBe(1);
  });

  it.each(ALL_TABLES.filter((table) => table !== 'Policy'))('anon and authenticated are denied on %s', async (table) => {
    await rolledBack(async (transaction) => {
      await actAs(transaction, 'anon');
      expect(await denied(transaction, `select * from "${table}" limit 1`)).toBe('42501');
      expect(await denied(transaction, `insert into "${table}" default values`)).toBe('42501');
      await raw('reset role', transaction);
      await actAs(transaction, 'authenticated', A);
      expect(await denied(transaction, `select * from "${table}" limit 1`)).toBe('42501');
      expect(await denied(transaction, `delete from "${table}"`)).toBe('42501');
      expect(await denied(transaction, `update "${table}" set "createdAt" = now()`)).toMatch(/^42/); // 42501 denied, or 42703 when the column does not exist - never executed
    });
  });

  it('a table created later is not granted to the client roles (20261007130100)', async () => {
    await rolledBack(async (transaction) => {
      await raw('create table public."__default_acl_probe" (id int)', transaction);
      const grants = await q(`select distinct grantee from information_schema.role_table_grants where table_schema = 'public' and table_name = '__default_acl_probe' order by 1`, transaction);
      expect(grants.map((row) => row.grantee)).not.toEqual(expect.arrayContaining(['anon']));
      expect(grants.map((row) => row.grantee)).not.toEqual(expect.arrayContaining(['authenticated']));
    });
  });

  it('Policy is readable by client roles but not writable', async () => {
    await rolledBack(async (transaction) => {
      await actAs(transaction, 'anon');
      expect(await denied(transaction, `select count(*) from "Policy"`)).toBeNull();
      expect(await denied(transaction, `delete from "Policy"`)).toBe('42501');
      expect(await denied(transaction, `update "Policy" set title = title`)).toBe('42501');
    });
  });

  it('ownership policies isolate rows per auth.uid() even when a table is granted to clients', async () => {
    await rolledBack(async (transaction) => {
      // Grant inside the transaction only (rolled back below) to exercise the policy layer on its own.
      await raw(`grant select, insert, update, delete on "Transaction", "BudgetCycle", "BudgetCycleAllocation", "UserFinanceSetting", "Category", "User" to authenticated`, transaction);
      await actAs(transaction, 'authenticated', A);
      expect((await q(`select count(*)::int as n from "Transaction"`, transaction))[0].n).toBe(1);
      expect((await q(`select count(*)::int as n from "BudgetCycle"`, transaction))[0].n).toBe(1);
      expect((await q(`select count(*)::int as n from "User"`, transaction))[0].n).toBe(1);
      expect((await q(`select count(*)::int as n from "UserFinanceSetting"`, transaction))[0].n).toBe(1);
      expect((await q(`select count(*)::int as n from "Category" where "ownerUserId" is null`, transaction))[0].n).toBeGreaterThan(0);
      // writing as someone else is refused by WITH CHECK
      expect(await denied(transaction, `insert into "Transaction" (id, "userId", "categoryId", type, amount, "occurredAt", "merchantOrTitle", "createdAt", "updatedAt") values ('rls-spoof', '${B}', 'core.expense.food.meal', 'EXPENSE', 1, '2026-01-02', 'spoof', now(), now())`)).toBe('42501');
      expect(await denied(transaction, `update "Transaction" set "userId" = '${B}' where id = 'rls-tx-${A}'`)).toBe('42501');
      // shared catalog rows are invisible to UPDATE/DELETE (0 rows affected, never changed)
      const [, meta]: any = await raw(`update "Category" set "sortOrder" = "sortOrder" where id = 'core.expense.food'`, transaction);
      expect(meta?.rowCount ?? meta).toBe(0);

      await raw(`select set_config('request.jwt.claims', '{"sub":"${B}","role":"authenticated"}', true)`, transaction);
      expect((await q(`select count(*)::int as n from "Transaction"`, transaction))[0].n).toBe(0);
      expect((await q(`select count(*)::int as n from "BudgetCycle"`, transaction))[0].n).toBe(0);
      expect((await q(`select count(*)::int as n from "BudgetCycleAllocation" where "budgetCycleId" = '${cycleA}'`, transaction))[0].n).toBe(0);
      expect((await q(`select count(*)::int as n from "User" where id = '${A}'`, transaction))[0].n).toBe(0);
      const [, updated]: any = await raw(`update "Transaction" set memo = 'hacked' where "userId" = '${A}'`, transaction);
      expect(updated?.rowCount ?? updated).toBe(0);
      const [, deleted]: any = await raw(`delete from "BudgetCycle" where "userId" = '${A}'`, transaction);
      expect(deleted?.rowCount ?? deleted).toBe(0);
      await raw('reset role', transaction);
    });
    expect(await Transaction.count({ where: { userId: A } })).toBe(1);
    expect((await Transaction.findByPk(`rls-tx-${A}`)).memo).toBeNull();
  });
});
