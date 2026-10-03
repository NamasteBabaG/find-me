import { REFRESHED_COLLECTION_BOARDS, REFRESHED_WIZARD_CATALOG } from "../../../content/adventures/wizard-refresh-release";
import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "../../../content/adventures/wizard-integrated-release";
import { cropOf } from "../../domain/scene/local-patch-hides";
import { readCollectionArt, type IdentityArtCache } from "./collection-art";
import sharp, { type OverlayOptions } from "sharp";
import { readBoardConditionedCatalog, loadBoardConditionedCatalogBoard, type BoardConditionedCatalog } from "./board-conditioned-catalog";
import { sha256Bytes } from "./fixed-sprite";
import type { QaCharacterStyleContract } from "../../infra/generation/types";
import { identityStyleCatalogSha256 } from "./local-patch-identity-catalog";
import { INTEGRATED_COLLECTION_VERSION } from "../../domain/scene/local-patch-versions";

export const BOARD_WIZARD_IDENTITY_STYLE_VERSION = "board-matched-identity/v2" as const;
export const LEGACY_BOARD_WIZARD_IDENTITY_STYLE_VERSION = "board-matched-identity/v1" as const;
type Rect = { left: number; top: number; width: number; height: number };
// These are authored ORIGINAL-person protected rectangles, not slot.eye or
// faceHeightPx (which describe a future inserted child). Never guess a face.
const FACE_SOURCES: Record<string, { slot: number; id: string } | null> = {
  newyork: null,
  amazon: { slot: 0, id: "original-head-0" },
  paris: { slot: 0, id: "straw-hat-girl-head" },
  marrakech: { slot: 0, id: "pink-clad-child-behind-lanterns-face" },
  giza: { slot: 0, id: "left-white-capped-worker-face" },
  tokyo: { slot: 2, id: "original-head-0" },
  greatwall: { slot: 1, id: "original-head-0" },
  sydney: { slot: 2, id: "cream-shirt-seated-child-face" },
  antarctica: { slot: 2, id: "green-child-on-sled-face" },
};
function contains(outer: Rect, inner: Rect) {
  return inner.left >= outer.left && inner.top >= outer.top && inner.width > 0 && inner.height > 0
    && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
}
async function boardPeopleTile(catalog: BoardConditionedCatalog, boardId: string, root: string) {
  if (!(boardId in FACE_SOURCES)) throw new Error("BOARD_IDENTITY_STYLE: board has no authored style source");
  const selection = FACE_SOURCES[boardId], entry = catalog.boards.find(b => b.boardId === boardId);
  if (!entry) throw new Error("BOARD_IDENTITY_STYLE: board is missing");
  const direction = entry.slots[selection?.slot ?? 0]!;
  const authored = selection ? direction.slot.forbiddenRects?.find(r => r.id === selection.id) : undefined;
  if (selection && !authored) throw new Error("BOARD_IDENTITY_STYLE: authored face rectangle is missing");
  const context = direction.originalPeople;
  const face = authored ? { left: authored.left, top: authored.top, width: authored.width, height: authored.height } : null;
  if (face && !contains(context, face)) throw new Error("BOARD_IDENTITY_STYLE: authored face is outside its original-person context");
  const empty = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#808080" } }).png().toBuffer();
  const reference = { profileId: "static-style-reference-only", ageYears: 8, referenceRole: "illustrated-identity" as const,
    illustratedIdentity: { png: empty, sha256: sha256Bytes(empty) } };
  const input = await loadBoardConditionedCatalogBoard(catalog, boardId, reference, root);
  const metadata = await sharp(input.board.png, { limitInputPixels: 25_000_000 }).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1
    || !contains({ left: 0, top: 0, width: metadata.width, height: metadata.height }, context)) {
    throw new Error("BOARD_IDENTITY_STYLE: original-person context is outside its verified static board");
  }
  const contextPng = await sharp(input.board.png).extract(context).png().toBuffer();
  const facePng = face ? await sharp(input.board.png).extract(face).png().toBuffer() : null;
  // A large complete face beside its complete figure, with no aspect distortion
  // or invented detail. NY has no authored face: retain an explicit figure-only tile.
  const png = facePng ? await sharp({ create: { width: 320, height: 320, channels: 4, background: "#e4dfd5" } }).composite([
    { input: await sharp(facePng).resize(208, 304, { fit: "contain", background: "#e4dfd5" }).png().toBuffer(), left: 8, top: 8 },
    { input: await sharp(contextPng).resize(88, 304, { fit: "contain", background: "#e4dfd5" }).png().toBuffer(), left: 224, top: 8 },
  ]).png().toBuffer() : await sharp(contextPng).resize(320, 320, { fit: "contain", background: "#e4dfd5" }).png().toBuffer();
  return { png, sha256: sha256Bytes(png), boardId, boardSha256: input.board.sha256,
    source: { slotId: direction.slot.id, context, contextSha256: sha256Bytes(contextPng), face,
      faceId: selection?.id ?? null, faceSha256: facePng ? sha256Bytes(facePng) : null,
      fallback: face ? null : "no-authored-face/full-person" as const } };
}
/** Reusable same-board style evidence for a hide: original art only. */
export async function buildBoardPeopleStyle(boardId: string, root = process.cwd()) {
  const { catalog, sha256: catalogSha256 } = await readBoardConditionedCatalog(root);
  return { ...await boardPeopleTile(catalog, boardId, root), catalogSha256, version: BOARD_WIZARD_IDENTITY_STYLE_VERSION };
}
export async function buildBoardWizardIdentityStyle(root = process.cwd(), version: QaCharacterStyleContract["version"] = BOARD_WIZARD_IDENTITY_STYLE_VERSION,
  worldSlug: "journey" | "kingdom" = "journey", identityArtCache?: IdentityArtCache) {
  if (worldSlug === "kingdom" && version !== "board-matched-identity/v4") throw Error("Kingdom requires its integrated identity style");
  if (version === "board-matched-identity/v3" || version === "board-matched-identity/v4") return { ...await buildRefreshedIdentityStyle(root, worldSlug, identityArtCache), version };
  if (version === LEGACY_BOARD_WIZARD_IDENTITY_STYLE_VERSION) return buildLegacyBoardWizardIdentityStyle(root);
  if (version !== BOARD_WIZARD_IDENTITY_STYLE_VERSION) throw new Error("BOARD_IDENTITY_STYLE: unknown identity style version");
  const { catalog, sha256: catalogSha256 } = await readBoardConditionedCatalog(root);
  const composites: OverlayOptions[] = [], examples = [];
  for (const [index, entry] of catalog.boards.entries()) {
    const tile = await boardPeopleTile(catalog, entry.boardId, root);
    composites.push({ input: tile.png, left: 16 + (index % 3) * 336, top: 16 + Math.floor(index / 3) * 336 });
    const { png: _png, ...metadata } = tile;
    examples.push(metadata);
  }
  if (examples.length !== 9) throw new Error("BOARD_IDENTITY_STYLE: all nine original-board examples are required");
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#e4dfd5" } }).composite(composites).png().toBuffer();
  return { png, version, catalogSha256, atlasSha256: sha256Bytes(png), examples };
}
/** Mandatory source-backed style reference. No photo, generated identity or
 * network input enters this builder, and missing assets never fall back to prose.
 * Nine original-people crops show medium/linework, not identity-sheet lighting. */
