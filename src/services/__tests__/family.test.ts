import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { bindCheckoutFamilyChild, chooseDraftChild, familyOverview, listFamilyChildren, familyDrafts, familyDraftToResume } from "../family.service";

let scratch: string, db: PrismaClient, sequence = 0;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-family-test-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: "parent", email: "parent@example.invalid" }, { id: "other", email: "other@example.invalid" }] });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-family-test-")) await rm(scratch, { recursive: true, force: true });
});
async function draft(ownerId: string | null = "parent") {
  const id = `family-game-${++sequence}`;
  return db.game.create({ data: { id, ownerId, draftToken: `cookie-${id}` } });
}
async function child(ownerId = "parent", displayName = "Same name") {
  return db.familyChild.create({ data: { id: `family-child-${++sequence}`, ownerId, displayName } });
}
const select = (game: { id: string; draftToken: string | null }, familyChildId: string | null, actorId: string | null = "parent") => chooseDraftChild(db, { gameId: game.id, draftToken: game.draftToken, actorId, familyChildId, name: "New child", ageYears: 5 });
describe("family identity is separate from rendering identity", () => {
  it("resumes only live, unpaid drafts belonging to this parent", async () => {
    const own = await draft(), foreign = await draft("other"), removed = await draft(), paid = await draft();
    await db.game.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await db.order.create({ data: { id: `order-${paid.id}`, gameId: paid.id, userId: "parent", paymentStatus: "PAID", amountAgorot: 1, provider: "mock", packageTier: "ONE_WORLD" } });
    const ids = (await familyDrafts(db, "parent")).map(g => g.id);
    expect(ids).toContain(own.id); expect(ids).not.toContain(foreign.id); expect(ids).not.toContain(removed.id); expect(ids).not.toContain(paid.id);
    expect(await familyDraftToResume(db, "parent", own.id)).toEqual({ draftToken: own.draftToken });
    for (const id of [foreign.id, removed.id, paid.id]) expect(await familyDraftToResume(db, "parent", id)).toBeNull();
    expect(await familyDraftToResume(db, "", own.id)).toBeNull();
  });
  it("keeps same-name siblings distinct and lists only the owner's children", async () => {
    const first = await child(), second = await child(), foreign = await child("other");
    const ids = (await listFamilyChildren(db, "parent")).map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(ids).not.toContain(foreign.id);
    expect(await listFamilyChildren(db, "")).toEqual([]);
  });
  it("two adventures for one child get distinct photo/rendering profiles", async () => {
    const saved = await child(), a = await draft(), b = await draft();
    expect(await select(a, saved.id)).toEqual({ ok: true });
    const first = await db.game.findUniqueOrThrow({ where: { id: a.id } });
    await db.childProfile.update({ where: { id: first.childProfileId! }, data: { originalPhotoAssetId: "original-kept", avatarAssetId: "avatar-kept", identityAssetId: "sheet-kept" } });
    expect(await select(b, saved.id)).toEqual({ ok: true });
    const second = await db.game.findUniqueOrThrow({ where: { id: b.id } });
    expect(first.familyChildId).toBe(second.familyChildId);
    expect(first.childProfileId).not.toBe(second.childProfileId);
    expect(await db.childProfile.findUnique({ where: { id: first.childProfileId! } })).toMatchObject({ originalPhotoAssetId: "original-kept", avatarAssetId: "avatar-kept", identityAssetId: "sheet-kept" });
  });
  it("a draft cookie cannot attach another parent's child or replace session proof", async () => {
    const foreign = await child("other"), own = await child(), game = await draft();
    expect(await select(game, foreign.id)).toMatchObject({ ok: false });
    expect(await select(game, own.id, null)).toMatchObject({ ok: false });
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).childProfileId).toBeNull();
  });
  it("does not relabel another child's existing photo when switching siblings", async () => {
    const a = await child(), b = await child(), game = await draft();
    await select(game, a.id);
    expect(await select(game, b.id)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).familyChildId).toBe(a.id);
  });
  it("anonymous drafts remain possible without creating empty family cards", async () => {
    const game = await draft(null), before = await db.familyChild.count();
    expect(await select(game, null, null)).toEqual({ ok: true });
    expect(await db.familyChild.count()).toBe(before);
  });
  it("binding happens atomically and never transfers a child to another email", async () => {
    const saved = await child(), game = await draft();
    expect(await db.$transaction(tx => bindCheckoutFamilyChild(tx, { gameId: game.id, familyChildId: saved.id, ownerId: "other", displayName: "Ignored" }))).toBe(false);
    await db.$transaction(tx => bindCheckoutFamilyChild(tx, { gameId: game.id, familyChildId: null, ownerId: "parent", displayName: "New child" }));
    const bound = await db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(bound.familyChildId).toBeTruthy();
    expect(bound.familyChildId).not.toBe(saved.id);
  });
  it("overview excludes other siblings, unpaid, refunded and deleted adventures", async () => {
    const a = await child(), b = await child(), games = await Promise.all([draft(), draft(), draft(), draft(), draft()]);
    for (const [index, game] of games.entries()) {
      await db.game.update({ where: { id: game.id }, data: { familyChildId: index === 4 ? b.id : a.id, status: index === 2 ? "REFUNDED" : "READY", deletedAt: index === 3 ? new Date() : null } });
      if (index !== 1) await db.order.create({ data: { id: `order-${game.id}`, gameId: game.id, userId: "parent", amountAgorot: 1, packageTier: "ONE_WORLD", provider: "mock", paymentStatus: index === 2 ? "REFUNDED" : "PAID" } });
    }
    expect((await familyOverview(db, "parent", a.id))[0]!.games.map(g => g.id)).toEqual([games[0]!.id]);
    expect(await familyOverview(db, "other", a.id)).toEqual([]);
  });
});
