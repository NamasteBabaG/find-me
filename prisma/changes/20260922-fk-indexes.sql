-- Non-destructive PostgreSQL migration. Apply separately to each verified schema.
-- Set search_path explicitly to qa OR public before running; do not run against
-- public until its missing product migrations have been applied and verified.
-- CONCURRENTLY must run outside a transaction. Verify pg_index.indisvalid after
-- an interrupted attempt: IF NOT EXISTS does not repair an invalid index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MagicLinkToken_userId_idx" ON "MagicLinkToken" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChildProfile_ownerId_idx" ON "ChildProfile" ("ownerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Game_ownerId_idx" ON "Game" ("ownerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Game_childProfileId_idx" ON "Game" ("childProfileId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_ownerId_idx" ON "Asset" ("ownerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentEvent_orderId_idx" ON "PaymentEvent" ("orderId");