async function buildLegacyBoardWizardIdentityStyle(root: string) {
  const { catalog, sha256: catalogSha256 } = await readBoardConditionedCatalog(root);
  const empty = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#808080" } }).png().toBuffer();
  const reference = { profileId: "static-style-reference-only", ageYears: 8, referenceRole: "illustrated-identity" as const,
    illustratedIdentity: { png: empty, sha256: sha256Bytes(empty) } };
  const composites: OverlayOptions[] = [], examples = [];
  for (const [index, entry] of catalog.boards.entries()) {
    // The existing loader verifies paths, realpath containment, exact PNG hashes
    // and all mandatory static assets. Its synthetic child is never composited.
    const input = await loadBoardConditionedCatalogBoard(catalog, entry.boardId, reference, root);
    const crop = entry.slots[0]!.originalPeople, image = sharp(input.board.png, { limitInputPixels: 25_000_000 }), metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1
      || (metadata.orientation ?? 1) !== 1 || crop.left + crop.width > metadata.width || crop.top + crop.height > metadata.height) {
      throw new Error("BOARD_IDENTITY_STYLE: original-people example is outside its verified static board");
    }
    const native = await image.extract(crop).png().toBuffer();
    const tile = await sharp(native).resize(320, 320, { fit: "contain", background: "#e4dfd5" }).png().toBuffer();
    composites.push({ input: tile, left: 16 + (index % 3) * 336, top: 16 + Math.floor(index / 3) * 336 });
    examples.push({ boardId: entry.boardId, boardSha256: input.board.sha256, crop, cropSha256: sha256Bytes(native) });
  }
  if (examples.length !== 9) throw new Error("BOARD_IDENTITY_STYLE: all nine original-board examples are required");
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#e4dfd5" } }).composite(composites).png().toBuffer();
  return { png, version: LEGACY_BOARD_WIZARD_IDENTITY_STYLE_VERSION, catalogSha256, atlasSha256: sha256Bytes(png), examples };
}

