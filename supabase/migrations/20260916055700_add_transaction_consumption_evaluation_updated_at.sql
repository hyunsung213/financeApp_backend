alter table public."Transaction"
  add column if not exists "consumptionEvaluationUpdatedAt" timestamptz;

-- Backfill: for existing rows that already carry a consumptionEvaluation,
-- there is no historical record of when it was set, so approximate it with
-- the row's updatedAt (the closest available timestamp). New evaluations
-- going forward get an accurate consumptionEvaluationUpdatedAt set by the
-- application on create/update.
update public."Transaction"
set "consumptionEvaluationUpdatedAt" = "updatedAt"
where "consumptionEvaluation" is not null
  and "consumptionEvaluationUpdatedAt" is null;

create index if not exists "transaction_user_evaluation_evaluated_at"
  on public."Transaction" ("userId", "consumptionEvaluation", "consumptionEvaluationUpdatedAt");
