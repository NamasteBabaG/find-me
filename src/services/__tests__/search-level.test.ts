import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { DbStorage } from "@/infra/storage/db";
import { MockPaymentProvider } from "@/infra/payment/mock";
import { LEGAL_VERSION } from "@/domain/legal";
import type { DetectiveRelease } from "@/domain/search-level";
import type { Container } from "../container";
import { attachPhoto, createDraft, detectiveSelectionEligible, searchLevelChoice, searchLevelTerms, selectPackage, selectWorlds, worldsForDraft } from "../create-flow.service";
import { chooseDraftChild } from "../family.service";
import { closeDraftCheckout } from "../checkout-close.service";
import { startCheckout } from "../order.service";
import { beginWorldPurchase } from "../world-purchase.service";
import { boardsOfWorlds } from "../world-catalog.service";

// Synthetic flags and synthetic Detectives releases. They point journey (and, where a test says
// so, kingdom) at the existing v12 boards ONLY to exercise the plumbing; no real Detectives content is implied.
const f = vi.hoisted(() => ({ env: { APP_ENV: "qa", SEARCH_LEVEL_CHOICE: "off" } as Record<string, string>, releases: [] as DetectiveRelease[] }));
vi.mock("@/lib/env", () => ({ env: () => f.env, spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }) }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
vi.mock("../../../content/worlds/detective-releases", () => ({ get DETECTIVE_RELEASES() { return f.releases; } }));

const STYLE = "local-patch-world-v1";
const JOURNEY_AT_12: DetectiveRelease = { worldSlug: "journey", styleVersion: STYLE, sceneVersion: 12 };
const KINGDOM_AT_12: DetectiveRelease = { ...JOURNEY_AT_12, worldSlug: "kingdom" };
let db: PrismaClient, scratch: string, photo: Buffer, c: Container, sequence = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-search-level-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#71869a" } }).png().toBuffer();
  c = { db, storage: new DbStorage(db), payment: new MockPaymentProvider("https://levels.invalid", "synthetic-level-secret"), appUrl: "https://levels.invalid",
    analytics: { track: vi.fn() }, generation: { createAvatar: vi.fn(() => { throw Error("No generation authorized"); }) } } as unknown as Container;
});
afterAll(async () => {
  await db?.$disconnect();
  const absolute = path.resolve(scratch);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-search-level-")) rmSync(absolute, { recursive: true, force: true });
});
beforeEach(() => { f.env = { APP_ENV: "qa", SEARCH_LEVEL_CHOICE: "on" }; f.releases = [JOURNEY_AT_12]; });
// A failed assertion must not leave a provider or transaction spy counting into the next test.
afterEach(() => { vi.restoreAllMocks(); });

/** A draft made the way the name step makes one: pinned exactly when its cards are shown. */
async function named(input: { ageYears: number; searchLevel?: "explorers" | "detectives" }) {
  const draft = await createDraft(c, null, "he", { askSearchLevel: (await searchLevelTerms(c, null)).asked });
  expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ...input })).toEqual({ ok: true });
  return draft;
}
const game = (id: string) => db.game.findUniqueOrThrow({ where: { id }, include: { scenes: { orderBy: { orderIndex: "asc" } }, childProfile: true } });
async function photographed(input: Parameters<typeof named>[0]) {
  const draft = await named(input);
  expect(await attachPhoto(c, draft.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
  return draft;
}
const checkout = (draft: { gameId: string; draftToken: string }) => ({ gameId: draft.gameId, email: `level-${++sequence}@example.invalid`, currency: "ILS" as const,
  access: { draftToken: draft.draftToken, userId: null }, legalVersion: LEGAL_VERSION });
const orders = (gameId: string) => db.order.findMany({ where: { gameId } });
/** A signed-in parent with one saved child, as the family area starts a world purchase. */
async function family() {
  const id = `level-family-${++sequence}`, ownerId = `${id}-owner`, childId = `${id}-child`;
  await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
  await db.familyChild.create({ data: { id: childId, ownerId, displayName: "Synthetic child" } });
  return { ownerId, familyChildId: childId, ageYears: 5, locale: "he" as const, returnGameId: null };
}
/** Another tab acting in the gap right after this request's next transaction commits. */
function afterNextTransaction(between: () => Promise<void>) {
  const run = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
  return vi.spyOn(db, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
    const result = await run(...args);
    await between();
    return result;
  }) as unknown as typeof db.$transaction);
}

