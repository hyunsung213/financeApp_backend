-- A user's own EXPENSE category is always a 소분류 (audit P0-04). Home and the
-- budget only count spending under the 10 지출 대분류 the budget plan
-- allocates to, so a custom 지출 대분류 (parentCategoryId null) would let its
-- spending bypass the budget. CategoryService rejects it and also requires
-- the parent to be one of those 대분류; this constraint keeps the database
-- from holding a custom EXPENSE root whichever path writes the row. (Which
-- parent is allowed involves another row, so that part stays in the service.)
--
-- Pre-check (run first; this migration also stops if any exist):
--   select id, "ownerUserId", name from public."Category"
--   where "ownerUserId" is not null and type = 'EXPENSE' and "parentCategoryId" is null;
-- Offending rows must be moved under a 대분류 by hand (their transactions
-- follow the category) before the constraint can be added - no data is
-- changed here.
--
-- Re-runnable: the constraint is added only if missing.
-- Rollback:
--   alter table public."Category" drop constraint if exists "category_custom_expense_has_parent";

do $$
declare
  offending integer;
begin
  select count(*) into offending
  from public."Category"
  where "ownerUserId" is not null and type = 'EXPENSE' and "parentCategoryId" is null;
  if offending > 0 then
    raise exception 'Category: % custom EXPENSE categories have no parent; move them under a 지출 대분류 before adding category_custom_expense_has_parent', offending;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'category_custom_expense_has_parent' and conrelid = 'public."Category"'::regclass
  ) then
    alter table public."Category"
      add constraint "category_custom_expense_has_parent"
      check ("ownerUserId" is null or type <> 'EXPENSE' or "parentCategoryId" is not null);
  end if;
end $$;
