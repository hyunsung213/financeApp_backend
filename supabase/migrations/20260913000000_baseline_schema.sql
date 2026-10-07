-- Baseline: the schema every later migration assumes already exists.
--
-- The 13 original tables were created by `sequelize.sync()` (npm run db:sync)
-- and never by a migration, so the chain below could not build an empty
-- database: the first migration already ALTERs "Transaction". This file is
-- generated from the dev database's catalog and contains exactly the objects
-- no later migration creates - enum types, the 13 tables with the columns they
-- had before the later migrations, primary/unique/check/foreign keys and
-- indexes - including the ones that were added by hand outside any migration
-- (NotificationInbox_source_check, NotificationInbox_status_check,
-- NotificationInbox_user_event_unique, NotificationInbox_user_created_idx,
-- Transaction_notification_id_unique and User_email_key1; the last four
-- duplicate an existing index and are kept only so a fresh database matches
-- the running one). Columns, indexes, RLS, policies and grants that later
-- migrations add stay in those migrations.
--
-- Fresh database: run every migration in order (this one first). db:sync is
-- not part of it.
-- Existing database (already built by db:sync + the migrations): every
-- statement is guarded, so running it changes nothing; record it as applied
-- instead, e.g. `supabase migration repair --status applied 20260913000000`.
--
-- Prerequisite: the Supabase roles anon/authenticated/service_role and
-- auth.uid() (present on every Supabase project) for the RLS migration.
-- Rollback: none (it only creates objects; dropping them drops all data).