describe("whether the parent is asked", () => {
  it("asks only while Detectives can be sold; development shows the cards for review", async () => {
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await searchLevelChoice(c, STYLE)).toEqual({ shown: false, detectives: false });
    f.env.SEARCH_LEVEL_CHOICE = "on"; f.releases = [];
    expect(await searchLevelChoice(c, STYLE)).toEqual({ shown: false, detectives: false });
    f.releases = [JOURNEY_AT_12];
    expect(await searchLevelChoice(c, STYLE)).toEqual({ shown: true, detectives: true });
    expect(await searchLevelChoice(c, STYLE, "journey")).toEqual({ shown: true, detectives: true });
    expect(await searchLevelChoice(c, STYLE, "kingdom")).toEqual({ shown: false, detectives: false });
    f.env.APP_ENV = "development"; f.releases = [];
    expect(await searchLevelChoice(c, STYLE)).toEqual({ shown: true, detectives: false });
  });

  it("pins the question to the draft it was asked on: a later switch neither adds nor removes it", async () => {
    f.env.SEARCH_LEVEL_CHOICE = "off";
    const legacy = await named({ ageYears: 6 });
    f.env.SEARCH_LEVEL_CHOICE = "on";
    expect(await searchLevelTerms(c, await game(legacy.gameId))).toMatchObject({ asked: false, required: false });
    const asked = await named({ ageYears: 6 });
    expect(await searchLevelTerms(c, await game(asked.gameId))).toMatchObject({ asked: true, required: true });
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await searchLevelTerms(c, await game(asked.gameId))).toMatchObject({ asked: true, required: true });
  });

  it("asks again when a draft's level can no longer be sold, instead of looping or switching in silence", async () => {
    const detectives = await named({ ageYears: 7, searchLevel: "detectives" });
    const explorers = await named({ ageYears: 7, searchLevel: "explorers" });
    f.releases = []; f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await searchLevelTerms(c, await game(detectives.gameId))).toMatchObject({ asked: true, stale: true, detectives: false });
    expect(await searchLevelTerms(c, await game(explorers.gameId))).toMatchObject({ asked: false, stale: false, required: true });
    expect(await searchLevelTerms(c, null)).toMatchObject({ asked: false, required: false });
  });

  it("sells a Detectives world only with its own release and while the choice is on", async () => {
    expect((await worldsForDraft(c, STYLE, "detectives")).map(w => w.slug)).toEqual(["journey"]);
    expect((await worldsForDraft(c, STYLE, "explorers")).map(w => w.slug)).toEqual(["journey", "kingdom"]);
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await worldsForDraft(c, STYLE, "detectives")).toEqual([]);
    f.env.SEARCH_LEVEL_CHOICE = "on"; f.releases = [];
    expect(await worldsForDraft(c, STYLE, "detectives")).toEqual([]);
  });

  it("asks the same question before a draft exists as after, on the schema's default engine", async () => {
    f.releases = [{ worldSlug: "journey", styleVersion: "collage-v1", sceneVersion: 12 }];
    expect((await worldsForDraft(c, "", "detectives")).map(w => w.slug)).toEqual(["journey"]);
    expect(await searchLevelChoice(c, "")).toEqual(await searchLevelChoice(c, "collage-v1"));
  });
});

