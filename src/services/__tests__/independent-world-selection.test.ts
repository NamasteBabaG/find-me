import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { selectPackage, selectWorlds, worldsForDraft, availablePackages } from "../create-flow.service";
import { boardsOfWorlds } from "../world-catalog.service";
import { chooseDraftChild, familyOverview } from "../family.service";
import type { Container } from "../container";

vi.mock("../../lib/env", () => ({ env: () => ({ APP_ENV: "development" }) }));
let db: PrismaClient, scratch: string, sequence = 0;
const context = () => ({ db, analytics: { track: vi.fn() } }) as unknown as Container;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-independent-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: "parent", email: "independent@example.invalid" } });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-independent-")) await rm(scratch, { recursive: true, force: true });
});
async function draft(localPatch = false) {
  return db.game.create({ data: { id: `independent-${++sequence}`, ownerId: "parent", draftToken: `cookie-${sequence}`,
    status: "PHOTO_APPROVED", ...(localPatch ? { styleVersion: "local-patch-world-v1" } : {}) } });
}
const scenes = (id: string) => db.gameScene.findMany({ where: { gameId: id }, orderBy: { orderIndex: "asc" } });

describe("independent worlds are a choice, not a difficulty ladder", () => {
  it("allows the second world as the only purchased world, and preserves it on returning to packages", async () => {
    const g = await draft(), c = context();
    expect(await selectPackage(c, g.id, "ONE_WORLD")).toEqual({ ok: true });
    expect(await selectWorlds(c, g.id, ["kingdom"])).toEqual({ ok: true });
    expect((await scenes(g.id)).map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["kingdom"]));
    expect(await selectPackage(c, g.id, "ONE_WORLD")).toEqual({ ok: true });
    expect((await scenes(g.id)).map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["kingdom"]));
  });
  it("allows a non-adjacent pair in stable catalog order", async () => {
    const g = await draft(), c = context();
    await selectPackage(c, g.id, "TWO_WORLDS");
    expect(await selectWorlds(c, g.id, ["timetravel", "journey"])).toEqual({ ok: true });
    expect((await scenes(g.id)).map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["journey", "timetravel"]));
  });
  it("rejects unavailable, duplicate and wrong-count choices without modifying the draft", async () => {
    const g = await draft(), c = context();
    await selectPackage(c, g.id, "ONE_WORLD");
    const before = await scenes(g.id);
    for (const slugs of [[], ["no-such-world"], ["journey", "kingdom"]]) expect(await selectWorlds(c, g.id, slugs)).toMatchObject({ ok: false });
    expect(await scenes(g.id)).toEqual(before);
    await selectPackage(c, g.id, "TWO_WORLDS");
    expect(await selectWorlds(c, g.id, ["kingdom", "kingdom"])).toMatchObject({ ok: false, code: "WRONG_SCENE_COUNT" });
  });
  it("keeps unfinished magic out of the current three-hide rendering engine", async () => {
    const g = await draft(true), c = context();
    await selectPackage(c, g.id, "ONE_WORLD");
    const before = await scenes(g.id);
    expect(before).toHaveLength(9); expect(before.every(s => s.sceneVersion === 10)).toBe(true);
    expect(await selectWorlds(c, g.id, ["kingdom"])).toMatchObject({ ok: false, code: "SCENE_UNAVAILABLE" });
    expect(await scenes(g.id)).toEqual(before);
    expect(await selectPackage(c, g.id, "TWO_WORLDS")).toMatchObject({ ok: false, code: "PACKAGE_UNAVAILABLE" });
    expect((await worldsForDraft(c, g.styleVersion)).map(w => w.slug)).toEqual(["journey"]);
    expect((await availablePackages(c, g.styleVersion)).map(p => p.tier)).toEqual(["ONE_WORLD"]);
  });
  it("rolls back metadata and all scenes if inserting one board fails", async () => {
    const g = await draft(), c = context();
    await selectPackage(c, g.id, "ONE_WORLD");
    const before = await scenes(g.id), gameBefore = await db.game.findUniqueOrThrow({ where: { id: g.id } });
    const auditBefore = await db.auditLog.count();
    // A real database constraint, not a mocked transaction claiming to roll back.
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_selection BEFORE INSERT ON GameScene WHEN NEW.gameId = '${g.id}' AND NEW.orderIndex = 1 BEGIN SELECT RAISE(ABORT, 'selection test failure'); END`);
    try { await expect(selectPackage(c, g.id, "TWO_WORLDS")).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_selection"); }
    expect(await scenes(g.id)).toEqual(before);
    expect(await db.game.findUniqueOrThrow({ where: { id: g.id } })).toEqual(gameBefore);
    expect(await db.auditLog.count()).toBe(auditBefore);
  });
  it("returns from failed checkout through valid states without changing its selected world", async () => {
    const g = await draft(), c = context();
    await selectPackage(c, g.id, "ONE_WORLD"); await selectWorlds(c, g.id, ["kingdom"]);
    await db.game.update({ where: { id: g.id }, data: { status: "PAYMENT_FAILED" } });
    expect(await selectPackage(c, g.id, "ONE_WORLD")).toEqual({ ok: true });
    expect((await db.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PACKAGE_SELECTED");
    expect((await scenes(g.id)).map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["kingdom"]));
  });
  it("a payment arriving during catalog lookup cannot have its scenes replaced", async () => {
    const g = await draft(), c = context();
    await selectPackage(c, g.id, "ONE_WORLD");
    const before = await scenes(g.id), original = db.sceneOverride.findMany;
    // Explicit restoration avoids Prisma delegate spy/restore differences between Vitest versions.
    db.sceneOverride.findMany = (async (...args: Parameters<typeof original>) => {
      await db.game.update({ where: { id: g.id }, data: { status: "PAID" } });
      return original.apply(db.sceneOverride, args);
    }) as typeof original;
    try { expect(await selectWorlds(c, g.id, ["journey"])).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); }
    finally { db.sceneOverride.findMany = original; }
    expect(await scenes(g.id)).toEqual(before);
    expect((await db.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PAID");
  });
  it("keeps different worlds together for one child, separate from a same-name sibling", async () => {
    const a = await db.familyChild.create({ data: { id: "child-a", ownerId: "parent", displayName: "Same name" } });
    const b = await db.familyChild.create({ data: { id: "child-b", ownerId: "parent", displayName: "Same name" } });
    const games = [];
    for (const [familyChildId, world] of [[a.id, "kingdom"], [a.id, "journey"], [b.id, "timetravel"]] as const) {
      const g = await draft(); games.push(g);
      expect(await chooseDraftChild(db, { gameId: g.id, actorId: "parent", draftToken: g.draftToken, familyChildId, name: "Same name", ageYears: 5 })).toEqual({ ok: true });
      await selectPackage(context(), g.id, "ONE_WORLD");
      expect(await selectWorlds(context(), g.id, [world!])).toEqual({ ok: true });
      await db.order.create({ data: { id: `order-${g.id}`, gameId: g.id, userId: "parent", paymentStatus: "PAID", amountAgorot: 1, provider: "mock", packageTier: "ONE_WORLD" } });
    }
    const family = await familyOverview(db, "parent");
    expect(family.find(c => c.id === a.id)!.games.map(g => g.id).sort()).toEqual(games.slice(0, 2).map(g => g.id).sort());
    expect(family.find(c => c.id === b.id)!.games.map(g => g.id)).toEqual([games[2]!.id]);
    const profiles = await db.game.findMany({ where: { id: { in: games.map(g => g.id) } }, select: { childProfileId: true } });
    expect(new Set(profiles.map(g => g.childProfileId)).size).toBe(3);
  });
});
