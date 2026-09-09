/** Separate LOW continuation authorization; never broadens the frozen MEDIUM/LOW pair. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { LOW_PAIR_ID, validateLowPairRequest } from "./fixed-quality-policy";

export const LOW_CONTINUATION_ID = "fixed-low-continuation-20260908";
/** Use a NEW ledger directory/fingerprint, never relabel either historical ledger. */
export const LOW_CONTINUATION_ROOT = "work/fixed-sprite-pilot-20260908/quality-low-continuation-v1";
export const LOW_CONTINUATION_POLICY = Object.freeze({
  id: LOW_CONTINUATION_ID, limitCents: 200, imageModel: "gpt-image-2", imageQuality: "low",
  judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true,
} as const);

/**
 * Second authorization, 9 September 2026: Guy raised the pilot ceiling to 300
 * cents so the remaining operational boards have reservation headroom. Nothing
 * about the guards changes - same model, same LOW quality, same strong reviewer,
 * still no automatic retries - and the v1 ledger above is never relabelled or
 * reopened. A raised ceiling is not spent money: reservations that go unused are
 * released, and both ledgers must be reported together as the real total.
 */
/**
 * Guy raised "the pilot ledger ceiling" from 200 to 300, which is a CUMULATIVE
 * ceiling, not a second allowance stacked on the first. A fresh v2 ledger is
 * only a bookkeeping split, so the spend already recorded in v1 counts against
 * the same 300 and callers must enforce the sum. Reported remaining is
 * 300 minus (v1 + v2), never 300 minus v2.
 */
export const LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS = 300;
export const LOW_CONTINUATION_PRIOR_LEDGERS = [
  "work/fixed-sprite-pilot-20260908/quality-low-continuation-v1/budget/requests.json",
] as const;

export const LOW_CONTINUATION_ID_V2 = "fixed-low-continuation-20260909-v2";
export const LOW_CONTINUATION_ROOT_V2 = "work/fixed-sprite-pilot-20260908/quality-low-continuation-v2";
export const LOW_CONTINUATION_POLICY_V2 = Object.freeze({
  id: LOW_CONTINUATION_ID_V2, limitCents: 300, imageModel: "gpt-image-2", imageQuality: "low",
  judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true,
} as const);

