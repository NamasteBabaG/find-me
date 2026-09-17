/** Creates a NEW disposable local database using only the fictional public demo. */
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyTestSchema } from "../src/lib/test-schema";
import { newId, newSecretToken, hashToken } from "../src/lib/ids";
import { publicBeachDemo } from "../content/demo/beach-v1";
import { GameConfigSchema } from "../src/domain/game/config";
import { emptyAdventureProgress, recordAdventureEvent } from "../src/domain/adventure/progress";
import { LocalDiskStorage } from "../src/infra/storage/local";
import { tokenForLink } from "../src/services/share-link.service";
import { managePassportShare } from "../src/services/passport-share.service";

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "findme-passport-smoke-"));
  const databaseUrl = `file:${path.join(directory, "test.db").replace(/\\/g, "/")}`;
  const storageRoot = path.join(directory, "storage"), storage = new LocalDiskStorage(storageRoot);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await applyTestSchema(db);
    const ownerId = newId("usr"), childId = newId("fam"), siblingId = newId("fam"), gameId = newId("game");
    await db.user.create({ data: { id: ownerId, email: "passport-smoke@example.invalid" } });
    await db.familyChild.createMany({ data: [{ id: childId, ownerId, displayName: "נועה — הדגמה" }, { id: siblingId, ownerId, displayName: "אח/ות — הדגמה" }] });
    const config = publicBeachDemo("he"); config.gameId = gameId;
    const art = config.adventure!, board = art.boards[0]!, scene = config.scenes[0]!;
    async function asset(url: string, type: string) {
      const id = newId("ast"), bytes = await readFile(path.join(process.cwd(), "public", url));
      await storage.put(`${id}.webp`, bytes);
      await db.asset.create({ data: { id, ownerId, type, visibility: "GAME", status: "READY", storagePath: `${id}.webp`, mimeType: "image/webp" } }); return id;
    }
    art.avatarAssetId = await asset(config.child.avatarUrl, "AVATAR"); config.child.avatarUrl = `/api/assets/${art.avatarAssetId}`;
    for (const binding of board.targetImages) {
      const target = scene.targets.find(t => t.id === binding.targetId)!, sprite = target.spriteByVariant?.A ?? target.sprite;
      if (sprite.kind !== "image") throw new Error("fixture-image");
      const id = await asset(sprite.url, "TARGET_SPRITE"); binding.A.assetId = id; binding.B.assetId = id;
      target.sprite = { ...sprite, url: `/api/assets/${id}` }; target.spriteByVariant = { A: target.sprite, B: target.sprite };
    }
    config.scenes = Array.from({ length: 9 }, (_, i) => ({ ...structuredClone(scene), slug: i ? `example-place-${i + 1}` : scene.slug, name: i ? `מקום הדגמה ${i + 1}` : scene.name }));
    art.boards = config.scenes.map(s => ({ ...structuredClone(board), boardSlug: s.slug }));
    if (config.world) { config.world.name = "עולם הבדיקות — לא תוכן למכירה"; config.world.nodes = config.scenes.map((s, i) => ({ ...config.world!.nodes[0]!, boardSlug: s.slug, routeIndex: i + 1, x: .2 + i % 3 * .3, y: .2 + Math.floor(i / 3) * .3 })); config.worlds = [config.world]; }
    GameConfigSchema.parse(config);
    let progress = emptyAdventureProgress(gameId, art);
    for (const [i, b] of art.boards.entries()) {
      for (const targetId of b.targetIds.slice(0, i < 2 ? 3 : i === 2 ? 2 : 0)) progress = recordAdventureEvent(progress, gameId, art, { kind: "target-found", boardSlug: b.boardSlug, targetId, variant: "A" }).progress;
      for (const item of b.discoveries.slice(0, i === 0 ? 2 : i === 1 || i === 2 ? 6 : 0)) progress = recordAdventureEvent(progress, gameId, art, { kind: "discovery-found", boardSlug: b.boardSlug, discoveryId: item.id }).progress;
    }
    await db.game.create({ data: { id: gameId, ownerId, familyChildId: childId, status: "READY", configJson: JSON.stringify(config), sceneCount: 9, adventureAlbum: { create: { revision: 1, snapshotJson: JSON.stringify(progress) } } } });
    await db.order.create({ data: { id: newId("ord"), gameId, userId: ownerId, paymentStatus: "PAID", amountAgorot: 0, provider: "mock", packageTier: "ONE_WORLD" } });
    const secret = "passport-smoke-local-secret-only", appUrl = "http://localhost:3022";
    const link = { id: newId("shr"), createdAt: new Date() };
    const playToken = tokenForLink({ secret }, link);
    await db.shareLink.create({ data: { ...link, gameId, kind: "PLAYER", tokenHash: hashToken(playToken) } });
    const passportShare = await managePassportShare({ db, secret, appUrl, storage }, ownerId, childId, "enable", "Demo");
    const token = newSecretToken();
    await db.magicLinkToken.create({ data: { id: newId("mlt"), userId: ownerId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const result = { directory, databaseUrl, storageRoot, childId, siblingId, gameId, playUrl: `${appUrl}/play/${playToken}`, passportUrl: passportShare.url, login: `${appUrl}/auth/magic-link?token=${token}&next=/family/${childId}/passport` };
    await mkdir("output/passport", { recursive: true }); await writeFile("output/passport/smoke-fixture.json", JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ directory, childId, gameId, info: "output/passport/smoke-fixture.json" }));
  } finally { await db.$disconnect(); }
}
void main();
