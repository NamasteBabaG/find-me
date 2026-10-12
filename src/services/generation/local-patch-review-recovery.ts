import {
  LOCAL_PATCH_EVIDENCE_ROUND_CAP, LOCAL_PATCH_EVIDENCE_TRANSPORT_BACKOFF_MS, nextLocalPatchEvidenceStep,
  type EvidenceAttempt, type EvidenceFaultKind, type EvidenceRole, type EvidenceStep, type EvidenceStrategy,
} from "../../domain/scene/local-patch-evidence-policy";

/** A malformed judge answer is missing evidence, not evidence of a bad image. */
export const LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS = LOCAL_PATCH_EVIDENCE_TRANSPORT_BACKOFF_MS;

const ROLES = new Set(["quality", "continuity"]);
const STRATEGIES = new Set(["standard/v1", "strict-json/v1", "compact/v1", "decide/v1"]);
const KINDS = new Set(["transport", "wrong-model", "truncated", "empty", "syntax", "shape", "ids", "length", "count", "oversize", "unsure", "conflict", "unknown"]);
const safeAttempt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n < Number.MAX_SAFE_INTEGER;

/** The kind of a stored wire fault, for receipts written before the log existed. */
export function evidenceKindOfWireFault(wireFault: unknown): EvidenceFaultKind {
  if (wireFault === "timeout" || wireFault === "http" || wireFault === "no-content") return "transport";
  if (wireFault === "wrong-model") return "wrong-model";
  if (wireFault === "truncated") return "truncated";
  if (wireFault === "not-json") return "syntax";
  return "unknown";
}

/**
 * This candidate's failed review rounds, oldest first. The log is per image: a
 * new picture starts its own history, and a record of another image's pixels is
 * never counted against this one. A receipt written before the log carries only
 * its round counter and its latest failure; earlier rounds count as unknown.
 */
export function localPatchEvidenceHistory(receipt: Record<string, unknown> & { boardReview?: Record<string, unknown> | null },
  updatedAt?: Date): EvidenceAttempt[] {
  const image = typeof receipt.judgedSha256 === "string" ? receipt.judgedSha256 : "";
  const logged = Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts.filter((a: Record<string, unknown>) =>
    a && safeAttempt(a.attempt) && ROLES.has(String(a.role)) && KINDS.has(String(a.kind)) && STRATEGIES.has(String(a.strategy))
    && typeof a.at === "string" && a.imageSha256 === image) as EvidenceAttempt[] : [];
  if (logged.length) return logged;
  // Only an undecided review is a failed round; a decided one starts no history.
  const review = receipt.boardReview;
  if (!review || !(receipt.wireFault || receipt.verdict === null)) return [];
  const rounds = review.evidenceReviewAttempt ?? 1;
  if (!safeAttempt(rounds)) return [];
  const at = typeof review.evidenceReviewedAt === "string" ? review.evidenceReviewedAt : (updatedAt ?? new Date(0)).toISOString();
  const dual = review.dual as { continuity?: { wireFault?: unknown } | null } | undefined;
  const role: EvidenceRole = dual?.continuity ? "continuity" : "quality";
  const latest = evidenceKindOfWireFault(dual?.continuity ? dual.continuity.wireFault : receipt.wireFault);
  return Array.from({ length: rounds }, (_, index) => ({ attempt: index + 1, role, kind: index === rounds - 1 ? latest : "unknown",
    code: null, path: null, strategy: "standard/v1" as const, at, imageSha256: image }));
}

export type LocalPatchEvidenceRecovery = {
  attempt: number; nextAttempt: number; retry: boolean; waiting: boolean; exhausted: boolean; retryAt: number;
  role: EvidenceRole | null; strategy: EvidenceStrategy | null; step: EvidenceStep | null;
};

/**
 * Evidence recovery for one FAILED appearance whose review could not be used.
 * `retry`: a new question may be asked now, with `strategy`. `waiting`: a
 * transport outage is being waited out. `exhausted`: no automatic question is
 * left for this image; it is never repainted for that reason alone.
 */
export function localPatchEvidenceRecovery(row: { status: string; lastError?: string | null; judgeJson?: string | null; updatedAt?: Date }, now = Date.now()): LocalPatchEvidenceRecovery | null {
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null");
    if (row.status !== "FAILED" || !row.lastError?.startsWith("quality-unresolved:")
      || receipt?.reviewState !== "board-review-complete" || !receipt.boardReview
      || !(receipt.wireFault || receipt.verdict === null)) return null;
    const stored = receipt.boardReview.evidenceReviewAttempt ?? 1;
    const history = safeAttempt(stored) ? localPatchEvidenceHistory(receipt, row.updatedAt) : [];
    // A corrupt counter never authorizes a dispatch; it is not a fresh start either.
    if (!history.length) return { attempt: LOCAL_PATCH_EVIDENCE_ROUND_CAP, nextAttempt: LOCAL_PATCH_EVIDENCE_ROUND_CAP + 1,
      retry: false, waiting: false, exhausted: true, retryAt: Infinity, role: null, strategy: null, step: null };
    const step = nextLocalPatchEvidenceStep(history, now);
    const attempt = Math.max(...history.map(h => h.attempt));
    if (!step || step.action === "exhausted" || step.action === "repair") return { attempt, nextAttempt: attempt + 1, retry: false, waiting: false,
      exhausted: true, retryAt: Infinity, role: history.at(-1)!.role, strategy: null, step };
    return { attempt, nextAttempt: step.attempt, retry: step.action === "ask", waiting: step.action === "wait", exhausted: false,
      retryAt: step.action === "wait" ? step.retryAt : now, role: step.role, strategy: step.strategy, step };
  } catch { return null; }
}