export interface LowContinuationFiles { prompt: Buffer; style: Buffer; identity: Buffer }
export interface LowContinuationSourceValidation {
  version: "low-continuation-source/v1";
  continuationPolicyId: typeof LOW_CONTINUATION_ID;
  continuationPolicySha256: string;
  sourceOrigin: "new-low-continuation" | "historical-low-pair";
  sourcePolicyId: typeof LOW_CONTINUATION_ID | typeof LOW_PAIR_ID;
  /** Hash of the supplied JSON object serialization, NOT a claim about original request-file bytes. */
  sourceRequestObjectSha256: string;
  inputs: { promptSha256: string; styleSha256: string; identitySha256: string };
  /** Historical proof is retained as provenance only, never rewritten to point at the new slot. */
  originalPairProvenance?: Record<string, unknown>;
  matchedComparison: false;
  placementApprovalTransferred: false;
  requiresNewPlacementEvidence: true;
  automaticRelease: false;
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const capture = z.object({ file: z.string(), sha256: digest, bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const sourceRequestSchema = z.object({
  version: z.literal(1), promptSha256: digest,
  inputs: z.tuple([capture.extend({ file: z.literal("style.png") }), capture.extend({ file: z.literal("identity.png") })]),
  policy: z.record(z.unknown()), settings: z.record(z.unknown()),
}).passthrough(); // Existing createdAt/commit/sourceFiles recording remains the harness's responsibility.
const commonPolicy = { imageModel: z.literal("gpt-image-2"), imageQuality: z.literal("low"),
  judgeModel: z.literal("gpt-5.6-sol"), judgeEffort: z.literal("high"), noAutomaticRetries: z.literal(true) };
const policySchema = z.union([
  z.object({ id: z.literal(LOW_CONTINUATION_ID), limitCents: z.literal(200), ...commonPolicy }).strict(),
  z.object({ id: z.literal(LOW_CONTINUATION_ID_V2), limitCents: z.literal(300), ...commonPolicy }).strict(),
]);
const settingsSchema = z.object({
  kind: z.literal("image"), modelRequested: z.literal("gpt-image-2"), quality: z.literal("low"), size: z.literal("1024x1024"),
  background: z.literal("transparent"), inputOrder: z.tuple([z.literal("style"), z.literal("identity")]), timeoutMs: z.literal(240000),
}).strict();
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`LOW_CONTINUATION: ${message}`); }

/** Exact fingerprint for the caller's separate durable 200-cent ledger. No I/O. */
export function validateLowContinuationPolicy(policy: unknown): typeof LOW_CONTINUATION_POLICY | typeof LOW_CONTINUATION_POLICY_V2 {
  const parsed = policySchema.safeParse(policy);
  demand(parsed.success, "unapproved continuation policy (requires an approved LOW ledger policy, SolHIGH and no retries)");
  return parsed.data!.id === LOW_CONTINUATION_ID_V2 ? LOW_CONTINUATION_POLICY_V2 : LOW_CONTINUATION_POLICY;
}

/**
 * Validate a source for the explicitly selected CONTINUATION context, not a
 * quality comparison. New images bind the exact supported request and captured
 * prompt/style/identity bytes. Historical paired LOW requests invoke the old
 * strict validator unchanged (including its immutable MEDIUM sponsor replay).
 * They are reusable source material, not approval of a new slot or a new pair.
 *
 * This function does not spend, inspect credentials, fetch URLs, mutate files,
 * choose slots, or declare an image/placement approved. Historical-pair replay
 * only reads local evidence. The caller must additionally:
 * - use LOW_CONTINUATION_ROOT + LOW_CONTINUATION_POLICY under its existing paid
 *   lock and durable GenerationBudget; reserve every image/observer/judge call;
 * - retain original request bytes/hash, single-attempt result/usage/known cost,
 *   output bytes/hash/dimensions and the source-only observation;
 * - bind the NEW frozen slot, board, mask and transform in placement evidence,
 *   with this continuation context separate from original paired proof;
 * - obtain that placement's own geometry/semantic review. Old paired approval
 *   never transfers and a changed slot must not be presented as a matched pair.
 *
 * The200c continuation allowance is not a waiver of any enclosing world or
 * aggregate budget. Accounting and the no-retry/unknown-charge stop stay in the
 * existing harness; this pure policy is not itself an atomic spending lock.
 */
export async function validateLowContinuationRequest(request: unknown, files: LowContinuationFiles): Promise<LowContinuationSourceValidation> {
  const parsed = sourceRequestSchema.safeParse(request);
  demand(parsed.success, "source request is malformed or lacks the exact prompt/reference capture list");
  const source = parsed.data;
  demand(source.policy.id === LOW_CONTINUATION_ID || source.policy.id === LOW_PAIR_ID, "source policy is neither approved continuation nor historical paired LOW");
  demand(Buffer.isBuffer(files.prompt) && files.prompt.length > 0 && files.prompt.toString("utf8").trim().length > 0
    && Buffer.isBuffer(files.style) && files.style.length > 0 && Buffer.isBuffer(files.identity) && files.identity.length > 0,
  "nonempty captured prompt, style and identity bytes are required");
  const inputs = { promptSha256: sha(files.prompt), styleSha256: sha(files.style), identitySha256: sha(files.identity) };
  demand(source.promptSha256 === inputs.promptSha256
    && source.inputs[0].sha256 === inputs.styleSha256 && source.inputs[0].bytes === files.style.length
    && source.inputs[1].sha256 === inputs.identitySha256 && source.inputs[1].bytes === files.identity.length,
  "source request does not bind the exact captured prompt/style/identity bytes");

  let originalPairProvenance: Record<string, unknown> | undefined;
  if (source.policy.id === LOW_PAIR_ID) {
    // Do not substitute a permissive test seam or rewrite the request/proof to
    // the continuation policy. An invalid historical pair still fails closed.
    const baseline = await validateLowPairRequest(source, files);
    originalPairProvenance = structuredClone(baseline.proof);
  } else {
    validateLowContinuationPolicy(source.policy);
    demand(settingsSchema.safeParse(source.settings).success, "new LOW settings changed or include an undeclared parameter/paired proof");
  }
  return {
    version: "low-continuation-source/v1", continuationPolicyId: LOW_CONTINUATION_ID,
    continuationPolicySha256: sha(JSON.stringify(LOW_CONTINUATION_POLICY)),
    sourceOrigin: originalPairProvenance ? "historical-low-pair" : "new-low-continuation",
    sourcePolicyId: source.policy.id as LowContinuationSourceValidation["sourcePolicyId"],
    sourceRequestObjectSha256: sha(JSON.stringify(request)), inputs,
    ...(originalPairProvenance ? { originalPairProvenance } : {}),
    matchedComparison: false, placementApprovalTransferred: false, requiresNewPlacementEvidence: true, automaticRelease: false,
  };
}
