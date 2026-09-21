alter table public."Category"
  add column if not exists "sourceCategoryId" character varying;

create unique index if not exists "category_owner_source_unique"
  on public."Category" ("ownerUserId", "sourceCategoryId");