-- 1. Enum types
do $$ begin
  create type public."enum_BudgetAllocation_allocationType" as enum ('SAVING', 'INVESTMENT', 'FIXED_LIVING', 'FLEXIBLE', 'TRANSPORT', 'COMMUNICATION', 'SUBSCRIPTION', 'HOUSING', 'FOOD', 'OTHER');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_BudgetAllocation_spendability" as enum ('LOCKED', 'RESERVED', 'FLEXIBLE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_BudgetCycleAllocation_spendability" as enum ('LOCKED', 'RESERVED', 'FLEXIBLE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_BudgetCycle_status" as enum ('UPCOMING', 'ACTIVE', 'CLOSED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Category_purposeType" as enum ('GENERAL', 'SAVING', 'INVESTMENT');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Category_type" as enum ('EXPENSE', 'INCOME', 'SAVING');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_FixedExpenseOccurrence_status" as enum ('SCHEDULED', 'PAID', 'SKIPPED', 'CANCELLED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_FixedExpense_recurrenceType" as enum ('MONTHLY', 'YEARLY');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Policy_providerType" as enum ('GOVERNMENT', 'LOCAL_GOVERNMENT', 'PUBLIC', 'PRIVATE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Transaction_source" as enum ('MANUAL', 'AUTO', 'RECEIPT', 'FIXED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Transaction_status" as enum ('CONFIRMED', 'PENDING', 'EXCLUDED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."enum_Transaction_type" as enum ('EXPENSE', 'INCOME', 'SAVING');
exception when duplicate_object then null;
end $$;

-- 2. Tables (columns and primary key; later migrations add their own columns)
create table if not exists public."User" (
  "id" uuid not null,
  "email" character varying(255) not null,
  "nickname" character varying(255),
  "timezone" character varying(255) not null default 'Asia/Seoul'::character varying,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  "age" integer,
  "region" character varying(255),
  constraint "User_pkey" PRIMARY KEY (id)
);
create table if not exists public."UserFinanceSetting" (
  "userId" uuid not null,
  "salaryAmount" bigint not null default 0,
  "salaryDay" integer not null default 25,
  "reportingStartDay" integer not null default 1,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  constraint "UserFinanceSetting_pkey" PRIMARY KEY ("userId")
);
create table if not exists public."Category" (
  "id" character varying(255) not null,
  "ownerUserId" uuid,
  "parentCategoryId" character varying(255),
  "name" character varying(255) not null,
  "type" public."enum_Category_type" not null,
  "purposeType" public."enum_Category_purposeType" not null default 'GENERAL'::public."enum_Category_purposeType",
  "isActive" boolean not null default true,
  "sortOrder" integer not null default 0,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  constraint "Category_pkey" PRIMARY KEY (id)
);
create table if not exists public."BudgetAllocation" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "name" character varying(255) not null,
  "allocationType" public."enum_BudgetAllocation_allocationType" not null,
  "percentage" numeric(5,2) not null,
  "spendability" public."enum_BudgetAllocation_spendability" not null,
  "active" boolean not null default true,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  constraint "BudgetAllocation_pkey" PRIMARY KEY (id)
);
create table if not exists public."BudgetCycle" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "startDate" date not null,
  "endDate" date not null,
  "salarySnapshot" bigint not null,
  "plannedSavingAmount" bigint not null default 0,
  "plannedInvestmentAmount" bigint not null default 0,
  "plannedFlexibleAmount" bigint not null default 0,
  "plannedReservedAmount" bigint not null default 0,
  "status" public."enum_BudgetCycle_status" not null default 'UPCOMING'::public."enum_BudgetCycle_status",
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  constraint "BudgetCycle_pkey" PRIMARY KEY (id)
);
create table if not exists public."BudgetCycleAllocation" (
  "id" character varying(255) not null,
  "budgetCycleId" character varying(255) not null,
  "allocationId" character varying(255) not null,
  "name" character varying(255) not null,
  "percentage" numeric(5,2) not null,
  "amount" bigint not null,
  "spendability" public."enum_BudgetCycleAllocation_spendability" not null,
  constraint "BudgetCycleAllocation_pkey" PRIMARY KEY (id)
);
create table if not exists public."Transaction" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "budgetCycleId" character varying(255),
  "categoryId" character varying(255) not null,
  "type" public."enum_Transaction_type" not null,
  "amount" bigint not null,
  "occurredAt" date not null,
  "merchantOrTitle" character varying(255) not null,
  "memo" character varying(255),
  "source" public."enum_Transaction_source" not null default 'MANUAL'::public."enum_Transaction_source",
  "status" public."enum_Transaction_status" not null default 'CONFIRMED'::public."enum_Transaction_status",
  "userEdited" boolean not null default false,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  "notificationId" character varying(255),
  constraint "Transaction_pkey" PRIMARY KEY (id)
);
create table if not exists public."FixedExpense" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "categoryId" character varying(255) not null,
  "name" character varying(255) not null,
  "expectedAmount" bigint not null,
  "billingDay" integer not null,
  "recurrenceType" public."enum_FixedExpense_recurrenceType" not null,
  "startDate" date not null,
  "endDate" date,
  "active" boolean not null default true,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  constraint "FixedExpense_pkey" PRIMARY KEY (id)
);
create table if not exists public."FixedExpenseOccurrence" (
  "id" character varying(255) not null,
  "fixedExpenseId" character varying(255) not null,
  "dueDate" date not null,
  "expectedAmount" bigint not null,
  "status" public."enum_FixedExpenseOccurrence_status" not null default 'SCHEDULED'::public."enum_FixedExpenseOccurrence_status",
  "matchedTransactionId" character varying(255),
  constraint "FixedExpenseOccurrence_pkey" PRIMARY KEY (id)
);
create table if not exists public."NotificationInbox" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "eventId" character varying(255) not null,
  "packageName" character varying(255) not null,
  "title" character varying(500) not null,
  "content" text not null,
  "timestamp" bigint not null,
  "source" character varying(64) not null default 'ANDROID_NOTIFICATION'::character varying,
  "status" character varying(32) not null default 'RECEIVED'::character varying,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  "eventType" character varying(32) not null default 'UNKNOWN'::character varying,
  "parsedAmount" bigint,
  "parsedOccurredAt" date,
  "parsedMerchant" character varying(255),
  "parsedCategoryId" character varying(255),
  "parseConfidence" numeric(5,4),
  "parseStatus" character varying(32) not null default 'REVIEW_REQUIRED'::character varying,
  "transactionId" character varying(255),
  constraint "NotificationInbox_pkey" PRIMARY KEY (id)
);
create table if not exists public."Policy" (
  "id" character varying(255) not null,
  "title" character varying(255) not null,
  "provider" character varying(255) not null,
  "providerType" public."enum_Policy_providerType" not null,
  "category" character varying(255) not null,
  "summary" character varying(255) not null,
  "description" text not null,
  "ageMin" integer,
  "ageMax" integer,
  "region" character varying(255),
  "applicationStartDate" date,
  "applicationEndDate" date,
  "applicationUrl" text not null,
  "sourceUrl" text not null,
  "dataCollectedAt" timestamp with time zone not null,
  "createdAt" timestamp with time zone not null,
  "updatedAt" timestamp with time zone not null,
  "presentation" jsonb,
  "presentationGeneratedAt" timestamp with time zone,
  "presentationVersion" character varying(32),
  "presentationSourceHash" character varying(64),
  "presentationProvider" character varying(32),
  constraint "Policy_pkey" PRIMARY KEY (id)
);
create table if not exists public."PolicyBookmark" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "policyId" character varying(255) not null,
  "createdAt" timestamp with time zone not null,
  constraint "PolicyBookmark_pkey" PRIMARY KEY (id)
);
create table if not exists public."PolicyCalendarEvent" (
  "id" character varying(255) not null,
  "userId" uuid not null,
  "policyId" character varying(255) not null,
  "eventDate" date not null,
  "note" character varying(255),
  "createdAt" timestamp with time zone not null,
  constraint "PolicyCalendarEvent_pkey" PRIMARY KEY (id)
);

