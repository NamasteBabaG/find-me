import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { publicBeachDemo } from "../../../content/demo/beach-v1";
import { findWorld } from "../../../content/worlds";
import { composeWorld } from "@/domain/game/compose";
import { GameConfigSchema, type GameConfig } from "@/domain/game/config";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureProgress } from "@/domain/adventure/progress";
import { summarizeWorlds } from "@/domain/adventure/summary";
import { familyAdventures } from "../family-adventures.service";

/** The reviewed demo board standing in for every place of the real "Around the World" map. Fictional art only. */
function journeyGame(gameId: string): GameConfig {
  const config = publicBeachDemo("en"); config.gameId = gameId;
  const book = config.adventure!, board = book.boards[0]!, scene = config.scenes[0]!;
  const world = composeWorld(findWorld("journey")!, config.child, "en");
  config.scenes = world.nodes.map(node => ({ ...structuredClone(scene), slug: node.boardSlug, name: `Place ${node.routeIndex}`, worldSlug: world.slug }));
  book.boards = config.scenes.map(s => ({ ...structuredClone(board), boardSlug: s.slug, worldSlug: world.slug }));
  config.worlds = [world]; config.world = world;
  return GameConfigSchema.parse(config);
}

/** Every hiding spot on the first `done` places, and `partial` more on the next one. */
function played(config: GameConfig, done: number, partial = 0): AdventureProgress {
  const book = config.adventure!;
  let progress = emptyAdventureProgress(config.gameId, book);
  for (const [i, board] of book.boards.entries()) {
    const finds = i < done ? board.targetIds.length : i === done ? partial : 0;
    for (const targetId of board.targetIds.slice(0, finds)) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
  }
  return progress;
}

describe("a world as the family area shows it", () => {
  const config = journeyGame("family-summary");
  const route = config.worlds![0]!.nodes.slice().sort((a, b) => a.routeIndex - b.routeIndex);

  it("counts stamped places and gold stars the way the map does, and stands the child at the next place", () => {
    const [world] = summarizeWorlds(config, played(config, 3, 2));
    expect(world).toMatchObject({ slug: "journey", places: 9, stamped: 3, stars: 11, starsTotal: 27 });
    expect(world!.here).toEqual({ boardSlug: route[3]!.boardSlug, name: "Place 4", x: route[3]!.x, y: route[3]!.y });
    expect(world!.route).toEqual(["stamped", "stamped", "stamped", "here", "ahead", "ahead", "ahead", "ahead", "ahead"]);
    expect(world!.map.art).toBe(config.worlds![0]!.map.artPortrait ?? config.worlds![0]!.map.art);
  });

  it("starts at the first place, and stays on the last once every place is stamped", () => {
    expect(summarizeWorlds(config, played(config, 0))[0]!.here.boardSlug).toBe(route[0]!.boardSlug);
    const done = summarizeWorlds(config, played(config, 9))[0]!;
    expect(done).toMatchObject({ stamped: 9, stars: 27 });
    expect(done.here.boardSlug).toBe(route[8]!.boardSlug);
    expect(done.route.every(state => state === "stamped")).toBe(true);
  });

  it("shows the map without counts it doesn't have", () => {
    const [world] = summarizeWorlds(config, null);
    expect(world).toMatchObject({ places: 9, stamped: 0, stars: 0, starsTotal: 27 });
    expect(world!.here.boardSlug).toBe(route[0]!.boardSlug);
  });

  it("never counts a find that isn't one of the board's hiding spots", () => {
    const progress = played(config, 0);
    const odd = { ...progress, finds: [...progress.finds, { boardSlug: route[0]!.boardSlug, targetId: "not-a-hide", variant: "A" as const }] };
    expect(summarizeWorlds(config, odd)[0]!.stars).toBe(0);
  });
});

let scratch: string, db: PrismaClient;
const secret = "family-adventures-test-secret-0123456789";
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-family-adventures-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: "parent", email: "parent@example.invalid" }, { id: "other", email: "other@example.invalid" }] });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-family-adventures-")) await rm(scratch, { recursive: true, force: true });
});

async function paidGame(id: string, childId: string, data: { status: string; configJson?: string | null; album?: AdventureProgress; avatarAssetId?: string }) {
  if (data.avatarAssetId) await db.childProfile.create({ data: { id: `profile-${id}`, ownerId: "parent", displayName: "Yuval", avatarAssetId: data.avatarAssetId } });
  await db.game.create({ data: {
    id, ownerId: "parent", familyChildId: childId, status: data.status, configJson: data.configJson ?? null,
    ...(data.avatarAssetId ? { childProfileId: `profile-${id}` } : {}),
    ...(data.album ? { adventureAlbum: { create: { revision: 1, snapshotJson: JSON.stringify(data.album) } } } : {}),
  } });
  await db.order.create({ data: { id: `order-${id}`, gameId: id, userId: "parent", paymentStatus: "PAID", amountAgorot: 1, provider: "mock", packageTier: "ONE_WORLD" } });
}

