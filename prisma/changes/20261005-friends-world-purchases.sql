-- Additive server-only PostgreSQL rollout. Apply via qa-friends-world-migrate.mjs
-- before deploying its generated client. Every relation is schema-qualified.
-- The trusted runner replaces __FINDME_SCHEMA__ with its verified target schema.
-- No existing game, order, photo, or legacy sharing capability is changed.
CREATE TABLE IF NOT EXISTS "__FINDME_SCHEMA__"."ChildWorldPurchase" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "familyChildId" TEXT NOT NULL,
  "worldSlug" TEXT NOT NULL, "activeGameId" TEXT, "returnGameId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildWorldPurchase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "__FINDME_SCHEMA__"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChildWorldPurchase_familyChildId_fkey" FOREIGN KEY ("familyChildId") REFERENCES "__FINDME_SCHEMA__"."FamilyChild"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChildWorldPurchase_activeGameId_fkey" FOREIGN KEY ("activeGameId") REFERENCES "__FINDME_SCHEMA__"."Game"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "ChildWorldPurchase_familyChildId_worldSlug_key" ON "__FINDME_SCHEMA__"."ChildWorldPurchase" ("familyChildId", "worldSlug");
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "ChildWorldPurchase_activeGameId_key" ON "__FINDME_SCHEMA__"."ChildWorldPurchase" ("activeGameId");
-- statement-break
CREATE INDEX IF NOT EXISTS "ChildWorldPurchase_ownerId_idx" ON "__FINDME_SCHEMA__"."ChildWorldPurchase" ("ownerId");
-- statement-break
ALTER TABLE "__FINDME_SCHEMA__"."Order" ADD COLUMN IF NOT EXISTS "checkoutKey" TEXT;
-- statement-break
ALTER TABLE "__FINDME_SCHEMA__"."Order" ADD COLUMN IF NOT EXISTS "checkoutClaimUntil" TIMESTAMP(3);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "Order_checkoutKey_key" ON "__FINDME_SCHEMA__"."Order" ("checkoutKey");
-- statement-break
CREATE TABLE IF NOT EXISTS "__FINDME_SCHEMA__"."GuestShare" (
  "id" TEXT PRIMARY KEY, "gameId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "worldSlug" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "sourceConfigSha256" TEXT NOT NULL, "configJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "resultsDeleteAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0, "seenRevision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "GuestShare_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "__FINDME_SCHEMA__"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "GuestShare_tokenHash_key" ON "__FINDME_SCHEMA__"."GuestShare" ("tokenHash");
-- statement-break
CREATE INDEX IF NOT EXISTS "GuestShare_gameId_worldSlug_createdAt_idx" ON "__FINDME_SCHEMA__"."GuestShare" ("gameId", "worldSlug", "createdAt");
-- statement-break
CREATE INDEX IF NOT EXISTS "GuestShare_resultsDeleteAt_idx" ON "__FINDME_SCHEMA__"."GuestShare" ("resultsDeleteAt");
-- statement-break
CREATE TABLE IF NOT EXISTS "__FINDME_SCHEMA__"."GuestParticipant" (
  "id" TEXT PRIMARY KEY, "shareId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "nicknameId" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0, "activityRevision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "GuestParticipant_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "__FINDME_SCHEMA__"."GuestShare"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "GuestParticipant_tokenHash_key" ON "__FINDME_SCHEMA__"."GuestParticipant" ("tokenHash");
-- statement-break
CREATE INDEX IF NOT EXISTS "GuestParticipant_shareId_createdAt_idx" ON "__FINDME_SCHEMA__"."GuestParticipant" ("shareId", "createdAt");
-- statement-break
-- Prisma is the only caller. Anonymous guests use the application boundary,
-- never the Supabase Data API. RLS has no client-facing policy by design.
ALTER TABLE "__FINDME_SCHEMA__"."ChildWorldPurchase" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "__FINDME_SCHEMA__"."GuestShare" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "__FINDME_SCHEMA__"."GuestParticipant" ENABLE ROW LEVEL SECURITY;
-- statement-break
REVOKE ALL ON "__FINDME_SCHEMA__"."ChildWorldPurchase", "__FINDME_SCHEMA__"."GuestShare", "__FINDME_SCHEMA__"."GuestParticipant" FROM PUBLIC, anon, authenticated;
