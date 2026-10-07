-- A user has at most one ACTIVE budget cycle (audit P0-07). The application
-- serializes cycle writes per user (BudgetCycleService.withSettingLock), and
-- this partial unique index makes the database reject a second ACTIVE row
-- regardless of which code path produced it.
--
-- Pre-check (run first; this migration also stops if any exist):
--   select "userId", count(*) from public."BudgetCycle"
--   where status = 'ACTIVE' group by "userId" having count(*) > 1;
-- Offending users must be resolved by hand (close the stale cycle) before
-- the index can be created - no data is changed here.
--
-- Re-runnable: the index is created only if missing.
-- Rollback:
--   drop index if exists public."budget_cycle_user_active_unique";

do $$
declare
  offending integer;
begin
  select count(*) into offending
  from (
    select "userId"
    from public."BudgetCycle"
    where status = 'ACTIVE'
    group by "userId"
    having count(*) > 1
  ) duplicates;
  if offending > 0 then
    raise exception 'BudgetCycle: % user(s) have more than one ACTIVE cycle; resolve them before creating budget_cycle_user_active_unique', offending;
  end if;
end $$;

create unique index if not exists "budget_cycle_user_active_unique"
  on public."BudgetCycle" ("userId")
  where status = 'ACTIVE';
