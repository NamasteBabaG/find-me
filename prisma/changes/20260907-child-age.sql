-- Additive Postgres change. Apply ONLY to a verified target schema before deploying the new client.
-- Existing profiles intentionally retain NULL; no invented age and no data deletion.
ALTER TABLE "qa"."ChildProfile" ADD COLUMN IF NOT EXISTS "ageYears" INTEGER;