/** Current scene contexts, never enlarged stranger faces. All pixels/hash-bound. */
async function buildRefreshedIdentityStyle(root: string, worldSlug: "journey" | "kingdom", identityArtCache?: IdentityArtCache) {
  const plans = worldSlug === "kingdom" ? INTEGRATED_WIZARD_CATALOG.boards.filter(board => board.worldSlug === "kingdom") : REFRESHED_WIZARD_CATALOG.boards;
  const boards = worldSlug === "kingdom" ? INTEGRATED_COLLECTION_BOARDS.filter(board => plans.some(plan => plan.boardSlug === board.board)) : REFRESHED_COLLECTION_BOARDS;
  // Journey keeps its exact historical provenance. Kingdom pins its own source
  // recipe; extending the catalog must not invalidate an identity already paid for.
  const catalogSha256 = worldSlug === "kingdom"
    ? await identityStyleCatalogSha256(boards[0]!.board, INTEGRATED_COLLECTION_VERSION, root)
    : (await readBoardConditionedCatalog(root)).sha256;
  const composites: OverlayOptions[] = [], examples = [];
  for (const [i, board] of boards.entries()) {
    const plan = plans.find(b => b.boardSlug === board.board)!;
    if (plan.status !== "ready") throw Error("Refreshed identity art unavailable");
    const retained = identityArtCache?.get(plan.art.sha256);
    if (retained && sha256Bytes(retained) !== plan.art.sha256) throw Error("Refreshed identity cached art changed");
    const bytes = retained ?? await readCollectionArt(board.art, plan.art.sha256, root);
    if (!bytes) throw Error("Refreshed identity art missing from manifest");
    const crop = cropOf(board.hides[0]!);
    const native = await sharp(bytes).extract(crop).png().toBuffer();
    const tile = await sharp(native).resize(320, 320, { fit: "contain", background: "#e4dfd5" }).png().toBuffer();
    composites.push({ input: tile, left: 16 + (i % 3) * 336, top: 16 + Math.floor(i / 3) * 336 });
    examples.push({ boardId: board.board, boardSha256: plan.art.sha256, crop, cropSha256: sha256Bytes(native) });
  }
  if (examples.length !== 9) throw Error("Nine refreshed identity style sources required");
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#e4dfd5" } }).composite(composites).png().toBuffer();
  return { png, version: "board-matched-identity/v3" as const, catalogSha256, atlasSha256: sha256Bytes(png), examples };
}
