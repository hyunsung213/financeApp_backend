alter table public."BudgetAllocation"
  add column if not exists "categoryId" character varying(255);

alter table public."BudgetCycleAllocation"
  add column if not exists "categoryId" character varying(255);

alter table public."Transaction"
  add column if not exists "refundedAmount" bigint not null default 0;

alter table public."Transaction"
  drop constraint if exists "Transaction_refundedAmount_valid";

alter table public."Transaction"
  add constraint "Transaction_refundedAmount_valid"
  check ("refundedAmount" >= 0 and "refundedAmount" <= amount);

update public."BudgetAllocation"
set "categoryId" = case "allocationType"
  when 'SAVING' then 'core.saving'
  when 'INVESTMENT' then 'core.investment'
  else "categoryId"
end
where "categoryId" is null;

update public."BudgetCycleAllocation" as snapshot
set "categoryId" = allocation."categoryId"
from public."BudgetAllocation" as allocation
where snapshot."allocationId" = allocation.id
  and snapshot."categoryId" is null;

create unique index if not exists "BudgetAllocation_active_user_category_unique"
  on public."BudgetAllocation" ("userId", "categoryId")
  where active and "categoryId" is not null;

create index if not exists "BudgetCycleAllocation_cycle_category_index"
  on public."BudgetCycleAllocation" ("budgetCycleId", "categoryId");

insert into public."Category" (
  id, "ownerUserId", "sourceCategoryId", "parentCategoryId", name, type, "purposeType", "isActive", "sortOrder", "createdAt", "updatedAt"
) values (
  'core.expense.fixed', null, null, null, '고정지출', 'EXPENSE', 'GENERAL', true, 335, now(), now()
)
on conflict (id) do update set
  name = excluded.name,
  "parentCategoryId" = excluded."parentCategoryId",
  "isActive" = true,
  "sortOrder" = excluded."sortOrder",
  "updatedAt" = now();

update public."Category"
set "parentCategoryId" = 'core.expense.fixed', "updatedAt" = now()
where id in (
  'core.expense.communication',
  'core.expense.living.utilities',
  'core.expense.housing',
  'core.expense.living.subscription',
  'core.expense.finance.interest',
  'core.expense.finance.tax',
  'core.expense.insurance-tax',
  'core.expense.debt-repayment'
) or "sourceCategoryId" in (
  'core.expense.communication',
  'core.expense.living.utilities',
  'core.expense.housing',
  'core.expense.living.subscription',
  'core.expense.finance.interest',
  'core.expense.finance.tax',
  'core.expense.insurance-tax',
  'core.expense.debt-repayment'
);

update public."Category"
set "parentCategoryId" = 'core.expense.other', "updatedAt" = now()
where id = 'core.expense.finance.fee'
   or "sourceCategoryId" = 'core.expense.finance.fee';

update public."Category"
set "isActive" = false, "updatedAt" = now()
where id = 'core.expense.finance'
   or "sourceCategoryId" = 'core.expense.finance';
