import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import type { Container } from "../../container";
import { LOCAL_PATCH_BOARD, cropOf, maskOf, type LocalPatchBoard, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { sha256Bytes } from "../fixed-sprite";
import { boardConditioningHash } from "../board-conditioned-source";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { IDENTITY_GATE_ACTION, IDENTITY_GATE_KEY, LEGACY_IDENTITY_GATE_VERSION as IDENTITY_GATE_VERSION, identityGatePrompt } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import type { WorldChargeEvidence } from "../world-budget";

/**
 * A paid game with an approved illustrated identity, exactly as the wizard
 * leaves one - built once so the hide tests and the world tests cannot disagree
 * about what "approved" means.
 *
 * The identity gate runs at FULL strength against this: a real receipt, a real
 * charge in the real ledger, and the photograph's own bytes. Mocking the gate
 * would make every test below it a test of nothing.
 *
 * Not a test file: no `.test.ts` suffix, so vitest does not collect it.
 */

export const LOCAL_PATCH_TEST_BOARD: LocalPatchBoard = {
  board: "sydney", art: "public/scenes/sydney/refresh-20260907/base.webp", ground: "beach sand", sittable: true,
  hides: [
    { id: "sydney-1", left: 960, top: 1256, pose: "standing", targetId: "lifeguard" },
    { id: "sydney-2", left: 1600, top: 1256, pose: "kneeling", targetId: "surfboards" },
    { id: "sydney-3", left: 2176, top: 1128, pose: "sitting-cross-legged", targetId: "rocks" },
  ],
};

export const boardPng = () => sharp({ create: { ...LOCAL_PATCH_BOARD, channels: 4, background: { r: 210, g: 190, b: 150, alpha: 255 } } }).png().toBuffer();

/** A 2x2 identity sheet the face finder can actually read a portrait out of. */
export async function identitySheet() {
  const face = await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 226, g: 178, b: 148, alpha: 255 } } }).png().toBuffer();
  const quadrant = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 255 } } })
    .composite([{ input: face, left: 166, top: 150 }]).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 255 } } })
    .composite([0, 1, 2, 3].map(i => ({ input: quadrant, left: (i % 2) * 512, top: Math.floor(i / 2) * 512 })))
    .png().toBuffer();
}

/**
 * A painter that paints something: the crop it was given, with a figure inside
 * the pose's own box. Without a real difference there is nothing for the tap
 * contract to measure, and a test that measured nothing would pass while the
 * measurement was broken.
 */
export async function paintedCrop(stylePng: Buffer, hide: LocalPatchHide) {
  const box = maskOf(hide), crop = cropOf(hide);
  const figure = await sharp({ create: { width: Math.round(box.width * 0.6), height: Math.round(box.height * 0.8), channels: 4, background: { r: 20, g: 40, b: 180, alpha: 255 } } }).png().toBuffer();
  return sharp(stylePng).composite([{
    input: figure,
    left: box.left - crop.left + Math.round(box.width * 0.2),
    top: box.top - crop.top + Math.round(box.height * 0.2),
  }]).png().toBuffer();
}

/** A fake painter's answer, in the shape a real one gives. */
export const paintedOk = (png: Buffer, evidence: WorldChargeEvidence) =>
  ({ png, rejected: null, quarantined: null, evidence, unknownReason: null });

export const bill = (id: string, micro = 48_800): WorldChargeEvidence => ({
  providerNamespace: "openai:find-me-existing", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { input_tokens: 10, output_tokens: 100 }, model: "gpt-image-2",
  amountMicroUsd: micro, costBasis: "provider-billed",
});

export const PASSING_ANSWER = {
  childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass",
  verdict: "pass", reason: "She kneels on the sand at the right height.", faults: [],
};

export const reply = (over: Partial<LocalPatchJudgeResult> = {}): LocalPatchJudgeResult => ({
  verdict: null, raw: JSON.stringify(PASSING_ANSWER), usage: { prompt_tokens: 900, completion_tokens: 120 },
  requestId: "req-judge", model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false, ...over,
});

export type SeedOptions = {
  readonly gameId?: string;
  /** Leave the identity unapproved, to prove nothing is bought without one. */
  readonly approved?: boolean;
  readonly styleVersion?: string;
  readonly status?: string;
  /** Scene slugs, in order. Defaults to the one board these tests paint. */
  readonly scenes?: readonly { readonly slug: string; readonly version: number }[];
  readonly withJob?: boolean;
};

