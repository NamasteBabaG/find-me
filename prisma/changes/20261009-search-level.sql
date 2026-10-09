-- Additive server-only PostgreSQL rollout. Apply via scripts/qa-search-level-migrate.mjs
-- (--dry-run, then --apply, then --verify) BEFORE deploying the client that reads Game.searchLevel:
-- Prisma selects every Game column, so the new client fails on a schema without it.
-- The trusted runner replaces __FINDME_SCHEMA__ with its verified target schema.
-- Existing drafts and games intentionally keep NULL: they play the historical (Explorers)
-- boards. No level is inferred from age, name, photo or passport, and no row is rewritten.
ALTER TABLE "__FINDME_SCHEMA__"."Game" ADD COLUMN IF NOT EXISTS "searchLevel" TEXT;
