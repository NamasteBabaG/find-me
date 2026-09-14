/** The local PILOT GAME: the marked test board, five demo child patches (the
 * public beach demo child, no photo, no provider, no money), one discovery and
 * one postcard, carrying the frozen album book — created in the LOCAL SQLite
 * for playing the whole find → discovery → album → postcard → leave/return path.
 *
 *   npx tsx scripts/pilot-game.ts
 *
 * Prints the player link (what a child on the shared link sees: album kept in
 * that browser) and a magic link for the owner (album also kept in the family
 * account through /api/play/album). Refuses anything but a local file: database.
 * Re-running replaces the pilot game and its album; other games are untouched.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../src/lib/env";
import { getContainer } from "../src/services/container";
import { ensureUser, createMagicLink } from "../src/services/auth.service";
import { deleteAsset, signedAssetUrl, storeAsset } from "../src/services/asset.service";
import { ensurePlayerLink } from "../src/services/share-link.service";
import { prepareAdventureConfig } from "../src/services/adventure-content.service";
import { ADVENTURE_TEST_BOARD } from "../content/adventures";
import { GameConfigSchema, type GameConfig, type SceneConfig, type SpriteRef, type TargetConfig } from "../src/domain/game/config";
import type { ReadyAdventureBoard } from "../src/domain/adventure/content";

const GAME_ID = "game_pilot_album_local";
const OWNER_EMAIL = "pilot@findme.local";
const BOARD = "pilot-test-board";
const PROVIDER = "pilot-fixture";
/** The demo child's public patches, cut for the beach; pasted onto the test board as dummy hides. */
const PATCHES: Array<[string, string]> = [["sandcastle-A", "sandcastle-B"], ["float-A", "float-B"], ["umbrella-A", "umbrella-B"], ["sandcastle-B", "float-A"], ["umbrella-B", "sandcastle-A"]];
const HINTS = ["בפינה השמאלית התחתונה", "למעלה, ליד העצים", "באמצע למטה, ליד הדוכנים", "למעלה מימין, ליד המגדל", "מימין, ליד הגשר"];

type Patch = { name: string; buffer: Buffer; width: number; height: number; hit: { x: number; y: number; w: number; h: number }; anchor: { x: number; y: number } };

function loadPatch(name: string): Patch {
  const meta = JSON.parse(readFileSync(path.join("public", "demo", "patches", `beach-${name}.json`), "utf8"));
  const buffer = readFileSync(path.join("public", "demo", "patches", `beach-${name}.webp`));
  const r = meta.rectNorm, h = meta.hitRectNorm, a = meta.anchorNorm;
  // The child's own footprint and head, relative to the patch, so they move with it.
  return { name, buffer, width: meta.rect.w, height: meta.rect.h, hit: { x: (h.x - r.x) / r.w, y: (h.y - r.y) / r.h, w: h.w / r.w, h: h.h / r.h }, anchor: { x: (a.x - r.x) / r.w, y: (a.y - r.y) / r.h } };
}

/** Place a patch inside a personal zone, keeping its own aspect, with a small margin. */
function placeIn(zone: { x: number; y: number; w: number; h: number }, patch: Patch, art: { width: number; height: number }) {
  const aspect = patch.width / patch.height;
  const margin = 0.01;
  let h = zone.h - 2 * margin;
  let w = (h * art.height * aspect) / art.width;
  if (w > zone.w - 2 * margin) { w = zone.w - 2 * margin; h = (w * art.width) / (art.height * aspect); }
  const rect = { x: round(zone.x + (zone.w - w) / 2), y: round(zone.y + (zone.h - h) / 2), w: round(w), h: round(h) };
  const hitRect = { x: round(rect.x + patch.hit.x * rect.w), y: round(rect.y + patch.hit.y * rect.h), w: round(patch.hit.w * rect.w), h: round(patch.hit.h * rect.h) };
  const anchor = { x: round(rect.x + patch.anchor.x * rect.w), y: round(rect.y + patch.anchor.y * rect.h) };
  return { rect, hitRect, anchor };
}
const round = (n: number) => Math.round(n * 10000) / 10000;

