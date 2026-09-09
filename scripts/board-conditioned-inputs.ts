import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { boardSlotDirectionSchema, type BoardConditioningInput, type BoardSlotDirection } from "../src/services/generation/board-conditioned-source";

type BoundPng = BoardConditioningInput["board"];
type Rect = BoardSlotDirection["context"];
type Pose = BoardSlotDirection["slot"]["pose"];
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/);
const assetSchema = z.object({ path: z.string().min(1), sha256: shaSchema });
const rectSchema = boardSlotDirectionSchema.shape.context;
const slotSchema = z.object({
  slotId: z.string(),
  placement: z.object({
    contract: assetSchema, priorResultMetadata: assetSchema, foreground: assetSchema,
    eyeAnchorPx: z.object({ x: z.number(), y: z.number() }).nullable(),
    eyeToChinPx: z.number(), contextRectPx: rectSchema, anchorMode: z.string(),
  }).passthrough(),
  references: z.object({
    localStaticCrop: assetSchema.nullable(), localStaticCropRectPx: rectSchema,
    originalPersonExample: assetSchema.nullable(), originalPersonExampleRectPx: rectSchema.nullable(),
  }).passthrough(),
  pose: z.object({ family: z.string(), instruction: z.string() }).passthrough(),
  lighting: z.object({ keyDirection: z.string(), colorTemperature: z.string(), relativeIntensity: z.string(), fillAndBounce: z.string(), shadow: z.string() }).passthrough(),
}).passthrough();
const catalogSchema = z.object({
  schemaVersion: z.literal("find-me/board-visual-directions/v1"),
  provenance: z.object({ selection: assetSchema }).passthrough(),
  boards: z.array(z.object({
    boardId: z.string(), staticArt: assetSchema.extend({ width: z.number().int().positive(), height: z.number().int().positive(), containsPersonalizedChild: z.literal(false) }),
    sourceMetadata: assetSchema, wardrobe: z.string(), slots: z.array(slotSchema).length(3),
  }).passthrough()),
}).passthrough();
type CatalogSlot = z.infer<typeof slotSchema>;
type Asset = z.infer<typeof assetSchema>;

export type BoardConditioningInputErrorCode = "INVALID_INPUT" | "LOCAL_PATH_REQUIRED" | "FILE_MISSING" | "HASH_MISMATCH" | "INVALID_IMAGE" | "UNSUPPORTED_SLOT_CONTRACT" | "FROZEN_GEOMETRY_MISMATCH" | "ORIGINAL_PEOPLE_REFERENCE_REQUIRED" | "REFERENCE_PIXEL_MISMATCH";
export class BoardConditioningInputError extends Error {
  constructor(readonly code: BoardConditioningInputErrorCode, message: string, readonly boardId?: string, readonly slotId?: string) {
    super(`BOARD_CONDITIONING_INPUTS ${code}: ${message}`);
    this.name = "BoardConditioningInputError";
  }
}
export interface LocalIllustratedReference { path: string; sha256?: string }
export interface LocalMatchingPoseSheet extends LocalIllustratedReference { poseIds: Pose[] }
export interface LoadBoardConditioningInputsOptions {
  /** Explicit local operator input. This loader is not an HTTP request adapter. */
  catalogPath: string;
  sourcePresentation?: BoardConditioningInput["sourcePresentation"];
  /** Explicit board art-direction revision, never a geometry/mask override. */
  slotDirectionOverrides?: Record<string, { poseDescription?: string; lighting?: BoardSlotDirection["lighting"] }>;
  workspaceRoot?: string;
  boardIds: string[];
  child: { profileId: string; ageYears: number };
  illustratedIdentity?: LocalIllustratedReference;
  /** Exact board-specific cell order; never reuse a different board's pose layout. */
  matchingPoseSheets?: Record<string, LocalMatchingPoseSheet>;
}