describe("the level on the draft", () => {
  it("is saved apart from the exact age: 8 on Explorers stays 8, 5 on Detectives stays 5", async () => {
    const eight = await named({ ageYears: 8, searchLevel: "explorers" });
    const five = await named({ ageYears: 5, searchLevel: "detectives" });
    expect(await game(eight.gameId)).toMatchObject({ searchLevel: "explorers", childProfile: { ageYears: 8 } });
    expect(await game(five.gameId)).toMatchObject({ searchLevel: "detectives", childProfile: { ageYears: 5 } });
  });

  it("is left untouched when no answer is given", async () => {
    const draft = await named({ ageYears: 6, searchLevel: "detectives" });
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 7 })).toEqual({ ok: true });
    expect(await game(draft.gameId)).toMatchObject({ searchLevel: "detectives", childProfile: { ageYears: 7 } });
  });

  it("drops boards pinned for the other level, and keeps them when the level stays", async () => {
    const draft = await photographed({ ageYears: 8, searchLevel: "explorers" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    expect((await game(draft.gameId)).scenes).toHaveLength(9);
    const again = { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 8 };
    expect(await chooseDraftChild(db, { ...again, searchLevel: "explorers" })).toEqual({ ok: true });
    expect((await game(draft.gameId)).scenes).toHaveLength(9);
    expect(await chooseDraftChild(db, { ...again, searchLevel: "detectives" })).toEqual({ ok: true });
    expect(await game(draft.gameId)).toMatchObject({ searchLevel: "detectives", sceneCount: 0, scenes: [] });
  });

  it("a draft from before the cards keeps its boards when the parent then chooses Explorers", async () => {
    f.env.SEARCH_LEVEL_CHOICE = "off";
    const draft = await photographed({ ageYears: 4 });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    expect((await game(draft.gameId)).searchLevel).toBeNull();
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 4, searchLevel: "explorers" })).toEqual({ ok: true });
    expect(await game(draft.gameId)).toMatchObject({ searchLevel: "explorers", sceneCount: 9 });
    expect((await game(draft.gameId)).scenes).toHaveLength(9);
  });
});