-- 3. Unique, check and foreign-key constraints (added only if missing)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'User_email_key' and conrelid = 'public."User"'::regclass) then
    alter table public."User" add constraint "User_email_key" UNIQUE (email);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'User_email_key1' and conrelid = 'public."User"'::regclass) then
    alter table public."User" add constraint "User_email_key1" UNIQUE (email);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'FixedExpenseOccurrence_matchedTransactionId_key' and conrelid = 'public."FixedExpenseOccurrence"'::regclass) then
    alter table public."FixedExpenseOccurrence" add constraint "FixedExpenseOccurrence_matchedTransactionId_key" UNIQUE ("matchedTransactionId");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'NotificationInbox_user_event_unique' and conrelid = 'public."NotificationInbox"'::regclass) then
    alter table public."NotificationInbox" add constraint "NotificationInbox_user_event_unique" UNIQUE ("userId", "eventId");
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'NotificationInbox_source_check' and conrelid = 'public."NotificationInbox"'::regclass) then
    alter table public."NotificationInbox" add constraint "NotificationInbox_source_check" CHECK (((source)::text = 'ANDROID_NOTIFICATION'::text));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'NotificationInbox_status_check' and conrelid = 'public."NotificationInbox"'::regclass) then
    alter table public."NotificationInbox" add constraint "NotificationInbox_status_check" CHECK (((status)::text = ANY (ARRAY[('RECEIVED'::character varying)::text, ('PROCESSED'::character varying)::text, ('FAILED'::character varying)::text])));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'UserFinanceSetting_userId_fkey' and conrelid = 'public."UserFinanceSetting"'::regclass) then
    alter table public."UserFinanceSetting" add constraint "UserFinanceSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Category_ownerUserId_fkey' and conrelid = 'public."Category"'::regclass) then
    alter table public."Category" add constraint "Category_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Category_parentCategoryId_fkey' and conrelid = 'public."Category"'::regclass) then
    alter table public."Category" add constraint "Category_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'BudgetAllocation_userId_fkey' and conrelid = 'public."BudgetAllocation"'::regclass) then
    alter table public."BudgetAllocation" add constraint "BudgetAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'BudgetCycle_userId_fkey' and conrelid = 'public."BudgetCycle"'::regclass) then
    alter table public."BudgetCycle" add constraint "BudgetCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'BudgetCycleAllocation_allocationId_fkey' and conrelid = 'public."BudgetCycleAllocation"'::regclass) then
    alter table public."BudgetCycleAllocation" add constraint "BudgetCycleAllocation_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES public."BudgetAllocation"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'BudgetCycleAllocation_budgetCycleId_fkey' and conrelid = 'public."BudgetCycleAllocation"'::regclass) then
    alter table public."BudgetCycleAllocation" add constraint "BudgetCycleAllocation_budgetCycleId_fkey" FOREIGN KEY ("budgetCycleId") REFERENCES public."BudgetCycle"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Transaction_budgetCycleId_fkey' and conrelid = 'public."Transaction"'::regclass) then
    alter table public."Transaction" add constraint "Transaction_budgetCycleId_fkey" FOREIGN KEY ("budgetCycleId") REFERENCES public."BudgetCycle"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Transaction_categoryId_fkey' and conrelid = 'public."Transaction"'::regclass) then
    alter table public."Transaction" add constraint "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Transaction_userId_fkey' and conrelid = 'public."Transaction"'::regclass) then
    alter table public."Transaction" add constraint "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'FixedExpense_categoryId_fkey' and conrelid = 'public."FixedExpense"'::regclass) then
    alter table public."FixedExpense" add constraint "FixedExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'FixedExpense_userId_fkey' and conrelid = 'public."FixedExpense"'::regclass) then
    alter table public."FixedExpense" add constraint "FixedExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'FixedExpenseOccurrence_fixedExpenseId_fkey' and conrelid = 'public."FixedExpenseOccurrence"'::regclass) then
    alter table public."FixedExpenseOccurrence" add constraint "FixedExpenseOccurrence_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES public."FixedExpense"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'FixedExpenseOccurrence_matchedTransactionId_fkey' and conrelid = 'public."FixedExpenseOccurrence"'::regclass) then
    alter table public."FixedExpenseOccurrence" add constraint "FixedExpenseOccurrence_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES public."Transaction"(id) ON UPDATE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'NotificationInbox_userId_fkey' and conrelid = 'public."NotificationInbox"'::regclass) then
    alter table public."NotificationInbox" add constraint "NotificationInbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'PolicyBookmark_policyId_fkey' and conrelid = 'public."PolicyBookmark"'::regclass) then
    alter table public."PolicyBookmark" add constraint "PolicyBookmark_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'PolicyBookmark_userId_fkey' and conrelid = 'public."PolicyBookmark"'::regclass) then
    alter table public."PolicyBookmark" add constraint "PolicyBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'PolicyCalendarEvent_policyId_fkey' and conrelid = 'public."PolicyCalendarEvent"'::regclass) then
    alter table public."PolicyCalendarEvent" add constraint "PolicyCalendarEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'PolicyCalendarEvent_userId_fkey' and conrelid = 'public."PolicyCalendarEvent"'::regclass) then
    alter table public."PolicyCalendarEvent" add constraint "PolicyCalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  end if;
