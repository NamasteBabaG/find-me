import { guidedFrameExhausted, guidedFrameMarker, guidedFrameVersionMatches, type GuidedFrameRow } from "./guided-frame-recovery";
import { selfRepairProgress } from "../scene/local-patch-progress";

export const QA_COMPLETION_RECOVERY = "qa-existing-medium-completion-recovery/v1" as const;

type UnknownTerms = { requestKey: string; operationFingerprint: string; reserveMicroUsd: number };
/** Original reservations cannot disappear or shrink; a newly unknown request
 * must be diagnosed before this existing authority can wake more paid work. */
export function qaCompletionUnknownsPreserved(requests: readonly (UnknownTerms & { state: string })[], original: readonly UnknownTerms[]): boolean {
  const same = (a: UnknownTerms, b: UnknownTerms) => a.requestKey === b.requestKey
    && a.operationFingerprint === b.operationFingerprint && a.reserveMicroUsd === b.reserveMicroUsd;
  return original.every(previous => requests.some(request => same(request, previous)))
    && requests.filter(request => request.state === "unknown").every(request => original.some(previous => same(request, previous)));
}

/** The explicit completion authority may use the existing three diagnosis
 * cycles remaining after a failed guided third. It never resets
 * attempts/cycles, rebuys the third key, or admits a redraw for unreadable QA. */
export function qaCompletionGuidedRepair(row: GuidedFrameRow, sceneVersion: number, authorized: boolean): boolean {
  if (!authorized || !guidedFrameExhausted(row)) return false;
  const marker = guidedFrameMarker(row);
  if (!marker || marker.repairCyclesPreserved >= 3 || !guidedFrameVersionMatches(marker, sceneVersion)) return false;
  try {
    const receipt = JSON.parse(row.judgeJson!), repair = receipt.selfRepair;
    if (receipt.wireFault !== undefined && receipt.wireFault !== null || receipt.qualityDisposition?.state === "unresolved") return false;
    const failedPixels = typeof receipt.renderFault === "string" && receipt.renderFault.startsWith("quality-seam:")
      || receipt.reviewState === "board-review-complete" && receipt.wireFault === null
        && receipt.verdict?.verdict === "fail" && receipt.qualityDisposition?.state === "retry";
    if (!failedPixels) return false;
    if (repair && (repair.version !== "local-patch-self-repair/v1"
      || !["diagnosing", "applying", "awaiting-review", "rejected"].includes(repair.phase)
      || !Number.isSafeInteger(repair.subjectV2Cycles) || repair.subjectV2Cycles < Math.max(1, marker.repairCyclesPreserved) || repair.subjectV2Cycles > 3)) return false;
    if (!repair && marker.repairCyclesPreserved > 0) return false;
    return !selfRepairProgress(repair, row.attempts).exhausted;
  } catch { return false; }
}

/** Typed engine rest only. An unrelated operator hold is never a wake. */
export const qaCompletionEngineRest = (reason: string | null) => !!reason && /^local-patch: (?:\d+ appearances spent their 3 automatic repair cycles under local-patch-subject\/v2|nothing automatic is left for \d+ appearances:)/.test(reason);
