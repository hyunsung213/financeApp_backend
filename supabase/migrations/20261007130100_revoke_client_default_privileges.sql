-- New tables, sequences and functions in public are no longer granted to the
-- client roles automatically.
--
-- Supabase's default privileges grant anon and authenticated every privilege
-- on any table, sequence and function the postgres role creates in public, so
-- each new table was exposed through the Data API until a migration revoked
-- it (20261007090100 only revoked the tables that existed then). The app
-- never uses the Data API (the Flutter client uses Supabase only for Auth), so
-- the client roles get nothing by default; a migration that wants to expose an
-- object grants it explicitly, as 20261007090100 does for Policy.
-- service_role keeps its defaults. Existing objects are unchanged.
--
-- Only the postgres role's defaults are changed: the app's tables are created
-- by postgres (migrations, SQL editor). Defaults owned by supabase_admin cannot
-- be changed by postgres and do not apply to the app's objects.
--
-- Re-runnable. Rollback:
--   alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
