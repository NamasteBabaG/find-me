import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { publicBeachDemo } from "../../../content/demo/beach-v1";
import { findWorld } from "../../../content/worlds";
import { composeWorld } from "@/domain/game/compose";
import { GameConfigSchema, type GameConfig } from "@/domain/game/config";
import { emptyAdventureProgress, recordAdventureEvent } from "@/domain/adventure/progress";
import type { Container } from "../container";
import { ownerFamilyWorlds, FamilyWorldAccessError } from "../family-worlds.service";

const rig = vi.hoisted(() => ({ c: null as unknown as Container, user: null as { id: string } | null }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "qa" }) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => rig.user }));
vi.mock("@/services/container", () => ({ getContainer: () => rig.c }));
import { GET } from "../../app/api/family/worlds/route";

let scratch: string, db: PrismaClient, serial = 0;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-worlds-selector-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: "parent", email: "worlds@example.invalid" }, { id: "stranger", email: "stranger@example.invalid" }] });
  rig.c = { db, secret: "worlds-selector-test-secret-0123456789" } as Container;
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-worlds-selector-")) await rm(scratch, { recursive: true, force: true });
});

function configFor(gameId: string, slugs: string[] = ["journey"]): GameConfig {
  const config = publicBeachDemo("en"); config.gameId = gameId;
  const board = config.adventure!.boards[0]!, scene = config.scenes[0]!;
  const worlds = slugs.map(slug => composeWorld(findWorld(slug)!, config.child, "en"));
  config.scenes = worlds.flatMap(world => world.nodes.map(node => ({ ...structuredClone(scene), slug: node.boardSlug, name: `Place ${node.routeIndex}`, worldSlug: world.slug })));
  config.adventure!.boards = config.scenes.map(row => ({ ...structuredClone(board), boardSlug: row.slug, worldSlug: row.worldSlug! }));
  config.worlds = worlds; config.world = worlds[0];
  return GameConfigSchema.parse(config);
}
async function child(ownerId = "parent") {
  return db.familyChild.create({ data: { id: `fam_selector_${++serial}`, ownerId, displayName: "Example" } });
}
async function game(childId: string, options: { world?: string; worlds?: string[]; ownerId?: string; status?: string; payment?: string; corrupt?: boolean; noConfig?: boolean } = {}) {
  const id = `game_selector_${++serial}`, slugs = options.worlds ?? [options.world ?? "journey"], ownerId = options.ownerId ?? "parent";
  const config = configFor(id, slugs);
  await db.game.create({ data: { id, ownerId, familyChildId: childId, status: options.status ?? "DELIVERED", styleVersion: "local-patch-world-v1", locale: "en",
    configJson: options.noConfig ? null : options.corrupt ? "{bad-config" : JSON.stringify(config),
    scenes: { create: config.scenes.map((scene, orderIndex) => ({ id: `${id}_${orderIndex}`, sceneSlug: scene.slug, sceneVersion: 12, orderIndex })) },
    orders: { create: { id: `order_${id}`, userId: ownerId, paymentStatus: options.payment ?? "PAID", amountAgorot: 3900, provider: "mock", packageTier: slugs.length > 1 ? "TWO_WORLDS" : "ONE_WORLD" } } } });
  return { id, config };
}

