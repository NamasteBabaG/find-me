-- Additive PostgreSQL rollout. Run using scripts/qa-passport-migrate.mjs;
-- the runner validates the isolated QA target and wraps ALL statements in one
-- transaction. Old code remains compatible; rollback is the previous app, not
-- destructive table drops. Never merge family identities by name or photo.
CREATE TABLE IF NOT EXISTS "FamilyChild" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "FamilyChild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
CREATE INDEX IF NOT EXISTS "FamilyChild_ownerId_createdAt_idx" ON "FamilyChild"("ownerId", "createdAt");
-- statement-break
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "familyChildId" TEXT;
-- statement-break
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Game_familyChildId_fkey' AND conrelid = '"Game"'::regclass) THEN
    ALTER TABLE "Game" ADD CONSTRAINT "Game_familyChildId_fkey" FOREIGN KEY ("familyChildId") REFERENCES "FamilyChild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
-- statement-break
CREATE INDEX IF NOT EXISTS "Game_familyChildId_createdAt_idx" ON "Game"("familyChildId", "createdAt");
-- statement-break
CREATE TABLE IF NOT EXISTS "PassportShare" (
  "id" TEXT PRIMARY KEY, "familyChildId" TEXT NOT NULL, "alias" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PassportShare_familyChildId_fkey" FOREIGN KEY ("familyChildId") REFERENCES "FamilyChild"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS "PassportShare_familyChildId_key" ON "PassportShare"("familyChildId");
-- statement-break
CREATE TABLE IF NOT EXISTS "PassportPagePreference" (
  "gameId" TEXT NOT NULL, "boardSlug" TEXT NOT NULL, "photoTargetId" TEXT,
  "stampSeen" BOOLEAN NOT NULL DEFAULT false, "seenDiscoveries" TEXT NOT NULL DEFAULT '[]', "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PassportPagePreference_pkey" PRIMARY KEY ("gameId", "boardSlug"),
  CONSTRAINT "PassportPagePreference_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
-- Server-owned Prisma tables, not Supabase client tables. No Data API access.
ALTER TABLE "FamilyChild" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "PassportShare" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "PassportPagePreference" ENABLE ROW LEVEL SECURITY;
-- statement-break
REVOKE ALL ON "FamilyChild", "PassportShare", "PassportPagePreference" FROM PUBLIC, anon, authenticated;
-- statement-break
-- Serialize old-app checkout while the one-time historical binding commits.
LOCK TABLE "Game" IN SHARE ROW EXCLUSIVE MODE;
-- statement-break
INSERT INTO "FamilyChild" ("id", "ownerId", "displayName", "createdAt")
SELECT 'fam_' || substring(md5('passport-family:' || g."id") for 20), g."ownerId", c."displayName", g."createdAt"
FROM "Game" g JOIN "ChildProfile" c ON c."id" = g."childProfileId" AND c."ownerId" = g."ownerId" AND c."deletedAt" IS NULL
WHERE g."familyChildId" IS NULL AND g."deletedAt" IS NULL AND g."status" NOT IN ('CANCELLED', 'REFUNDED', 'DELETED')
  AND EXISTS (SELECT 1 FROM "Order" o WHERE o."gameId" = g."id" AND o."userId" = g."ownerId" AND o."paymentStatus" = 'PAID')
ON CONFLICT ("id") DO NOTHING;
-- statement-break
UPDATE "Game" g SET "familyChildId" = f."id" FROM "FamilyChild" f
WHERE g."familyChildId" IS NULL AND g."deletedAt" IS NULL AND g."status" NOT IN ('CANCELLED', 'REFUNDED', 'DELETED')
  AND f."id" = 'fam_' || substring(md5('passport-family:' || g."id") for 20) AND f."ownerId" = g."ownerId" AND f."deletedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "ChildProfile" c WHERE c."id" = g."childProfileId" AND c."ownerId" = g."ownerId" AND c."deletedAt" IS NULL)
  AND EXISTS (SELECT 1 FROM "Order" o WHERE o."gameId" = g."id" AND o."userId" = g."ownerId" AND o."paymentStatus" = 'PAID');