async function main() {
  const e = env();
  if (e.NODE_ENV === "production" || !e.DATABASE_URL.startsWith("file:")) throw new Error("The pilot game is for a LOCAL file: database only");
  const c = getContainer();
  const plan = ADVENTURE_TEST_BOARD.boards.find((b) => b.boardSlug === BOARD);
  if (!plan || plan.status !== "ready") throw new Error("The test board is not ready");
  const board: ReadyAdventureBoard = plan;
  const art = { width: board.art.width, height: board.art.height };
  const owner = await ensureUser(c, OWNER_EMAIL);

  // Replace, never accumulate: the previous pilot game, its album row (cascade) and its assets.
  const previous = await c.db.asset.findMany({ where: { provider: PROVIDER, ownerId: owner.id, status: "READY" }, select: { id: true } });
  for (const asset of previous) await deleteAsset(c, asset.id);
  await c.db.game.deleteMany({ where: { id: GAME_ID } });

  const store = async (name: string, type: "AVATAR" | "TARGET_SPRITE", buffer: Buffer, mimeType: string) => {
    const meta = await sharp(buffer).metadata();
    return storeAsset(c, { ownerId: owner.id, type, visibility: "GAME", buffer, mimeType, width: meta.width, height: meta.height, provider: PROVIDER, providerRequestId: `pilot:${name}:${createHash("sha256").update(buffer).digest("hex").slice(0, 12)}` });
  };
  const avatar = await store("avatar", "AVATAR", readFileSync(path.join("public", "demo", "noa-portrait.png")), "image/png");
  const patchAssets = new Map<string, { asset: { id: string }; patch: Patch }>();
  const patchFor = async (name: string) => {
    const known = patchAssets.get(name);
    if (known) return known;
    const patch = loadPatch(name);
    const asset = await store(name, "TARGET_SPRITE", patch.buffer, "image/webp");
    const entry = { asset, patch };
    patchAssets.set(name, entry);
    return entry;
  };

  const targets: TargetConfig[] = [];
  for (const [i, zone] of board.personalZones.entries()) {
    const [aName, bName] = PATCHES[i]!;
    const sprite = async (name: string): Promise<SpriteRef> => {
      const { asset, patch } = await patchFor(name);
      const placed = placeIn(zone, patch, art);
      return { kind: "image", url: signedAssetUrl(c, asset.id), width: patch.width, height: patch.height, rect: placed.rect, hitRect: placed.hitRect, anchor: placed.anchor };
    };
    const A = await sprite(aName), B = await sprite(bName);
    const centre = { x: round(zone.x + zone.w / 2), y: round(zone.y + zone.h / 2) };
    const slot = (id: string) => ({ id, x: centre.x, y: centre.y, scale: 0.2, rotation: 0, zIndex: 10 + i, layer: "front" as const, flip: false, hintZone: { x: centre.x, y: centre.y, r: 0.12 }, hintText: HINTS[i]! });
    targets.push({ id: `hide-${i + 1}`, targetType: "pilot", difficulty: (i % 3 + 1) as 1 | 2 | 3, mission: `מצאו את נועה (${i + 1})`, item: `מחבוא ${i + 1}`, success: ["מצאתם אותי!"], animation: "peek", slots: [slot(`hide-${i + 1}-a`), slot(`hide-${i + 1}-b`)], sprite: A, spriteByVariant: { A, B } });
  }

  const scene: SceneConfig = {
    slug: BOARD, version: board.sceneVersion, worldSlug: board.worldSlug, playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3,
    name: board.name.he, tagline: "תוכן דמה לבדיקת המסלול, לא ארט", artStatus: "final",
    art: { width: art.width, height: art.height, base: board.art.base, thumbnail: "/scenes/pilot-test/thumb.webp", palette: { sky: "#e8f4fb", ground: "#efd9a6", accent: "#e8583a" } },
    targets, ambient: [], celebration: { kind: "confetti", completeText: "מצאתם את כל המחבואים בבורד הבדיקה!" },
    collectible: { id: "pilot-shell", name: "צדף בדיקה", icon: "🐚" }, sounds: {},
  };
  const config: GameConfig = GameConfigSchema.parse({
    version: 1, gameId: GAME_ID, locale: "he", child: { name: "נועה", avatarUrl: signedAssetUrl(c, avatar.id) },
    styleVersion: "pilot-album-v1", packageTier: "ONE_WORLD", composedAt: new Date().toISOString(),
    scenes: [scene],
    worlds: [{
      slug: board.worldSlug, version: 1, name: "עולם הבדיקה", tagline: "בורד אחד, תוכן דמה", intro: "עולם בדיקה של הפיילוט: המסלול אמיתי, הציור לא.",
      map: { width: 1536, height: 1024, art: "/worlds/journey/map.webp", palette: { sky: "#e8f4fb", ground: "#efd9a6", accent: "#e8583a" } },
      nodes: [{ boardSlug: BOARD, routeIndex: 1, x: 0.5, y: 0.52, labelAnchor: "bottom", markerScale: 1, travelStyle: "walk" }],
      collectible: { id: "pilot-shells", name: "צדפי בדיקה", piece: "צדף", icon: "🐚" },
      completion: { title: "סיימתם את עולם הבדיקה", text: "כל המחבואים והתגלית נמצאו.", icon: "🏁" },
    }],
  });
  // The book is attached through the same gate a real pilot game will use: art bytes, hash, size and layout checked.
  const withBook = await prepareAdventureConfig(config, ADVENTURE_TEST_BOARD, [BOARD], path.join(process.cwd(), "public"));
  const now = new Date();
  await c.db.game.create({ data: {
    id: GAME_ID, ownerId: owner.id, packageTier: "ONE_WORLD", title: "פיילוט — בורד בדיקה", status: "DELIVERED", sceneCount: 1, styleVersion: "pilot-album-v1", locale: "he",
    draftToken: `draft_${GAME_ID}`, configJson: JSON.stringify(withBook), paidAt: now, readyAt: now, deliveredAt: now,
  } });
  const link = await ensurePlayerLink(c, GAME_ID);
  const magic = await createMagicLink(c, owner.id, "/library");
  console.log(JSON.stringify({ gameId: GAME_ID, owner: OWNER_EMAIL, boards: withBook.scenes.length, hides: targets.length, discoveries: withBook.adventure?.boards[0]?.discoveries.length, assets: patchAssets.size + 1 }));
  console.log(`PLAY (guest, album in the browser):   ${link.url}`);
  console.log(`OWNER sign-in (album in the account): ${magic}`);
  console.log("On a dev server on another port, swap the origin (e.g. localhost:3001).");
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
