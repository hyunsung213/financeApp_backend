-- Per-user display overrides for categories. System categories are shared
-- rows (ownerUserId null) referenced by id from transactions, the budget plan,
-- reports and the notification parser, so a user's rename/icon/color lives
-- here instead of on the Category row. Custom categories keep their name on
-- their own row and only use icon/color from here.
--
-- Rollback:
--   drop table if exists public."UserCategoryPreference";

create table if not exists public."UserCategoryPreference" (
  "userId" uuid not null,
  "categoryId" character varying(255) not null,
  "displayName" character varying(50),
  icon character varying(40),
  color character varying(7),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint "UserCategoryPreference_pkey" primary key ("userId", "categoryId"),
  constraint "UserCategoryPreference_userId_fkey" foreign key ("userId")
    references public."User"(id) on update cascade on delete cascade,
  constraint "UserCategoryPreference_categoryId_fkey" foreign key ("categoryId")
    references public."Category"(id) on update cascade on delete cascade,
  constraint "UserCategoryPreference_color_valid"
    check (color is null or color ~ '^#[0-9A-F]{6}$')
);

-- The PK already serves lookups by userId; this one serves the categoryId FK.
create index if not exists "UserCategoryPreference_category_id_idx"
  on public."UserCategoryPreference" ("categoryId");
