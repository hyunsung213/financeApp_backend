-- Row-level access for every public table (audit P0-01).
--
-- Access model
--   * All app tables are reached only through the Express backend, which
--     connects as `postgres` (table owner, BYPASSRLS). The Flutter client uses
--     Supabase only for Auth and never calls the Data API, so the client roles
--     `anon` and `authenticated` get no table privileges, except read access
--     to the public Policy catalog. The service role key stays server-side.
--   * RLS is enabled on all 14 tables with ownership policies as a second,
--     independent layer: if a table is ever exposed to clients again (a GRANT
--     or Supabase's default privileges on a re-created table), rows stay
--     isolated to auth.uid().
--
-- Classification
--   backend-only, user-owned ("userId"):
--     UserFinanceSetting, BudgetAllocation, BudgetCycle, Transaction, FixedExpense,
--     NotificationInbox, PolicyBookmark, PolicyCalendarEvent, UserCategoryPreference
--   backend-only, owned through the parent row:
--     BudgetCycleAllocation (BudgetCycle."userId"), FixedExpenseOccurrence (FixedExpense."userId")
--   backend-only, shared catalog + user rows:
--     Category ("ownerUserId" null = shared system row, readable by all, writable by nobody;
--               own rows readable/writable by their owner)
--   backend-only, own profile:
--     User (existing own-row SELECT/UPDATE policies kept; no INSERT/DELETE)
--   public read-only catalog:
--     Policy (SELECT for anon/authenticated; writes stay backend-only)
--
-- Re-runnable (policies are dropped and re-created by name); existing data is
-- not touched. Rollback at the bottom.

-- 1. Grants: client roles lose every table privilege, then get back only
--    the public catalog read. (FOR UPDATE row locks, REFERENCES, TRIGGER and
--    TRUNCATE were all open to anon before.)
revoke all privileges on all tables in schema public from anon, authenticated;
grant select on public."Policy" to anon, authenticated;

-- 2. User-owned tables: own rows only, for every operation.
do $$
declare
  t text;
begin
  foreach t in array array[
    'UserFinanceSetting', 'BudgetAllocation', 'BudgetCycle', 'Transaction', 'FixedExpense',
    'NotificationInbox', 'PolicyBookmark', 'PolicyCalendarEvent', 'UserCategoryPreference'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = "userId")', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = "userId")', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = "userId") with check ((select auth.uid()) = "userId")', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = "userId")', t || '_delete_own', t);
  end loop;
end $$;

-- 3. Child tables owned through their parent.
alter table public."BudgetCycleAllocation" enable row level security;
drop policy if exists "BudgetCycleAllocation_select_own" on public."BudgetCycleAllocation";
create policy "BudgetCycleAllocation_select_own" on public."BudgetCycleAllocation" for select to authenticated
  using (exists (select 1 from public."BudgetCycle" c where c.id = "budgetCycleId" and c."userId" = (select auth.uid())));
drop policy if exists "BudgetCycleAllocation_insert_own" on public."BudgetCycleAllocation";
create policy "BudgetCycleAllocation_insert_own" on public."BudgetCycleAllocation" for insert to authenticated
  with check (exists (select 1 from public."BudgetCycle" c where c.id = "budgetCycleId" and c."userId" = (select auth.uid())));
drop policy if exists "BudgetCycleAllocation_update_own" on public."BudgetCycleAllocation";
create policy "BudgetCycleAllocation_update_own" on public."BudgetCycleAllocation" for update to authenticated
  using (exists (select 1 from public."BudgetCycle" c where c.id = "budgetCycleId" and c."userId" = (select auth.uid())))
  with check (exists (select 1 from public."BudgetCycle" c where c.id = "budgetCycleId" and c."userId" = (select auth.uid())));