export async function seedApprovedGame(c: Container, db: PrismaClient, options: SeedOptions = {}) {
  const gameId = options.gameId ?? "game-local-patch";
  const userId = `usr-${gameId}`;
  const email = `${gameId}@example.com`;
  const photo = Buffer.from(`the uploaded photograph of ${gameId}`);
  const sheet = await identitySheet();
  const scenes = options.scenes ?? [{ slug: "sydney", version: 5 }];

  await db.user.create({ data: { id: userId, email } });
  await c.storage.put(`private/photo-${gameId}.jpg`, photo, "image/jpeg");
  await c.storage.put(`private/sheet-${gameId}.png`, sheet, "image/png");
  await db.asset.create({ data: { id: `ast-photo-${gameId}`, ownerId: userId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", storagePath: `private/photo-${gameId}.jpg`, mimeType: "image/jpeg", bytes: photo.length } });
  await db.asset.create({ data: { id: `ast-sheet-${gameId}`, ownerId: userId, type: "IDENTITY_SHEET", visibility: "PRIVATE", storagePath: `private/sheet-${gameId}.png`, mimeType: "image/png", bytes: sheet.length } });
  await db.childProfile.create({ data: { id: `chl-${gameId}`, ownerId: userId, displayName: "Yuval", ageYears: 8,
    originalPhotoAssetId: `ast-photo-${gameId}`, identityAssetId: `ast-sheet-${gameId}` } });
  await db.game.create({ data: { id: gameId, ownerId: userId, childProfileId: `chl-${gameId}`, packageTier: "ONE_WORLD",
    status: options.status ?? "PAID", sceneCount: scenes.length, ...(options.styleVersion ? { styleVersion: options.styleVersion } : {}) } });
  for (const [index, scene] of scenes.entries()) {
    await db.gameScene.create({ data: { id: `gsc-${gameId}-${scene.slug}`, gameId, sceneSlug: scene.slug, sceneVersion: scene.version, orderIndex: index } });
  }
  if (options.withJob) await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "QUEUED" } });

  if (options.approved === false) return { gameId, userId, email, sheet };

  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  const provenance = {
    promptVersion: "character-v3-board-matched-matte", quality: "medium",
    photoAssetId: `ast-photo-${gameId}`, photoSha256: sha256Bytes(photo), crop: null, ageYears: 8,
    style: { version: "board-matched-identity/v1", catalogSha256, atlasSha256: "b".repeat(64) },
  };
  const usage = { prompt_tokens: 1200, completion_tokens: 90 };
  const fingerprint = boardConditioningHash({ gate: IDENTITY_GATE_VERSION, gameId, sheet: sha256Bytes(sheet) });
  const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(gameId);
  await budget.reserve(world, { requestKey: IDENTITY_GATE_KEY, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: 400_000 });
  await budget.settle(world, IDENTITY_GATE_KEY, { providerNamespace: "openai:find-me-existing", providerRequestId: "req-identity-gate",
    usageId: boardConditioningHash(usage), rawUsage: usage, model: "gpt-5.6-sol", amountMicroUsd: 260_000, costBasis: "conservative-upper-estimate" });
  await db.auditLog.create({ data: { id: `aud-${gameId}`, actorType: "SYSTEM", action: IDENTITY_GATE_ACTION,
    entityType: "Asset", entityId: `ast-sheet-${gameId}`,
    metaJson: JSON.stringify({ version: IDENTITY_GATE_VERSION, fingerprint, identityAssetId: `ast-sheet-${gameId}`,
      sheetSha256: sha256Bytes(sheet), provenance, imageHashes: ["c", "d", "e"].map(x => x.repeat(64)),
      approved: true, checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" },
      reason: "Recognisable, painted, correctly laid out.", requestId: "req-identity-gate", costMicroUsd: 260_000,
      usage, model: "gpt-5.6-sol", effort: "high", prompt: identityGatePrompt(8, IDENTITY_GATE_VERSION) }) } });
  return { gameId, userId, email, sheet };
}

/** Every table these tests touch, emptied between them. */
export async function clearWorld(db: PrismaClient) {
  for (const table of ["targetVariantAsset", "targetInstance", "gameScene", "generationJob", "game", "childProfile", "asset", "user", "auditLog", "fileBlob", "worldBudgetLedger"] as const) {
    await (db[table] as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({});
  }
}
