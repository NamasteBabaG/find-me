import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { DbStorage } from "@/infra/storage/db";
import { MockPaymentProvider } from "@/infra/payment/mock";
import { LEGAL_VERSION } from "@/domain/legal";
import type { DetectiveRelease } from "@/domain/search-level";
import type { Container } from "../container";
import { attachPhoto, createDraft, searchLevelChoice, searchLevelQuestion, selectPackage, selectWorlds, worldsForDraft } from "../create-flow.service";
import { chooseDraftChild } from "../family.service";
import { startCheckout } from "../order.service";
import { beginWorldPurchase } from "../world-purchase.service";
import { boardsOfWorlds } from "../world-catalog.service";

// Synthetic flags and a synthetic Detectives release. The release points journey at the
// existing v12 boards ONLY to exercise the plumbing; no real Detectives content is implied.
const f = vi.hoisted(() => ({ env: { APP_ENV: "qa", SEARCH_LEVEL_CHOICE: "off" } as Record<string, string>, releases: [] as DetectiveRelease[] }));
vi.mock("@/lib/env", () => ({ env: () => f.env, spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }) }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
vi.mock("../../../content/worlds/detective-releases", () => ({ get DETECTIVE_RELEASES() { return f.releases; } }));

const STYLE = "local-patch-world-v1";
const JOURNEY_AT_12: DetectiveRelease = { worldSlug: "journey", styleVersion: STYLE, sceneVersion: 12 };
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

async function named(input: { ageYears: number; searchLevel?: "explorers" | "detectives" }) {
  const draft = await createDraft(c, null, "he");
  expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ...input })).toEqual({ ok: true });
  return draft;
}
const game = (id: string) => db.game.findUniqueOrThrow({ where: { id }, include: { scenes: { orderBy: { orderIndex: "asc" } }, childProfile: true } });
async function photographed(input: Parameters<typeof named>[0]) {
  const draft = await named(input);
  expect(await attachPhoto(c, draft.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
  return draft;
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

  it("asks again when a draft holds a level that can no longer be served, instead of looping or switching in silence", async () => {
    const draft = await named({ ageYears: 7, searchLevel: "detectives" });
    f.releases = []; f.env.SEARCH_LEVEL_CHOICE = "off";
    expect(await searchLevelQuestion(c, await game(draft.gameId))).toEqual({ shown: true, detectives: false });
    const explorers = await named({ ageYears: 7, searchLevel: "explorers" });
    expect(await searchLevelQuestion(c, await game(explorers.gameId))).toEqual({ shown: false, detectives: false });
    expect(await searchLevelQuestion(c, null)).toEqual({ shown: false, detectives: false });
  });

  it("offers a Detectives world only with its own release, never by falling back to Explorers", async () => {
    expect((await worldsForDraft(c, STYLE, "detectives")).map(w => w.slug)).toEqual(["journey"]);
    expect((await worldsForDraft(c, STYLE, "explorers")).map(w => w.slug)).toEqual(["journey", "kingdom"]);
    f.releases = [];
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

  it("is left untouched when the cards were not asked", async () => {
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

  it("refuses Detectives without a release instead of taking other boards", async () => {
    const draft = await photographed({ ageYears: 9, searchLevel: "detectives" });
    f.releases = [];
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect((await game(draft.gameId)).scenes).toEqual([]);
  });

  it("does not take payment for an unanswered choice or for Detectives whose release was withdrawn", async () => {
    const unanswered = await photographed({ ageYears: 6 });
    expect(await selectPackage(c, unanswered.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const access = (draft: { draftToken: string }) => ({ email: `level-${++sequence}@example.invalid`, currency: "ILS" as const, access: { draftToken: draft.draftToken, userId: null }, legalVersion: LEGAL_VERSION });
    expect(await startCheckout(c, { gameId: unanswered.gameId, ...access(unanswered) })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });

    const detectives = await photographed({ ageYears: 6, searchLevel: "detectives" });
    expect(await selectPackage(c, detectives.gameId, "ONE_WORLD")).toEqual({ ok: true });
    f.releases = [];
    expect(await startCheckout(c, { gameId: detectives.gameId, ...access(detectives) })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
    expect(await db.order.count({ where: { gameId: { in: [unanswered.gameId, detectives.gameId] } } })).toBe(0);
  });

  it("freezes the level once a payment is open", async () => {
    const draft = await photographed({ ageYears: 8, searchLevel: "detectives" });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const started = await startCheckout(c, { gameId: draft.gameId, email: `level-${++sequence}@example.invalid`, currency: "ILS", access: { draftToken: draft.draftToken, userId: null }, legalVersion: LEGAL_VERSION });
    expect(started).toMatchObject({ ok: true });
    const owner = (await game(draft.gameId)).ownerId;
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: owner, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic", ageYears: 8, searchLevel: "explorers" }))
      .toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await game(draft.gameId)).toMatchObject({ searchLevel: "detectives", sceneCount: 9 });
  });
});

describe("adding a world from the family area", () => {
  async function family() {
    const id = `level-family-${++sequence}`, ownerId = `${id}-owner`, childId = `${id}-child`;
    await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
    await db.familyChild.create({ data: { id: childId, ownerId, displayName: "Synthetic child" } });
    return { ownerId, familyChildId: childId, ageYears: 5, locale: "he" as const, returnGameId: null };
  }

  it("fixes the chosen level with the draft, like the age", async () => {
    const input = await family();
    const started = await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" });
    if (!started.ok) throw Error(started.code);
    const draft = await game(started.gameId);
    expect(draft).toMatchObject({ searchLevel: "detectives", childProfile: { ageYears: 5 } });
    expect(draft.scenes.map(s => s.sceneSlug)).toEqual(boardsOfWorlds(["journey"]));
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "explorers" })).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey", searchLevel: "detectives" })).toMatchObject({ ok: true, gameId: started.gameId, reused: true });
  });

  it("requires an answer where the cards are asked, and asks none for a world without Detectives", async () => {
    const input = await family();
    expect(await beginWorldPurchase(c, { ...input, worldSlug: "journey" })).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
    const kingdom = await beginWorldPurchase(c, { ...input, worldSlug: "kingdom", searchLevel: "detectives" });
    if (!kingdom.ok) throw Error(kingdom.code);
    expect((await game(kingdom.gameId)).searchLevel).toBeNull();
  });
});