function demand(ok: unknown, code: BoardConditioningInputErrorCode, message: string, boardId?: string, slotId?: string): asserts ok {
  if (!ok) throw new BoardConditioningInputError(code, message, boardId, slotId);
}
function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new BoardConditioningInputError("INVALID_INPUT", "expected valid local JSON metadata"); }
}
function same(a: unknown, b: unknown): boolean {
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => same(x[k], y[k]));
}
function object(value: unknown): Record<string, unknown> {
  demand(!!value && typeof value === "object" && !Array.isArray(value), "INVALID_INPUT", "metadata object required");
  return value as Record<string, unknown>;
}

/** Four human-observed original-person crops where older slot metadata did not
 * record one. Rectangles select existing people only; they are NOT landmarks or
 * slot edits. Each is bound to the exact assembled board, never a populated view.
 * Paris balcony uses same-scale original plaza children: its empty balcony has
 * no nearby person. The balcony context, not that style crop, determines light. */
const observedOriginalPeople: Record<string, { boardSha256: string; rect: Rect }> = {
  "newyork-open-window-sill": { boardSha256: "56f2b5cd2e874c395714879c173bbf5d312a551707f275b57d4b17a8ac722f7f", rect: { left: 595, top: 767, width: 115, height: 123 } },
  "newyork-park-planter-lean": { boardSha256: "56f2b5cd2e874c395714879c173bbf5d312a551707f275b57d4b17a8ac722f7f", rect: { left: 2550, top: 1410, width: 145, height: 180 } },
  "paris-balcony-flower-peek": { boardSha256: "7fee1ae82a665e528a81b9dcd37fd2f0637e6df808fab060896e52ae48082839", rect: { left: 1260, top: 880, width: 210, height: 220 } },
  "paris-plaza-flower-chest": { boardSha256: "7fee1ae82a665e528a81b9dcd37fd2f0637e6df808fab060896e52ae48082839", rect: { left: 1910, top: 1570, width: 160, height: 185 } },
};

function chooseOriginalPeople(s: CatalogSlot, frozen: BoardSlotDirection["slot"], boardSha256: string, width: number, height: number): Rect {
  if (s.references.originalPersonExampleRectPx) return s.references.originalPersonExampleRectPx;
  const observed = observedOriginalPeople[s.slotId];
  if (observed) {
    demand(observed.boardSha256 === boardSha256, "FROZEN_GEOMETRY_MISMATCH", "observed original-person crop belongs to another static board", undefined, s.slotId);
    return { ...observed.rect };
  }
  // Reuse explicitly authored ORIGINAL face/head regions. Do not guess a face
  // detector, choose a hand/prop, or relabel the target child as the reference.
  const humanHead = (id: string) => /face|head|full-figure/i.test(id) && !/camel|cat|dog|bird|snowman|penguin/i.test(id);
  const candidates: Rect[] = (frozen.forbiddenRects ?? []).filter(r => humanHead(r.id)).map(({ id: _id, ...r }) => r);
  for (const region of frozen.forbiddenPolygons ?? []) if (humanHead(region.id)) {
    const left = Math.floor(Math.min(...region.polygon.map(p => p.x))), top = Math.floor(Math.min(...region.polygon.map(p => p.y)));
    candidates.push({ left, top, width: Math.ceil(Math.max(...region.polygon.map(p => p.x))) - left, height: Math.ceil(Math.max(...region.polygon.map(p => p.y))) - top });
  }
  candidates.sort((a, b) => Math.hypot(a.left + a.width / 2 - frozen.eye.x, a.top + a.height / 2 - frozen.eye.y)
    - Math.hypot(b.left + b.width / 2 - frozen.eye.x, b.top + b.height / 2 - frozen.eye.y));
  const r = candidates[0];
  demand(r, "ORIGINAL_PEOPLE_REFERENCE_REQUIRED", "no authored original-person crop/face region; a local author must identify one", undefined, s.slotId);
  const left = Math.max(0, r.left - 12), top = Math.max(0, r.top - 12);
  return { left, top, width: Math.min(width, r.left + r.width + 12) - left, height: Math.min(height, r.top + r.height + 36) - top };
}