end $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS category_owner_user_id_is_active ON public."Category" USING btree ("ownerUserId", "isActive");
CREATE INDEX IF NOT EXISTS budget_allocation_user_id_active ON public."BudgetAllocation" USING btree ("userId", active);
CREATE UNIQUE INDEX IF NOT EXISTS budget_cycle_user_id_start_date ON public."BudgetCycle" USING btree ("userId", "startDate");
CREATE INDEX IF NOT EXISTS budget_cycle_user_id_start_date_end_date ON public."BudgetCycle" USING btree ("userId", "startDate", "endDate");
CREATE UNIQUE INDEX IF NOT EXISTS budget_cycle_allocation_budget_cycle_id_allocation_id ON public."BudgetCycleAllocation" USING btree ("budgetCycleId", "allocationId");
CREATE UNIQUE INDEX IF NOT EXISTS transaction_notification_id ON public."Transaction" USING btree ("notificationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_notification_id_unique" ON public."Transaction" USING btree ("notificationId") WHERE ("notificationId" IS NOT NULL);
CREATE INDEX IF NOT EXISTS transaction_user_id_budget_cycle_id ON public."Transaction" USING btree ("userId", "budgetCycleId");
CREATE INDEX IF NOT EXISTS transaction_user_id_occurred_at ON public."Transaction" USING btree ("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS transaction_user_id_status_occurred_at ON public."Transaction" USING btree ("userId", status, "occurredAt");
CREATE INDEX IF NOT EXISTS fixed_expense_user_id ON public."FixedExpense" USING btree ("userId");
CREATE INDEX IF NOT EXISTS fixed_expense_occurrence_fixed_expense_id_due_date ON public."FixedExpenseOccurrence" USING btree ("fixedExpenseId", "dueDate");
CREATE INDEX IF NOT EXISTS notification_inbox_user_id_created_at ON public."NotificationInbox" USING btree ("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS notification_inbox_user_id_event_id ON public."NotificationInbox" USING btree ("userId", "eventId");
CREATE INDEX IF NOT EXISTS notification_inbox_user_id_parse_status ON public."NotificationInbox" USING btree ("userId", "parseStatus");
CREATE INDEX IF NOT EXISTS "NotificationInbox_user_created_idx" ON public."NotificationInbox" USING btree ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS policy_application_end_date ON public."Policy" USING btree ("applicationEndDate");
CREATE INDEX IF NOT EXISTS policy_category ON public."Policy" USING btree (category);
CREATE INDEX IF NOT EXISTS policy_region ON public."Policy" USING btree (region);
CREATE UNIQUE INDEX IF NOT EXISTS policy_bookmark_user_id_policy_id ON public."PolicyBookmark" USING btree ("userId", "policyId");
CREATE INDEX IF NOT EXISTS policy_calendar_event_user_id_event_date ON public."PolicyCalendarEvent" USING btree ("userId", "eventDate");