drop policy if exists "BudgetCycleAllocation_delete_own" on public."BudgetCycleAllocation";
create policy "BudgetCycleAllocation_delete_own" on public."BudgetCycleAllocation" for delete to authenticated
  using (exists (select 1 from public."BudgetCycle" c where c.id = "budgetCycleId" and c."userId" = (select auth.uid())));

alter table public."FixedExpenseOccurrence" enable row level security;
drop policy if exists "FixedExpenseOccurrence_select_own" on public."FixedExpenseOccurrence";
create policy "FixedExpenseOccurrence_select_own" on public."FixedExpenseOccurrence" for select to authenticated
  using (exists (select 1 from public."FixedExpense" f where f.id = "fixedExpenseId" and f."userId" = (select auth.uid())));
drop policy if exists "FixedExpenseOccurrence_insert_own" on public."FixedExpenseOccurrence";
create policy "FixedExpenseOccurrence_insert_own" on public."FixedExpenseOccurrence" for insert to authenticated
  with check (exists (select 1 from public."FixedExpense" f where f.id = "fixedExpenseId" and f."userId" = (select auth.uid())));
drop policy if exists "FixedExpenseOccurrence_update_own" on public."FixedExpenseOccurrence";
create policy "FixedExpenseOccurrence_update_own" on public."FixedExpenseOccurrence" for update to authenticated
  using (exists (select 1 from public."FixedExpense" f where f.id = "fixedExpenseId" and f."userId" = (select auth.uid())))
  with check (exists (select 1 from public."FixedExpense" f where f.id = "fixedExpenseId" and f."userId" = (select auth.uid())));
drop policy if exists "FixedExpenseOccurrence_delete_own" on public."FixedExpenseOccurrence";
create policy "FixedExpenseOccurrence_delete_own" on public."FixedExpenseOccurrence" for delete to authenticated
  using (exists (select 1 from public."FixedExpense" f where f.id = "fixedExpenseId" and f."userId" = (select auth.uid())));

-- 4. Category: shared system rows are readable by everyone signed in and
--    never writable through RLS; a user's own rows are theirs.
alter table public."Category" enable row level security;
drop policy if exists "Category_select_shared_or_own" on public."Category";
create policy "Category_select_shared_or_own" on public."Category" for select to authenticated
  using ("ownerUserId" is null or "ownerUserId" = (select auth.uid()));
drop policy if exists "Category_insert_own" on public."Category";
create policy "Category_insert_own" on public."Category" for insert to authenticated
  with check ("ownerUserId" = (select auth.uid()));
drop policy if exists "Category_update_own" on public."Category";
create policy "Category_update_own" on public."Category" for update to authenticated
  using ("ownerUserId" = (select auth.uid())) with check ("ownerUserId" = (select auth.uid()));
drop policy if exists "Category_delete_own" on public."Category";
create policy "Category_delete_own" on public."Category" for delete to authenticated
  using ("ownerUserId" = (select auth.uid()));

-- 5. User: own profile read/update (same definitions as the policies that
--    already existed, re-created by name so a fresh database matches).
alter table public."User" enable row level security;
drop policy if exists "users_can_read_own_profile" on public."User";
create policy "users_can_read_own_profile" on public."User" for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "users_can_update_own_profile" on public."User";
create policy "users_can_update_own_profile" on public."User" for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- 6. Policy: public catalog, read-only for clients.
alter table public."Policy" enable row level security;
drop policy if exists "Policy_select_public" on public."Policy";
create policy "Policy_select_public" on public."Policy" for select to anon, authenticated using (true);

-- Rollback (re-opens every table to the client roles as before - not recommended):
--   grant select, insert, update, delete, references, trigger, truncate
--     on all tables in schema public to anon, authenticated;
--   then for each table above: `alter table public."<T>" disable row level security;`
--   and `drop policy if exists "<name>" on public."<T>";` for the policies it created
--   (User keeps its two pre-existing policies and NotificationInbox keeps RLS enabled,
--   which is how they were before this migration).
