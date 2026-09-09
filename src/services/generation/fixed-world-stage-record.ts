import { z } from "zod";
import { GameConfigSchema } from "../../domain/game/config";
import { fixedWorldJsonSha256 } from "./fixed-world-materializer";

/** Reserved opt-in marker; ordinary games never enter the fixed engine implicitly. */
export const FIXED_WORLD_STYLE_VERSION = "fixed-sprite-v3";
export const FIXED_WORLD_STYLE_PREFIX = "fixed-sprite-";
export const isFixedWorldStyle = (style: string): boolean => style.startsWith(FIXED_WORLD_STYLE_PREFIX);

export class FixedWorldStageError extends Error {
  constructor(readonly code: "unsupported" | "conflict" | "identity" | "budget" | "integrity" | "permission" | "storage", message: string) {
    super(message); this.name = "FixedWorldStageError";
  }
}
export function fixedStageAssert(value: unknown, code: FixedWorldStageError["code"], message: string): asserts value {
  if (!value) throw new FixedWorldStageError(code, message);
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(200);
/** Private creation intent. Not a paid request, visual approval or staged game. */
export const fixedWorldEnrollmentRecordSchema = z.object({
  version: z.literal("fixed-world-enrollment/v1"), status: z.literal("done"), state: z.literal("enrolled"),
  createdAt: z.string().datetime(), gameId: identifier, ownerId: identifier, childProfileId: identifier,
  childAgeYears: z.number().int().min(2).max(10), childDisplayName: z.string().trim().min(2).max(80), locale: z.enum(["he", "en"]),
  planSha256: digest, worldId: identifier, worldSlug: identifier, worldVersion: z.number().int().positive(), worldDefinitionSha256: digest,
  scenes: z.array(z.object({ slug: identifier, sceneVersion: z.number().int().positive(), definitionSha256: digest }).strict()).length(9),
  identityAssetId: identifier, identitySha256: digest, identityStoragePath: z.string().min(1).max(1024),
  avatarAssetId: identifier, avatarSha256: digest, avatarStoragePath: z.string().min(1).max(1024),
  originalPhoto: z.object({ id: identifier, sha256: digest, storagePath: z.string().min(1).max(1024), mimeType: z.string().regex(/^image\/(png|jpeg|webp)$/) }).strict().nullable(),
  budgetCapMicroUsd: z.literal(5_000_000), initialBudgetSnapshotSha256: digest,
}).strict().superRefine((record, ctx) => {
  if (record.worldId !== `${record.gameId}:${record.worldSlug}` || new Set(record.scenes.map(scene => scene.slug)).size !== 9) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid enrolled world binding" });
  const ids = [record.identityAssetId, record.avatarAssetId, ...(record.originalPhoto ? [record.originalPhoto.id] : [])];
  const paths = [record.identityStoragePath, record.avatarStoragePath, ...(record.originalPhoto ? [record.originalPhoto.storagePath] : [])];
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Child asset roles must have distinct identities and storage" });
});
export type FixedWorldEnrollmentRecord = z.infer<typeof fixedWorldEnrollmentRecordSchema>;
export function readFixedWorldEnrollment(stepsJson: string): FixedWorldEnrollmentRecord | null {
  let raw: unknown;
  try { raw = JSON.parse(stepsJson); } catch { throw new FixedWorldStageError("integrity", "Invalid private generation steps"); }
  fixedStageAssert(raw && typeof raw === "object" && !Array.isArray(raw), "integrity", "Invalid private generation steps");
  if (!Object.prototype.hasOwnProperty.call(raw, "fixedEnrollment")) return null;
  const parsed = fixedWorldEnrollmentRecordSchema.safeParse((raw as Record<string, unknown>).fixedEnrollment);
  fixedStageAssert(parsed.success, "integrity", "Invalid fixed-world enrollment record");
  return parsed.data;
}
export const fixedStageAssetSchema = z.object({
  id: z.string().regex(/^ast_fixed_[a-f0-9]{64}$/),
  role: z.enum(["sprite", "source", "context", "mask", "board", "provenance"]),
  visibility: z.enum(["PRIVATE", "GAME"]),
  mimeType: z.enum(["image/png", "image/webp", "image/jpeg", "application/json"]),
  encodedSha256: digest, width: z.number().int().positive().max(8192).nullable(), height: z.number().int().positive().max(8192).nullable(),
  rgbaSha256: digest.optional(),
}).strict().superRefine((asset, ctx) => {
  if ((asset.role === "sprite" || asset.role === "board") !== (asset.visibility === "GAME")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only final sprites and original boards may be game-visible" });
  if (asset.role === "provenance") {
    if (asset.mimeType !== "application/json" || asset.width !== null || asset.height !== null || asset.rgbaSha256 !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid private provenance asset" });
  } else if ((asset.role === "board" ? !asset.mimeType.startsWith("image/") : asset.mimeType !== "image/png") || asset.width === null || asset.height === null || !asset.rgbaSha256) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Image assets need exact encoded and decoded bindings" });
});
export type FixedStageAsset = z.infer<typeof fixedStageAssetSchema>;
export const fixedWorldStageRecordSchema = z.object({
  version: z.literal("fixed-world-stage/v1"), status: z.literal("done"), state: z.enum(["staged", "deleting", "deleted"]),
  startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
  gameId: identifier, ownerId: identifier, childProfileId: identifier, childAgeYears: z.number().int().min(2).max(10), worldId: identifier,
  planSha256: digest, budgetSnapshotSha256: digest, configSha256: digest,
  identityAssetId: identifier, identitySha256: digest, avatarAssetId: identifier, avatarSha256: digest,
  assets: z.array(fixedStageAssetSchema).min(92).max(118),
  scenes: z.array(z.object({ slug: identifier, sceneVersion: z.number().int().positive(), configSha256: digest }).strict()).length(9),
}).strict().superRefine((record, ctx) => {
  if (new Set(record.assets.map(asset => asset.id)).size !== record.assets.length || record.assets.filter(asset => asset.role === "sprite").length !== 27 || record.assets.filter(asset => asset.role === "context").length !== 27 || record.assets.filter(asset => asset.role === "mask").length !== 27 || record.assets.filter(asset => asset.role === "board").length !== 9 || record.assets.filter(asset => asset.role === "provenance").length !== 1 || record.assets.filter(asset => asset.role === "source").length < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete or duplicate fixed-world asset inventory" });
  }
  if (new Set(record.scenes.map(scene => scene.slug)).size !== 9) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nine distinct scenes required" });
});
export type FixedWorldStageRecord = z.infer<typeof fixedWorldStageRecordSchema>;

export function readFixedWorldStage(stepsJson: string): FixedWorldStageRecord | null {
  let raw: unknown;
  try { raw = JSON.parse(stepsJson); } catch { throw new FixedWorldStageError("integrity", "Invalid private generation steps"); }
  fixedStageAssert(raw && typeof raw === "object" && !Array.isArray(raw), "integrity", "Invalid private generation steps");
  if (!Object.prototype.hasOwnProperty.call(raw, "fixedWorld")) return null;
  const parsed = fixedWorldStageRecordSchema.safeParse((raw as Record<string, unknown>).fixedWorld);
  fixedStageAssert(parsed.success, "integrity", "Invalid fixed-world staging record");
  return parsed.data;
}

export const fixedStageStoragePath = (asset: Pick<FixedStageAsset, "id" | "visibility" | "mimeType">): string =>
  `${asset.visibility.toLowerCase()}/${asset.id}.${({ "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "application/json": "json" } as const)[asset.mimeType]}`;

/** Expiring signatures and editable gift prose do not change reviewed visual geometry. */
export function fixedWorldConfigSha256(config: unknown): string {
  const parsed = GameConfigSchema.parse(config);
  const { gift: _gift, ...visual } = parsed;
  return fixedStageJsonSha256(visual);
}
export function fixedStageJsonSha256(value: unknown): string {
  const normalize = (item: unknown, key?: string): unknown => {
    if (typeof item === "string" && ["url", "avatarUrl", "faceUrl", "base", "thumbnail", "foreground"].includes(key ?? "")) return item.replace(/^(\/api\/assets\/[A-Za-z0-9_-]+)\?[^\s]*$/, "$1");
    if (Array.isArray(item)) return item.map(value => normalize(value));
    // Optional config properties may be explicit undefined after Zod/composition;
    // they are absent in the JSON actually stored. Arrays stay strict.
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined).map(([key, value]) => [key, normalize(value, key)]));
    return item;
  };
  return fixedWorldJsonSha256(normalize(value));
}
