do $$
begin
  create type public."enum_Transaction_consumptionEvaluation" as enum (
    'GOOD',
    'NORMAL',
    'REGRETTABLE',
    'BAD'
  );
exception
  when duplicate_object then null;
end $$;

alter table public."Transaction"
  add column if not exists "consumptionEvaluation" public."enum_Transaction_consumptionEvaluation";
