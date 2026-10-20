/**
 * local-patch-lean-review-recovery/v1 (20 October 2026). Pure: no HTTP or DB.
 *
 * A lean world (local-patch-lean/v1) whose Sol answers the provider itself ended `failed` used to continue each one under
 * the world's fixed continuation quota (two under v1, four more under v2) and to ask the same pixels again on Flex every
 * time. On the second lean QA world seven such answers (19 sent, 12 answered) spent the quota and parked the world for a
 * person with $2.20 of its $4.00 still free. This release changes the strategy, not only the count:
 *
 *  1. Each failure keeps what the provider said about it (background-provider-error/v1) and is classified. A failure of
 *     the request itself, a flagged image or the account (quota, billing, credentials) is never asked again automatically.
 *  2. Once the provider has ended a question about one image's pixels `failed`, every later question about the same
 *     pixels is asked at the default tier: a separate request key and a separate policy version
 *     (`...-background-default/lean-v1`), with the failed question's charge still held in full.
 *  3. An answer already received about exactly these pixels is replayed, never bought again: a question is carried over
 *     only when it can be rebuilt byte for byte from its own round record and its answer passes.
 *  4. A further continuation is recorded under `world-automatic-review-recovery/v3`, at most
 *     `WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT` per world; a role's second default-tier failure about one image's pixels
 *     (`LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE`) is not continued. Every unknown charge stays counted in full
 *     under the world's four dollars, and every new question still reserves before it is sent.
 *
 * It applies only to a world that carries its pin (`leanReviewRecoveryAuditId`). A new lean draft receives it when it is
 * created. An existing world receives it only from a person, bound to the exact hold, held requests and ledger the person
 * read (`existing-world`): never a blanket grant, and no earlier approval is read differently.
 */
import { BACKGROUND_PROVIDER_ERROR_VERSION, backgroundFailureKind, providerErrorCode, recoverableFailureKind, type BackgroundFailureKind } from "./background-provider-error";
import { WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT } from "./world-budget";

export const LEAN_REVIEW_RECOVERY = "local-patch-lean-review-recovery/v1" as const;
export const LEAN_REVIEW_RECOVERY_ACTION = "generation:lean-review-recovery";
export const REVIEW_INTERRUPTION_POLICY_V3 = "local-patch-review-interruption/v3" as const;
/** A role's default-tier questions about one image's pixels the provider has ended `failed` at which they stop being continued. */
export const LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE = 2;
export const leanReviewRecoveryAuditId = (gameId: string) => `aud_lean_review_recovery_${gameId}`;

/** What the pin decides: the same terms for every world that carries it. */
export const LEAN_REVIEW_RECOVERY_TERMS = Object.freeze({
  providerErrors: BACKGROUND_PROVIDER_ERROR_VERSION,
  tierSwitch: "flex-to-default-after-provider-failure-on-the-same-pixels/v1",
  carryOver: "answered-question-replayed-by-exact-fingerprint/v1",
  reviewRecovery: "world-automatic-review-recovery/v3",
  policyId: REVIEW_INTERRUPTION_POLICY_V3,
  worldLimit: WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT,
  defaultTierFailuresPerImage: LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE,
  neverAskedAgain: ["request-invalid", "content-policy", "account"],
} as const);

/** What a person read when they released an existing world: the hold, the held requests and the ledger, exactly. */
export type LeanReviewRecoveryBinding = {
  readonly worldId: string; readonly jobId: string;
  /** parkedHoldSha256 of the job as read: its id, the moment its reason was written, and the reason. */
  readonly holdSha256: string;
  /** The unknown requests no earlier record continued, sorted. */
  readonly heldRequestKeys: readonly string[];
  /** The ledger as read: its audit and its continuation counts. */
  readonly ledgerSha256: string;
};
export type LeanReviewRecoveryReceipt =
  | { readonly version: typeof LEAN_REVIEW_RECOVERY; readonly gameId: string; readonly terms: typeof LEAN_REVIEW_RECOVERY_TERMS; readonly mode: "new-world" }
  | { readonly version: typeof LEAN_REVIEW_RECOVERY; readonly gameId: string; readonly terms: typeof LEAN_REVIEW_RECOVERY_TERMS; readonly mode: "existing-world";
    readonly binding: LeanReviewRecoveryBinding; readonly operatorId: string; readonly planSha256: string; readonly authorizedAt: string };

/** The exact pin a new lean draft carries. */
export const leanNewWorldRecoveryReceipt = (gameId: string): LeanReviewRecoveryReceipt =>
  ({ version: LEAN_REVIEW_RECOVERY, gameId, terms: LEAN_REVIEW_RECOVERY_TERMS, mode: "new-world" });

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_:.@/-]{1,200}$/;
const HELD_KEY = /^self-repair:board:[a-z0-9-]+:[a-f0-9]{64}$/;
const exactKeys = (value: object, keys: readonly string[]) =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

