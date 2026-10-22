import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import type { Container } from "../container";
import { adjustTarget, markTargetForRegeneration, requestNewPhoto } from "../admin.service";
import { replacePhotoForPaidGame } from "../create-flow.service";

let dir: string, db: PrismaClient, c: Container, sequence = 0;
const actor = { type: "ADMIN", id: "synthetic-admin" } as const;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-admin-route-guards-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "guards.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, jobs: { enqueue: vi.fn() }, analytics: { track: vi.fn() } } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No network in route guard regression"); }));
}, 180_000);
afterAll(async () => {
  await db.$disconnect(); vi.unstubAllGlobals();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-admin-route-guards-")) rmSync(dir, { recursive: true, force: true });
});
async function seed(status: string, styleVersion = "local-patch-world-v1") {
  const id = `guard-${++sequence}`, ownerId = `owner-${id}`, childId = `child-${id}`, targetId = `target-${id}`;
  await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic Child", ageYears: 5 } });
  await db.game.create({ data: { id, ownerId, childProfileId: childId, styleVersion, status } });
  await db.gameScene.create({ data: { id: `scene-${id}`, gameId: id, sceneSlug: "newyork", sceneVersion: 12, orderIndex: 0 } });
  await db.targetInstance.create({ data: { id: targetId, gameSceneId: `scene-${id}`, targetId: "hide-1", targetType: "child", spriteKind: "image", slotAId: "A", slotBId: "B", status: "NEEDS_REGENERATION", attempts: 2 } });
  await db.targetVariantAsset.create({ data: { id: `variant-${id}`, targetInstanceId: targetId, variant: "A", slotId: "A", status: "FAILED", attempts: 2, costCents: 10, judgeJson: '{"immutable":true}', rejectedAssetIdsJson: '["synthetic-prior"]' } });
  await db.generationJob.create({ data: { id: `job-${id}`, gameId: id, status: "QUEUED", currentStep: "local-patch", attempts: 7 } });
  await db.fileBlob.create({ data: { key: `retained-${id}`, data: Buffer.from("immutable synthetic receipt"), contentType: "application/json" } });
  return { id, targetId, childId };
}
async function snapshot(f: Awaited<ReturnType<typeof seed>>) {
  return {
    game: await db.game.findUniqueOrThrow({ where: { id: f.id } }),
    child: await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } }),
    scene: await db.gameScene.findUniqueOrThrow({ where: { id: `scene-${f.id}` } }),
    target: await db.targetInstance.findUniqueOrThrow({ where: { id: f.targetId } }),
    variant: await db.targetVariantAsset.findUniqueOrThrow({ where: { id: `variant-${f.id}` } }),
    job: await db.generationJob.findUniqueOrThrow({ where: { id: `job-${f.id}` } }),
    retained: await db.fileBlob.findUniqueOrThrow({ where: { key: `retained-${f.id}` } }),
    audit: await db.auditLog.findMany({ where: { OR: [{ entityId: f.id }, { entityId: f.targetId }] } }),
  };
}
describe("legacy admin controls cannot rewrite a bound local-patch game", () => {
  it.each(["READY", "TARGETS_GENERATING", "MANUAL_REVIEW"])("refuses generic regeneration from %s before any mutation", async status => {
    const f = await seed(status), before = await snapshot(f);
    await expect(markTargetForRegeneration(c, f.targetId, actor)).rejects.toMatchObject({ code: "unsupported" });
    expect(await snapshot(f)).toEqual(before);
  });
  it("refuses stale placement and photo request actions without changing paid image bindings", async () => {
    const f = await seed("AVATAR_GENERATING"), before = await snapshot(f);
    await expect(adjustTarget(c, f.targetId, { dx: .01, dy: 0, scale: 1 }, actor)).rejects.toMatchObject({ code: "unsupported" });
    await expect(requestNewPhoto(c, f.id, actor, "synthetic note")).rejects.toMatchObject({ code: "unsupported" });
    expect(await snapshot(f)).toEqual(before);
  });
  it.each(["local-patch-world-v1", "fixed-sprite-v3", "fixed-sprite-board-wizard-v1"])("refuses a historical needs-photo form for %s before decoding, storing, deleting or queueing", async style => {
    const f = await seed("NEEDS_NEW_PHOTO", style), before = await snapshot(f);
    // An invalid image cannot even reach the decoder on the prohibited path.
    expect(await replacePhotoForPaidGame(c, f.id, { buffer: Buffer.from("not an image"), mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await snapshot(f)).toEqual(before);
    expect(c.analytics.track).not.toHaveBeenCalled();
  });
  it("keeps historical collage regeneration and photo-request behavior", async () => {
    const f = await seed("READY", "collage-v1");
    await markTargetForRegeneration(c, f.targetId, actor);
    expect((await snapshot(f)).game.status).toBe("NEEDS_REGENERATION");
    expect((await snapshot(f)).variant).toMatchObject({ status: "PENDING", attempts: 0, judgeJson: '{"immutable":true}' });
    expect(c.jobs.enqueue).toHaveBeenCalledWith("generate-game", { gameId: f.id });
    const photo = await seed("AVATAR_GENERATING", "collage-v1");
    await requestNewPhoto(c, photo.id, actor, "synthetic replacement request");
    expect((await snapshot(photo)).game.status).toBe("NEEDS_NEW_PHOTO");
    expect(fetch).not.toHaveBeenCalled();
  });
});