/** No network, env access, file writes, model calls or implicit CLI execution.
 * Returns owned, hash-bound PNG bytes and the unchanged authored slot geometry. */
export async function loadBoardConditioningInputs(options: LoadBoardConditioningInputsOptions): Promise<BoardConditioningInput[]> {
  const opts = structuredClone(options);
  demand(opts.sourcePresentation === undefined || ["compact-board-paint/v2", "compact-reference/v3", "local-composite/v4", "local-composite/v5"].includes(opts.sourcePresentation), "INVALID_INPUT", "unknown source presentation");
  const overrides = z.record(z.object({ poseDescription: boardSlotDirectionSchema.shape.poseDescription.optional(), lighting: boardSlotDirectionSchema.shape.lighting.optional() }).strict()).parse(opts.slotDirectionOverrides ?? {});
  demand(/^[A-Za-z0-9_-]{1,120}$/.test(opts.child?.profileId ?? "") && Number.isInteger(opts.child?.ageYears) && opts.child.ageYears >= 2 && opts.child.ageYears <= 10,
    "INVALID_INPUT", "nonsecret child profile ID and age 2–10 required");
  demand(opts.boardIds?.length > 0 && new Set(opts.boardIds).size === opts.boardIds.length && opts.boardIds.every(id => /^[A-Za-z0-9_-]{1,120}$/.test(id)), "INVALID_INPUT", "unique explicit board IDs required");
  const root = await realpath(path.resolve(opts.workspaceRoot ?? process.cwd()));
  const fileCache = new Map<string, Promise<Buffer>>();
  const localFile = async (candidate: string) => {
    demand(typeof candidate === "string" && candidate.length > 0 && !candidate.includes("\0")
      && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(candidate) && !/^(?:https?|data|file):/i.test(candidate)
      && !/^[\\/]{2}/.test(candidate), "LOCAL_PATH_REQUIRED", "only explicit workspace-local files are accepted");
    const resolved = path.resolve(root, candidate), relative = path.relative(root, resolved);
    demand(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "LOCAL_PATH_REQUIRED", "path lies outside operator workspace");
    let actual: string;
    try { actual = await realpath(resolved); }
    catch { throw new BoardConditioningInputError("FILE_MISSING", "declared local input is missing"); }
    const realRelative = path.relative(root, actual);
    demand(realRelative !== ".." && !realRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realRelative), "LOCAL_PATH_REQUIRED", "resolved input escapes operator workspace");
    let pending = fileCache.get(actual);
    if (!pending) {
      pending = (async () => {
        const info = await stat(actual);
        demand(info.isFile() && info.size <= 32 * 1024 * 1024, "INVALID_INPUT", "local input must be a regular file no larger than 32MB");
        return readFile(actual);
      })();
      fileCache.set(actual, pending);
    }
    return pending;
  };
  const readBound = async (a: Asset) => {
    const bytes = await localFile(a.path);
    demand(hash(bytes) === a.sha256, "HASH_MISMATCH", "declared input bytes do not match their frozen hash");
    return bytes;
  };
  const verifyDeclared = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.path === "string" && item.sha256 !== undefined) await readBound(assetSchema.parse(item));
    for (const child of Object.values(item)) await verifyDeclared(child);
  };
  const rawCatalog = await localFile(opts.catalogPath);
  demand(rawCatalog.length <= 2 * 1024 * 1024, "INVALID_INPUT", "catalog exceeds local metadata limit");
  const parsed = catalogSchema.safeParse(parseJson(rawCatalog));
  demand(parsed.success, "INVALID_INPUT", "unsupported or malformed visual-direction catalog");
  const catalog = parsed.data;
  demand(new Set(catalog.boards.map(b => b.boardId)).size === catalog.boards.length, "INVALID_INPUT", "duplicate catalog board IDs");
  const selected = opts.boardIds.map(id => {
    const board = catalog.boards.find(b => b.boardId === id);
    demand(board, "INVALID_INPUT", "requested board is absent from catalog", id);
    for (const s of board.slots) demand(s.placement.eyeAnchorPx !== null && (s.placement.anchorMode === "fixed-eyeMidpoint" && s.pose.family !== "standing"
      || s.placement.anchorMode === "observed-soles" && s.pose.family === "standing"),
      "UNSUPPORTED_SLOT_CONTRACT", "legacy sole-ground/standing requires its real adapter; it cannot be loaded as simple-peek", id, s.slotId);
    return board;
  });
  const selectedSlotIds = selected.flatMap(b => b.slots.map(s => s.slotId));
  demand(new Set(selectedSlotIds).size === selectedSlotIds.length, "INVALID_INPUT", "duplicate catalog slot IDs");
  await verifyDeclared(catalog.provenance);
  const png = async (bytes: Buffer, allowWebp: boolean, maxPixels: number): Promise<BoundPng> => {
    try {
      const image = sharp(bytes, { limitInputPixels: maxPixels, failOn: "warning" });
      const info = await image.metadata();
      demand((info.format === "png" || allowWebp && info.format === "webp") && (info.pages ?? 1) === 1 && (info.orientation ?? 1) === 1, "INVALID_IMAGE", "single unrotated PNG (or static WEBP) required");
      const output = info.format === "png" ? Buffer.from(bytes) : await image.ensureAlpha().png().toBuffer();
      return { png: output, sha256: hash(output) };
    } catch (error) {
      if (error instanceof BoardConditioningInputError) throw error;
      throw new BoardConditioningInputError("INVALID_IMAGE", "input image cannot be decoded safely");
    }
  };
  const assertCrop = async (board: BoundPng, rect: Rect, reference: Asset | null) => {
    if (!reference) return;
    const expected = await sharp(board.png).extract(rect).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const actualPng = await png(await readBound(reference), false, 25_000_000);
    const actual = await sharp(actualPng.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    demand(actual.info.width === expected.info.width && actual.info.height === expected.info.height && actual.data.equals(expected.data),
      "REFERENCE_PIXEL_MISMATCH", "declared original reference is not the matching clean static-board crop");
  };
  const outputs: BoardConditioningInput[] = [];
  for (const b of selected) {
    await verifyDeclared(b);
    const board = await png(await readBound(b.staticArt), true, 25_000_000);
    const boardInfo = await sharp(board.png).metadata();
    demand(boardInfo.width === b.staticArt.width && boardInfo.height === b.staticArt.height, "INVALID_IMAGE", "static board dimensions differ from catalog", b.boardId);
    const sheet = opts.matchingPoseSheets?.[b.boardId], reference = sheet ?? opts.illustratedIdentity;
    demand(reference, "INVALID_INPUT", "illustrated identity or this board's explicit matching-pose sheet required", b.boardId);
    const referenceBytes = await localFile(reference.path);
    if (reference.sha256 !== undefined) demand(shaSchema.safeParse(reference.sha256).success && hash(referenceBytes) === reference.sha256, "HASH_MISMATCH", "illustrated reference differs from expected hash", b.boardId);
    const illustratedIdentity = await png(referenceBytes, false, 1024 * 1024);
    const identityInfo = await sharp(illustratedIdentity.png).metadata();
    demand((identityInfo.width ?? 0) <= 1024 && (identityInfo.height ?? 0) <= 1024, "INVALID_IMAGE", "illustrated reference must fit 1024 square without implicit resize", b.boardId);
    if (sheet) demand(sheet.poseIds.length === 3 && b.slots.every((s, i) => s.pose.family === sheet.poseIds[i]), "FROZEN_GEOMETRY_MISMATCH", "matching sheet pose IDs must equal this board's actual cell order", b.boardId);
    const slots: BoardConditioningInput["slots"] = [];
    for (const s of b.slots) {
      const contract = object(parseJson(await readBound(s.placement.contract))), result = object(parseJson(await readBound(s.placement.priorResultMetadata)));
      const retained = boardSlotDirectionSchema.shape.slot.parse(result.slot);
      const authored = object(contract.slot);
      // A few historical local results use board-local IDs; the catalog names
      // them with this exact board prefix. This changes identity only, never
      // geometry/pose, and is not permission for arbitrary aliases.
      demand((retained.id === s.slotId || `${b.boardId}-${retained.id}` === s.slotId)
        && retained.pose === s.pose.family && same(retained.eye, s.placement.eyeAnchorPx)
        && retained.faceHeightPx === s.placement.eyeToChinPx && same(retained.window, s.placement.contextRectPx),
      "FROZEN_GEOMETRY_MISMATCH", "catalog differs from actual retained slot geometry/pose", b.boardId, s.slotId);
      // Old authoring files may retain a superseded pose label (Tokyo); actual
      // source result/cell mapping is authoritative, but geometry/protection is not negotiable.
      for (const key of ["id", "eye", "faceHeightPx", "window", "forbiddenRects", "forbiddenPolygons", "mode", "standingHeightPx", "supportPointPx", "cutSelection", "pixelRefinement", "compositingTone"] as const)
        demand(same(authored[key], retained[key]), "FROZEN_GEOMETRY_MISMATCH", `authored ${key} differs from retained geometry`, b.boardId, s.slotId);
      const frozen = { ...retained, id: s.slotId };
      demand(contract.boardSha256 === b.staticArt.sha256 && result.boardSha256 === b.staticArt.sha256
        && contract.foregroundSha256 === s.placement.foreground.sha256 && result.foregroundSha256 === s.placement.foreground.sha256,
      "FROZEN_GEOMETRY_MISMATCH", "slot metadata belongs to another static board or foreground", b.boardId, s.slotId);
      demand(same(s.references.localStaticCropRectPx, s.placement.contextRectPx), "FROZEN_GEOMETRY_MISMATCH", "local context rectangle drifted", b.boardId, s.slotId);
      const originalPeople = chooseOriginalPeople(s, frozen, b.staticArt.sha256, b.staticArt.width, b.staticArt.height);
      const direction = boardSlotDirectionSchema.parse({ slot: frozen, context: s.placement.contextRectPx, originalPeople,
        poseDescription: s.pose.instruction, wardrobe: b.wardrobe,
        lighting: { key: `${s.lighting.keyDirection}; ${s.lighting.colorTemperature}`, fill: s.lighting.fillAndBounce,
          shadows: s.lighting.shadow, exposure: s.lighting.relativeIntensity }, ...overrides[s.slotId] });
      for (const r of [direction.context, direction.originalPeople]) demand(r.left + r.width <= b.staticArt.width && r.top + r.height <= b.staticArt.height,
        "INVALID_INPUT", "authored crop exceeds static board", b.boardId, s.slotId);
      await assertCrop(board, direction.context, s.references.localStaticCrop);
      await assertCrop(board, direction.originalPeople, s.references.originalPersonExample);
      slots.push({ ...direction, foreground: await png(await readBound(s.placement.foreground), false, 25_000_000) });
    }
    outputs.push({ boardId: b.boardId, ...(opts.sourcePresentation ? { sourcePresentation: opts.sourcePresentation } : {}), board, child: { ...opts.child, illustratedIdentity,
      referenceRole: sheet ? "matching-pose-edit-target" : "illustrated-identity", ...(sheet ? { matchingPoseIds: [...sheet.poseIds] } : {}) }, slots });
  }
  demand(Object.keys(overrides).every(key => outputs.some(b => b.slots.some(s => s.slot.id === key))), "INVALID_INPUT", "direction override names an unselected slot");
  return outputs;
}