describe("the family area's view of a child", () => {
  it("brings each paid adventure with its map and the child's progress, and survives a game it can't read", async () => {
    await db.familyChild.create({ data: { id: "fam_yuval", ownerId: "parent", displayName: "Yuval" } });
    const config = journeyGame("game_ready");
    await paidGame("game_ready", "fam_yuval", { status: "DELIVERED", configJson: JSON.stringify(config), album: played(config, 2, 1) });
    await paidGame("game_broken", "fam_yuval", { status: "READY", configJson: "{not json" });
    await paidGame("game_drawing", "fam_yuval", { status: "TARGETS_GENERATING", avatarAssetId: "ast_drawing" });
    const [child] = await familyAdventures({ db, secret }, "parent", "fam_yuval");
    expect(child).toMatchObject({ id: "fam_yuval", name: "Yuval" });
    const byId = Object.fromEntries(child!.adventures.map(a => [a.gameId, a]));
    expect(byId.game_ready).toMatchObject({ ready: true, tracked: true });
    expect(byId.game_ready!.worlds[0]).toMatchObject({ slug: "journey", stamped: 2, stars: 7 });
    expect(byId.game_broken).toMatchObject({ ready: false, tracked: false, worlds: [], preparation: "unavailable" });
    expect(byId.game_drawing).toMatchObject({ ready: false, worlds: [] });
    // The sticker is the one the child plays as in the playable game, not the one still being drawn.
    expect(child!.avatarUrl).toBe(config.child.avatarUrl);
  });

  it("signs the sticker of a game asset so the browser may keep it", async () => {
    await db.familyChild.create({ data: { id: "fam_noa", ownerId: "parent", displayName: "Noa" } });
    await paidGame("game_noa", "fam_noa", { status: "PAID", avatarAssetId: "ast_noa" });
    const [child] = await familyAdventures({ db, secret }, "parent", "fam_noa");
    expect(child!.avatarUrl).toMatch(/^\/api\/assets\/ast_noa\?e=\d+&s=[A-Za-z0-9_-]+$/);
    expect(child!.adventures).toEqual([expect.objectContaining({ gameId: "game_noa", ready: false })]);
  });

  it("shows a game's progress as unknown, not as zero, when its album can't be read", async () => {
    await db.familyChild.create({ data: { id: "fam_tom", ownerId: "parent", displayName: "Tom" } });
    const config = journeyGame("game_tom"), other = journeyGame("game_elsewhere");
    await paidGame("game_tom", "fam_tom", { status: "READY", configJson: JSON.stringify(config), album: played(other, 4) });
    const [child] = await familyAdventures({ db, secret }, "parent", "fam_tom");
    expect(child!.adventures[0]).toMatchObject({ ready: true, tracked: false });
    expect(child!.adventures[0]!.worlds[0]).toMatchObject({ stamped: 0, stars: 0 });
  });

  it("shows nothing of one parent's children to another", async () => {
    expect(await familyAdventures({ db, secret }, "other", "fam_yuval")).toEqual([]);
    expect(await familyAdventures({ db, secret }, "", "fam_yuval")).toEqual([]);
  });

  it("distinguishes a failed game, a budget wait and a new-photo request without exposing internal errors", async () => {
    await db.familyChild.create({ data: { id: "fam_waiting", ownerId: "parent", displayName: "Example" } });
    await paidGame("game_failed", "fam_waiting", { status: "GENERATION_FAILED" });
    await paidGame("game_budget", "fam_waiting", { status: "TARGETS_GENERATING" });
    await paidGame("game_photo", "fam_waiting", { status: "NEEDS_NEW_PHOTO" });
    await db.generationJob.create({ data: { id: "job_game_budget", gameId: "game_budget", status: "QUEUED", currentStep: "local-patch:recovery-budget-wait", lastError: "sensitive-ledger-detail" } });
    const [child] = await familyAdventures({ db, secret }, "parent", "fam_waiting");
    expect(child!.adventures.map(a => [a.gameId, a.preparation])).toEqual([["game_failed", "attention"], ["game_budget", "delayed"], ["game_photo", "needsPhoto"]]);
    expect(JSON.stringify(child)).not.toContain("sensitive-ledger-detail");
    expect(child!.adventures.every(a => !a.ready)).toBe(true);
  });
});
