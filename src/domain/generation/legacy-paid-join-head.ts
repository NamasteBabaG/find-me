import { SELF_REPAIR_COMPOSITION_VERSION, SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../scene/local-patch-self-repair";

/** Prospective evidence binding; historical paid questions retain their inputs. */
export const LEGACY_PAID_JOIN_HEAD_VERSION = "legacy-paid-join-head/v1" as const;
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Use the actual composition audit, not a later diagnosis cycle that may
 * already have started after these same candidate pixels were refused. */
export function legacyPaidJoinHeadPlan(receipt: Record<string, unknown>, hide: { id: string; pose: string }, attempts: number) {
  const state = object(receipt.selfRepair), audit = object(receipt.recoveryComposition), crop = object(audit?.crop);
  if (receipt.compositionVersion !== SELF_REPAIR_COMPOSITION_VERSION || receipt.authoredReturn || receipt.authoredRecovery
    || receipt.crownReturn || receipt.propJoinCorrection || receipt.hide !== hide.id || receipt.pose !== hide.pose
    || state?.version !== SELF_REPAIR_VERSION || !["diagnosing", "applying", "awaiting-review", "rejected"].includes(String(state.phase))
    || typeof state.cycle !== "number" || !Number.isSafeInteger(state.cycle) || state.cycle < 1 || !audit
    || !digest(receipt.judgedSha256) || !digest(audit.rawSha256) || !digest(audit.alphaSha256) || !digest(audit.sourceSha256)
    || audit.outsideChangedPixels !== 0 || audit.protectedChangedPixels !== 0 || audit.protectedGuardPx !== 12
    || audit.maximumFeatherWidthPx !== 6 || typeof receipt.compositionSource !== "string" || !crop
    || crop.width !== 512 || crop.height !== 768 || typeof crop.left !== "number" || typeof crop.top !== "number"
    || !Number.isSafeInteger(crop.left) || !Number.isSafeInteger(crop.top) || crop.left < 0 || crop.top < 0) return null;
  const prefix = `${hide.id}:${hide.pose}:`, key = receipt.compositionSource;
  const match = key.startsWith(prefix) && /^(render|self-repair):([1-9][0-9]*)$/.exec(key.slice(prefix.length));
  if (!match || Number(match[2]) > (match[1] === "render" ? attempts : state.cycle)) return null;
  const decision = selfRepairDecisionSchema.safeParse({ cause: "composition-clipping", action: "recompose-retained", sourceKey: key,
    explanation: "Exact immutable composition audit, not a newly invented repair plan.",
    returnWindow: audit.returnWindow, protectedCore: audit.protectedCore, faceRect: audit.faceRect });
  return decision.success ? { sourceRequestKey: key, returned: decision.data.returnWindow, rawSha256: audit.rawSha256,
    crop: { left: crop.left, top: crop.top, width: 512, height: 768 } } : null;
}

/** Scheduling only. The worker authenticates the RAW, candidate and active
 * source-bound completion authority before a fenced update; never an approval. */
export function legacyHeadCorrectionCandidate(row: { status: string; assetId: string | null; attempts: number; judgeJson: string | null } | undefined): boolean {
  if (!row || !row.assetId || !["FAILED", "GENERATED"].includes(row.status)) return false;
  try {
    const j = object(JSON.parse(row.judgeJson ?? "null")), verdict = object(j?.verdict);
    if (!j || j.headSourceVersion !== undefined || object(j.selfRepair)?.phase === "applying" || verdict?.verdict === "pass" || typeof j.hide !== "string" || typeof j.pose !== "string"
      || !legacyPaidJoinHeadPlan(j, { id: j.hide, pose: j.pose }, row.attempts)) return false;
    if (verdict?.verdict !== "fail") return true;
    return Array.isArray(verdict.faults) && verdict.faults.length > 0 && verdict.faults.every(value => {
      const f = object(value); return f?.check === "childComplete" && typeof f.where === "string" && f.where.startsWith("HEAD_RETURN:");
    });
  } catch { return false; }
}
