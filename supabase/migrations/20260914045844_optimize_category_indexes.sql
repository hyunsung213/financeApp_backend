drop index if exists public."category_owner_user_id_source_category_id";

create index if not exists "category_parent_category_id_idx"
  on public."Category" ("parentCategoryId");