describe("boards and checkout follow the level", () => {
  it("pins only the Detectives release's boards and never offers Kingdom at that level", async () => {
    const draft = await photographed({ ageYears: 7, searchLevel: "detectives" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const pinned = await game(draft.gameId);
    expect(pinned.scenes.map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["journey"]));
    expect(new Set(pinned.scenes.map(s => s.sceneVersion))).toEqual(new Set([12]));
    expect(await selectWorlds(c, draft.gameId, ["kingdom"])).toMatchObject({ ok: false, code: "SCENE_UNAVAILABLE" });
  });

  it("refuses Detectives without a release, or with the choice off, instead of taking other boards", async () => {
    const draft = await photographed({ ageYears: 9, searchLevel: "detectives" });
    f.releases = [];
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    f.releases = [JOURNEY_AT_12]; f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect((await game(draft.gameId)).scenes).toEqual([]);
  });

  it("takes no payment for an asked draft left unanswered, or for Detectives that can no longer be sold", async () => {
    const unanswered = await photographed({ ageYears: 6 });
    expect(await selectPackage(c, unanswered.gameId, "ONE_WORLD")).toEqual({ ok: true });
    expect(await startCheckout(c, checkout(unanswered))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
    const detectives = await photographed({ ageYears: 6, searchLevel: "detectives" });
    expect(await selectPackage(c, detectives.gameId, "ONE_WORLD")).toEqual({ ok: true });
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await startCheckout(c, checkout(detectives))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    f.env.SEARCH_LEVEL_CHOICE = "on"; f.releases = [];
    expect(await startCheckout(c, checkout(detectives))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect([...await orders(unanswered.gameId), ...await orders(detectives.gameId)]).toEqual([]);
  });

  it("freezes the level once a payment is open", async () => {
    const draft = await photographed({ ageYears: 8, searchLevel: "detectives" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    expect(await startCheckout(c, checkout(draft))).toMatchObject({ ok: true });
    const owner = (await game(draft.gameId)).ownerId;
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: owner, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 8, searchLevel: "explorers" }))
      .toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await game(draft.gameId)).toMatchObject({ searchLevel: "detectives", sceneCount: 9 });
  });

  it("keeps a legacy open checkout resumable when the choice becomes available, with no second order or session", async () => {
    f.env.SEARCH_LEVEL_CHOICE = "off";
    const draft = await photographed({ ageYears: 8 });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const input = checkout(draft);
    const first = await startCheckout(c, input);
    if (!first.ok) throw Error(first.code);
    f.env.SEARCH_LEVEL_CHOICE = "on";
    expect(await searchLevelTerms(c, await game(draft.gameId))).toMatchObject({ asked: false, required: false, openPayment: true });
    expect(await startCheckout(c, input)).toEqual(first);
    const owner = (await game(draft.gameId)).ownerId;
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: owner, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 8, searchLevel: "explorers" }))
      .toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await orders(draft.gameId)).toHaveLength(1);
    expect((await game(draft.gameId)).searchLevel).toBeNull();
  });

  it("refuses a new checkout for a withdrawn Detectives world even while another world keeps that version", async () => {
    f.releases = [JOURNEY_AT_12, KINGDOM_AT_12];
    const draft = await photographed({ ageYears: 8, searchLevel: "detectives" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    expect(await selectWorlds(c, draft.gameId, ["kingdom"])).toEqual({ ok: true });
    f.releases = [JOURNEY_AT_12];
    expect((await worldsForDraft(c, STYLE, "detectives")).map(w => w.slug)).toEqual(["journey"]);
    expect(await startCheckout(c, checkout(draft))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect(await orders(draft.gameId)).toEqual([]);
  });

  it("sells only the release's exact boards: a stray board or another version is refused", async () => {
    const draft = await photographed({ ageYears: 8, searchLevel: "detectives" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const pinned = await game(draft.gameId);
    expect(await detectiveSelectionEligible(c, pinned)).toBe(true);
    const stray = pinned.scenes[0]!, kingdomBoard = boardsOfWorlds(["kingdom"])[0]!;
    await db.gameScene.update({ where: { id: stray.id }, data: { sceneSlug: kingdomBoard } });
    expect(await detectiveSelectionEligible(c, await game(draft.gameId))).toBe(false);
    expect(await startCheckout(c, checkout(draft))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    await db.gameScene.update({ where: { id: stray.id }, data: { sceneSlug: stray.sceneSlug, sceneVersion: 11 } });
    expect(await detectiveSelectionEligible(c, await game(draft.gameId))).toBe(false);
    await db.gameScene.update({ where: { id: stray.id }, data: { sceneVersion: 12 } });
    expect(await startCheckout(c, checkout(draft))).toMatchObject({ ok: true });
    expect(await orders(draft.gameId)).toHaveLength(1);
  });
});

// Terms already offered stand only as that exact open order: a request let through to resume
// it holds no permission of its own, so the payment claim re-checks the order and sells nothing
// new once it has closed. Both purchase paths share the claim, so both are exercised.
describe.each(["ordinary", "family"] as const)("a Detectives payment opened before its world was withdrawn (%s checkout)", flow => {
  /** One open Detectives payment: from the wizard, or from the family area's world purchase. */
  async function opened() {
    let input: Parameters<typeof startCheckout>[1];
    if (flow === "ordinary") {
      const draft = await photographed({ ageYears: 8, searchLevel: "detectives" });
      expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
      input = checkout(draft);
    } else {
      const parent = await family();
      const started = await beginWorldPurchase(c, { ...parent, ageYears: 8, worldSlug: "journey", searchLevel: "detectives" });
      if (!started.ok) throw Error(started.code);
      expect(await attachPhoto(c, started.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
      const { email } = await db.user.findUniqueOrThrow({ where: { id: parent.ownerId } });
      input = { gameId: started.gameId, email, currency: "ILS", access: { draftToken: started.draftToken, userId: parent.ownerId }, legalVersion: LEGAL_VERSION };
    }
    const first = await startCheckout(c, input);
    if (!first.ok) throw Error(first.code);
    const [order] = await orders(input.gameId);
    return { input, first, order: order! };
  }

  it("honours an open Detectives payment after its world is withdrawn: the same session, no new order", async () => {
    const { input, first, order } = await opened();
    f.releases = [];
    const provider = vi.spyOn(c.payment, "createCheckout");
    expect(await startCheckout(c, input)).toEqual(first);
    expect((await orders(input.gameId)).map(o => [o.id, o.paymentStatus])).toEqual([[order.id, "PENDING"]]);
    expect(provider).not.toHaveBeenCalled();
  });

  it("refuses once that payment closes between the check and the claim: no new order, no provider call", async () => {
    const { input, first, order } = await opened();
    f.releases = [];
    const provider = vi.spyOn(c.payment, "createCheckout");
    // The parent closes the payment in another tab after this request's ownership
    // transaction, before its payment claim: the gap the resume check used to leave open.
    const gap = afterNextTransaction(async () => {
      expect(await closeDraftCheckout(c, { ownerId: first.userId, gameId: input.gameId, orderId: order.id })).toEqual({ ok: true });
    });
    try {
      expect(await startCheckout(c, input)).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    } finally { gap.mockRestore(); }
    expect((await orders(input.gameId)).map(o => [o.id, o.paymentStatus])).toEqual([[order.id, "CANCELLED"]]);
    expect(provider).not.toHaveBeenCalled();
    expect((await game(input.gameId)).status).toBe("PACKAGE_SELECTED");
    // Nothing reopens it later either.
    expect(await startCheckout(c, input)).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect(await orders(input.gameId)).toHaveLength(1);
  });

  it("still sells a new attempt while the product stays eligible", async () => {
    const { input, first, order } = await opened();
    expect(await closeDraftCheckout(c, { ownerId: first.userId, gameId: input.gameId, orderId: order.id })).toEqual({ ok: true });
    const provider = vi.spyOn(c.payment, "createCheckout");
    const next = await startCheckout(c, input);
    if (!next.ok) throw Error(next.code);
    expect(next.checkoutUrl).not.toBe(first.checkoutUrl);
    expect((await orders(input.gameId)).map(o => o.paymentStatus).sort()).toEqual(["CANCELLED", "PENDING"]);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});

describe("adding a world from the family area", () => {
  const games = (familyChildId: string) => db.game.count({ where: { familyChildId } });

  it("fixes the chosen level with the draft, like the age", async () => {
    const input = await family();
    const started = await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" });
    if (!started.ok) throw Error(started.code);
    const draft = await game(started.gameId);
    expect(draft).toMatchObject({ searchLevel: "detectives", childProfile: { ageYears: 5 } });
    expect(draft.scenes.map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["journey"]));
    expect(await searchLevelTerms(c, draft)).toMatchObject({ required: true });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "explorers" })).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" })).toMatchObject({ ok: true, gameId: started.gameId, reused: true });
  });

  it("requires an answer where asked, refuses Detectives it cannot sell, and keeps a legacy form's meaning", async () => {
    const input = await family();
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey" })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "kingdom", searchLevel: "detectives" })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "kingdom", searchLevel: "hard" })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
    expect(await games(input.familyChildId)).toBe(0);
    const legacy = await beginWorldPurchase(c, { ...input, worldSlug: "kingdom" });
    if (!legacy.ok) throw Error(legacy.code);
    expect((await game(legacy.gameId)).searchLevel).toBeNull();
  });

  it("refuses a sent Detectives answer when the choice is switched off before saving", async () => {
    const input = await family();
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", ageYears: 8, searchLevel: "detectives" })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect(await games(input.familyChildId)).toBe(0);
    const explorers = await beginWorldPurchase(c, { ...input, worldSlug: "journey", ageYears: 8, searchLevel: "explorers" });
    if (!explorers.ok) throw Error(explorers.code);
    expect((await game(explorers.gameId)).searchLevel).toBe("explorers");
  });

  it("keeps an existing draft reachable at its own level after Detectives stops selling", async () => {
    const input = await family();
    const started = await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" });
    if (!started.ok) throw Error(started.code);
    f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" })).toMatchObject({ ok: true, gameId: started.gameId, reused: true });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "explorers" })).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await games(input.familyChildId)).toBe(1);
  });
});