describe("the owner's persistent worlds", () => {
  it("offers one owned world and a neutral second-world preview, without third-world or private content", async () => {
    const c = await child(), source = await game(c.id);
    let progress = emptyAdventureProgress(source.id, source.config.adventure!);
    for (const board of source.config.adventure!.boards.slice(0, 2)) for (const targetId of board.targetIds) progress = recordAdventureEvent(progress, source.id, source.config.adventure!, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
    await db.adventureAlbumProgress.create({ data: { gameId: source.id, snapshotJson: JSON.stringify(progress) } });
    const view = await ownerFamilyWorlds(rig.c, "parent", source.id);
    expect(view).toMatchObject({ childId: c.id, currentGameId: source.id });
    expect(view.worlds.map(card => card.worldSlug)).toEqual(["journey", "kingdom"]);
    expect(view.worlds[0]).toMatchObject({ gameId: source.id, current: true, status: "ready", completedPlaces: 2, foundTargets: 6, totalPlaces: 9, totalTargets: 27, icon: "🌍", purchaseHref: null });
    expect(view.worlds[0]!.playHref).toBe(`/family/${c.id}/play/${source.id}?world=journey`);
    expect(view.worlds[1]).toMatchObject({ status: "available", gameId: null, icon: "👑", completedPlaces: null });
    expect(view.worlds[1]!.purchaseHref).toBe(`/family/${c.id}/worlds/kingdom/purchase?returnGame=${source.id}`);
    const body = JSON.stringify(view);
    for (const privateField of ["avatarUrl", "snapshotJson", "configJson", "draftToken", "/api/assets/", "thumbnail", "base", "example.invalid"]) expect(body).not.toContain(privateField);
  });
  it("keeps siblings, refunded games, deleted games and strangers out", async () => {
    const a = await child(), b = await child(), source = await game(a.id);
    const sibling = await game(b.id, { world: "kingdom" });
    const refunded = await game(a.id, { world: "kingdom", status: "REFUNDED" });
    const removed = await game(a.id, { world: "kingdom" });
    await db.game.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await db.order.update({ where: { id: `order_${refunded.id}` }, data: { refundedAt: new Date() } });
    const view = await ownerFamilyWorlds(rig.c, "parent", source.id);
    expect(view.worlds.find(card => card.worldSlug === "kingdom")).toMatchObject({ status: "available", gameId: null });
    expect(JSON.stringify(view)).not.toContain(sibling.id);
    await expect(ownerFamilyWorlds(rig.c, "stranger", source.id)).rejects.toBeInstanceOf(FamilyWorldAccessError);
    await expect(ownerFamilyWorlds(rig.c, "", source.id)).rejects.toBeInstanceOf(FamilyWorldAccessError);
    await db.familyChild.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    await expect(ownerFamilyWorlds(rig.c, "parent", source.id)).rejects.toBeInstanceOf(FamilyWorldAccessError);
  });
  it.each([
    ["PAYMENT_PENDING", "PENDING", "payment_pending"],
    ["TARGETS_GENERATING", "PAID", "preparing"],
    ["NEEDS_NEW_PHOTO", "PAID", "attention"],
    ["READY", "PAID", "attention"],
  ])("represents %s truthfully without a playable route or a second buy", async (status, payment, expected) => {
    const c = await child(), source = await game(c.id);
    const waiting = await game(c.id, { world: "kingdom", status, payment, noConfig: true });
    const view = await ownerFamilyWorlds(rig.c, "parent", source.id);
    expect(view.worlds.find(card => card.worldSlug === "kingdom")).toMatchObject({ gameId: waiting.id, status: expected, playHref: null, completedPlaces: null,
      purchaseHref: `/family/${c.id}/worlds/kingdom/purchase?returnGame=${source.id}` });
  });
  it("opens the existing paid world's route and does not replace progress with a newer unfinished duplicate", async () => {
    const c = await child(), source = await game(c.id), second = await game(c.id, { world: "kingdom" });
    await game(c.id, { world: "kingdom", status: "TARGETS_GENERATING", noConfig: true });
    const before = await db.game.findUniqueOrThrow({ where: { id: source.id } });
    const view = await ownerFamilyWorlds(rig.c, "parent", source.id);
    expect(view.worlds[1]).toMatchObject({ worldSlug: "kingdom", status: "ready", gameId: second.id, current: false, purchaseHref: null });
    expect(view.worlds[1]!.playHref).toBe(`/family/${c.id}/play/${second.id}?world=kingdom`);
    expect(await db.game.findUniqueOrThrow({ where: { id: source.id } })).toEqual(before);
  });
  it("retains known ownership when sales are disabled and never labels corrupt account progress as zero", async () => {
    const c = await child(), source = await game(c.id), second = await game(c.id, { world: "kingdom" });
    await db.adventureAlbumProgress.create({ data: { gameId: source.id, snapshotJson: "{bad-progress" } });
    const off = findWorld("kingdom")!.nodes[0]!.boardSlug;
    await db.sceneOverride.create({ data: { slug: off, active: false } });
    try {
      const owned = await ownerFamilyWorlds(rig.c, "parent", source.id);
      expect(owned.worlds[0]).toMatchObject({ status: "ready", completedPlaces: null, foundTargets: null });
      expect(owned.worlds[1]).toMatchObject({ status: "ready", gameId: second.id });
      const other = await child(), onlyOne = await game(other.id);
      expect((await ownerFamilyWorlds(rig.c, "parent", onlyOne.id)).worlds[1]).toMatchObject({ status: "unavailable", purchaseHref: null });
    } finally { await db.sceneOverride.delete({ where: { slug: off } }); }
  });
  it("gives a historical multi-world game only one current card and routes its other map explicitly", async () => {
    const c = await child(), source = await game(c.id, { worlds: ["journey", "kingdom"] });
    const defaultView = await ownerFamilyWorlds(rig.c, "parent", source.id);
    expect(defaultView.worlds.filter(card => card.current).map(card => card.worldSlug)).toEqual(["journey"]);
    const selected = await ownerFamilyWorlds(rig.c, "parent", source.id, "kingdom");
    expect(selected.worlds[0]).toMatchObject({ worldSlug: "kingdom", current: true });
    expect(selected.worlds[1]!.playHref).toContain("?world=journey");
    expect((await ownerFamilyWorlds(rig.c, "parent", source.id, "unknown")).worlds[0]!.worldSlug).toBe("journey");
  });
});

describe("GET /api/family/worlds", () => {
  it("requires the owner session and ignores fabricated child/owner query parameters", async () => {
    const c = await child(), source = await game(c.id), sibling = await child();
    const url = `http://findme.test/api/family/worlds?gameId=${source.id}&childId=${sibling.id}&ownerId=stranger`;
    rig.user = null;
    expect((await GET(new Request(url))).status).toBe(401);
    rig.user = { id: "stranger" };
    expect((await GET(new Request(url))).status).toBe(404);
    rig.user = { id: "parent" };
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ ok: true, childId: c.id });
    expect((await GET(new Request("http://findme.test/api/family/worlds?gameId=../other"))).status).toBe(400);
    const unpaid = await game(c.id, { payment: "PENDING" });
    expect((await GET(new Request(`http://findme.test/api/family/worlds?gameId=${unpaid.id}`))).status).toBe(404);
  });
});
