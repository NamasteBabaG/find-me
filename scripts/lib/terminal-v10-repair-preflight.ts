import { createHash } from "node:crypto";
import { z } from "zod";

/** OFFLINE ONLY: freezes the incident's original outcome inventory. This grants
 * no spend, mutation, retry or publication authority. No runtime imports. */
const boards = ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"];
const selected = ["antarctica/hide-3/A", "giza/hide-2/A"];
const composition = "bounded-return/v3-head-safe-axis";
const rowSchema = z.object({
  board: z.enum(boards as [string, ...string[]]), sceneVersion: z.literal(10),
  targetId: z.enum(["hide-1", "hide-2", "hide-3"]), variant: z.literal("A"),
  status: z.enum(["GENERATED", "FAILED"]), assetId: z.string().min(1).nullable(),
  rectJson: z.string().nullable(), judgeJson: z.string(), rejectedAssetIdsJson: z.string().nullable(),
  mimeType: z.literal("image/png").nullable(), width: z.literal(512).nullable(), height: z.literal(768).nullable(),
}).passthrough();
type Row = z.infer<typeof rowSchema>;
const key = (row: Row) => `${row.board}/${row.targetId}/${row.variant}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function demand(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`TERMINAL_V10_PREFLIGHT: ${reason}`);
}
// Retain every exported field, including unknown ones and exact judge/geometry
// strings. Never silently drop evidence while calculating preservation hashes.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(k => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inspectTerminalV10RepairSnapshot(raw: string, expectedSha256: string) {
  demand(/^[a-f0-9]{64}$/.test(expectedSha256) && hash(raw) === expectedSha256, "snapshot bytes changed");
  const rows = z.array(rowSchema).length(27).parse(JSON.parse(raw));
  demand(new Set(rows.map(key)).size === 27, "duplicate outcome");
  const failed = rows.filter(r => r.status === "FAILED").map(key).sort();
  demand(JSON.stringify(failed) === JSON.stringify(selected), "repair scope differs from the two failed hides");
  for (const row of rows) {
    // A seam-rejected attempt may have retained images but NO selected shipping
    // asset/geometry. Do not invent these from another attempt or accept a
    // GENERATED row with the same missing evidence.
    if (row.assetId === null) {
      demand(row.status === "FAILED" && row.rectJson === null && row.mimeType === null
        && row.width === null && row.height === null, "incomplete selected-asset metadata");
    } else {
      demand(row.rectJson !== null && row.mimeType === "image/png" && row.width === 512 && row.height === 768,
        "incomplete selected-asset metadata");
      const rect = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
      w: z.number().finite().positive(), h: z.number().finite().positive() }).strict().parse(JSON.parse(row.rectJson));
      demand(rect.x + rect.w <= 1 && rect.y + rect.h <= 1
        && Math.abs(rect.w * 3840 - 512) < 1e-6 && Math.abs(rect.h * 2160 - 768) < 1e-6,
      "shipping geometry changed");
    }
    const judge = z.object({ compositionVersion: z.literal(composition), hide: z.string() }).passthrough().parse(JSON.parse(row.judgeJson));
    demand(judge.hide === `${row.board}-v10-${row.targetId.slice(-1)}`, "judge belongs to another hide");
    const rejected = z.array(z.string().min(1)).parse(row.rejectedAssetIdsJson === null ? [] : JSON.parse(row.rejectedAssetIdsJson));
    if (row.status === "FAILED") {
      demand(rejected.length === 3 && new Set(rejected).size === 3 && (row.assetId === null || rejected[2] === row.assetId),
        "failed outcome must retain three distinct attempts, and selected asset must be last if present");
    }
  }
  const preserved = rows.filter(r => r.status === "GENERATED").sort((a, b) => key(a).localeCompare(key(b)))
    .map(row => ({ key: key(row), rowSha256: hash(canonical(row)) }));
  return {
    version: "terminal-v10-repair-inventory/v1" as const,
    snapshotSha256: expectedSha256,
    preserved,
    preservedSha256: hash(canonical(preserved)),
    selected: [...selected],
    canExecute: false as const,
    liveStateVerified: false as const,
    visualAcceptance: "not-assessed" as const,
    // The gallery export does NOT prove these. Fail closed; do not invent them.
    requiredBeforePurchase: ["explicit-bounded-authorization", "fresh-locked-game-owner-job-snapshot",
      "settled-ledger-and-retained-receipt-pins", "identity-art-recipe-and-request-fingerprints",
      "approved-target-and-protected-scene-geometry", "idempotent-staging-without-publication"],
  };
}

/** Compare the same original export shape before any future repair publish.
 * This intentionally allows no changes to an unselected outcome, even reviews. */
export function assertPreservedV10Outcomes(plan: ReturnType<typeof inspectTerminalV10RepairSnapshot>, nextRaw: string) {
  const rows = z.array(rowSchema).length(27).parse(JSON.parse(nextRaw));
  demand(new Set(rows.map(key)).size === 27, "duplicate outcome");
  demand(plan.selected.every(selectedKey => rows.some(row => key(row) === selectedKey)), "selected outcome disappeared");
  for (const pin of plan.preserved) {
    const row = rows.find(item => key(item) === pin.key);
    demand(row && hash(canonical(row)) === pin.rowSha256, "an unselected outcome changed");
  }
  // This is only a preservation assertion, NEVER acceptance of either replacement.
}