/**
 * The receipt a pin row carries, or null when it is not exactly one: a new world's byte for byte, or an existing world's
 * with every binding field bounded and well formed. Never the nearest reading of something else.
 */
export function parseLeanReviewRecoveryReceipt(value: unknown, gameId: string): LeanReviewRecoveryReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.mode === "new-world") return JSON.stringify(record) === JSON.stringify(leanNewWorldRecoveryReceipt(gameId)) ? leanNewWorldRecoveryReceipt(gameId) : null;
  if (record.mode !== "existing-world" || record.version !== LEAN_REVIEW_RECOVERY || record.gameId !== gameId
    || JSON.stringify(record.terms) !== JSON.stringify(LEAN_REVIEW_RECOVERY_TERMS)
    || !exactKeys(record, ["version", "gameId", "terms", "mode", "binding", "operatorId", "planSha256", "authorizedAt"])) return null;
  const binding = record.binding as Record<string, unknown> | null;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)
    || !exactKeys(binding, ["worldId", "jobId", "holdSha256", "heldRequestKeys", "ledgerSha256"])
    || binding.worldId !== `${gameId}:board-wizard` || binding.jobId !== `job_${gameId}`
    || typeof binding.holdSha256 !== "string" || !SHA.test(binding.holdSha256)
    || typeof binding.ledgerSha256 !== "string" || !SHA.test(binding.ledgerSha256)
    || !Array.isArray(binding.heldRequestKeys) || !binding.heldRequestKeys.length || binding.heldRequestKeys.length > 32
    || binding.heldRequestKeys.some(key => typeof key !== "string" || !HELD_KEY.test(key))
    || JSON.stringify([...binding.heldRequestKeys].sort()) !== JSON.stringify(binding.heldRequestKeys)
    || new Set(binding.heldRequestKeys).size !== binding.heldRequestKeys.length) return null;
  if (typeof record.operatorId !== "string" || !ID.test(record.operatorId) || record.operatorId.includes("://") || /^sk-/i.test(record.operatorId)
    || typeof record.planSha256 !== "string" || !SHA.test(record.planSha256)
    || typeof record.authorizedAt !== "string" || !Number.isFinite(Date.parse(record.authorizedAt))
    || new Date(record.authorizedAt).toISOString() !== record.authorizedAt) return null;
  return structuredClone(record) as LeanReviewRecoveryReceipt;
}

export type LeanFailureAdmission =
  | { readonly admit: true; readonly kind: BackgroundFailureKind }
  | { readonly admit: false; readonly kind: BackgroundFailureKind; readonly reason: string };

/**
 * The provider's own statement that a question can never succeed (its request refused, an image flagged, the account),
 * read from the code a round recorded, whatever the round's charge; null for any other code or none. In every world:
 * a code is recorded only from background-provider-error/v1 on, so no earlier round reads differently.
 */
export function permanentProviderFailure(errorCode: string | null | undefined): { readonly kind: BackgroundFailureKind; readonly code: string } | null {
  const code = providerErrorCode(errorCode);
  const kind = backgroundFailureKind(code === null ? null : { code, message: null });
  return code !== null && !recoverableFailureKind(kind) ? { kind, code } : null;
}
/** The words every refusal of a permanent failure uses, wherever it is read. */
export const permanentFailureReason = (providerStatus: string, failure: { readonly kind: BackgroundFailureKind; readonly code: string }) =>
  `the provider ended it ${providerStatus} (${failure.kind}: ${failure.code}); a ${failure.kind} failure is never asked again automatically`;

/**
 * Whether one answer the provider ended `failed` may be continued automatically, and if not, exactly why. `errorCode` is
 * the code its round recorded (none before background-provider-error/v1: unclassified). `defaultTierFailures` counts the
 * default-tier questions of the same role about the same pixels the provider ended `failed`, this one included.
 */
export function leanFailureAdmission(input: { readonly errorCode: string | null | undefined; readonly defaultTierFailures: number }): LeanFailureAdmission {
  const permanent = permanentProviderFailure(input.errorCode);
  if (permanent) return { admit: false, kind: permanent.kind, reason: permanentFailureReason("failed", permanent) };
  const code = providerErrorCode(input.errorCode);
  const kind = backgroundFailureKind(code === null ? null : { code, message: null });
  if (!Number.isSafeInteger(input.defaultTierFailures) || input.defaultTierFailures < 0)
    return { admit: false, kind, reason: "its image's failure count cannot be read" };
  if (input.defaultTierFailures >= LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE)
    return { admit: false, kind, reason: `the provider ended ${input.defaultTierFailures} default-tier questions of this role about these pixels failed;`
      + " this question is not asked again automatically" };
  return { admit: true, kind };
}
