import type { Prisma } from "@prisma/client";
import type { VisualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";
import {
  CONTINUITY_READER_BOUNDED, CONTINUITY_READER_CROWD, CONTINUITY_READER_STRICT, localPatchRuntimeContinuityVerdict,
  readLocalPatchBodyContinuity, type ContinuityReader, type ContinuityReadFault, type ContinuityReading,
} from "../../domain/scene/local-patch-body-continuity";
import type { EvidenceStrategy } from "../../domain/scene/local-patch-evidence-policy";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sha256Bytes } from "./fixed-sprite";
import { sameChargeEvidence, type WorldChargeEvidence } from "./world-budget";
import { DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_VERSION, isDualVisualReviewVersion, type DualVisualReviewVersion } from "./visual-review-release";

/** A later reading of the SAME retained answer: recorded beside the original,
 * never in place of it, and bound to its request, fingerprint and exact text. */
export type ContinuityReReading = {
  readonly version: "continuity-reading/v1"; readonly reader: ContinuityReader; readonly previousReader: ContinuityReader;
  readonly sourceRequestKey: string; readonly sourceFingerprint: string; readonly rawSha256: string;
  readonly disposition: "pass" | "repair" | "unresolved"; readonly reason: string; readonly readAt: string;
};
export type DualReviewStage = { requestKey: string; fingerprint: string; attempt: number;
  policy: VisualReviewPolicy; raw: string | null; model: string | null; finishReason: string | null;
  wireFault: string | null; costMicroUsd: number;
  /** The reader that decided this answer. Absent on stages written before readers were named. */
  reader?: ContinuityReader;
  /** The recovery variant of the question, when it was not the standard one. */
  strategy?: EvidenceStrategy;
  /** Why the answer could not be used: a code and a JSON path, never answer text. */
  readFault?: ContinuityReadFault | null;
  reading?: ContinuityReReading };
export type DualReviewProof = { version: DualVisualReviewVersion; hideId: string;
  imageSha256: string; geometrySha256: string; identitySha256: string;
  quality: DualReviewStage; continuity: DualReviewStage | null };

/** Which readers may decide an answer to each pinned question. The strict
 * reader remains the reading of every historical v1 stage that names none. */
export const CONTINUITY_READERS_FOR: Readonly<Record<DualVisualReviewVersion, readonly ContinuityReader[]>> = Object.freeze({
  [DUAL_VISUAL_REVIEW_VERSION]: [CONTINUITY_READER_STRICT, CONTINUITY_READER_BOUNDED],
  [DUAL_VISUAL_REVIEW_V2]: [CONTINUITY_READER_CROWD],
});
/** The reader new answers to each question are decided by. */
export const CURRENT_CONTINUITY_READER: Readonly<Record<DualVisualReviewVersion, ContinuityReader>> = Object.freeze({
  [DUAL_VISUAL_REVIEW_VERSION]: CONTINUITY_READER_BOUNDED,
  [DUAL_VISUAL_REVIEW_V2]: CONTINUITY_READER_CROWD,
});

export function visualStageReadable(stage: Pick<DualReviewStage, "policy" | "model" | "wireFault" | "finishReason">) {
  return !stage.wireFault && stage.model === stage.policy.model
    && stage.finishReason === (stage.policy.provider === "anthropic" ? "end_turn" : "stop");
}

/** The reader that decided a stage: its re-reading, its own record, or the strict historical one. */
export function continuityStageReader(stage: Pick<DualReviewStage, "reader" | "reading">, version: DualVisualReviewVersion): ContinuityReader | null {
  const reader = stage.reading?.reader ?? stage.reader ?? (version === DUAL_VISUAL_REVIEW_VERSION ? CONTINUITY_READER_STRICT : null);
  return reader && CONTINUITY_READERS_FOR[version].includes(reader) ? reader : null;
}

/** Read a retained continuity stage exactly as its decision was made. A
 * re-reading must still describe this exact answer and agree with itself. */
export function readContinuityStage(stage: DualReviewStage, hideId: string, version: DualVisualReviewVersion): ContinuityReading | null {
  const reader = continuityStageReader(stage, version);
  if (!reader || !visualStageReadable(stage)) return null;
  const read = readLocalPatchBodyContinuity(stage.raw, [`${hideId}:people`], reader);
  const reading = stage.reading;
  if (reading) {
    const verdict = localPatchRuntimeContinuityVerdict(read);
    if (reading.version !== "continuity-reading/v1" || reading.previousReader !== (stage.reader ?? CONTINUITY_READER_STRICT)
      || reading.reader === reading.previousReader || reading.sourceRequestKey !== stage.requestKey
      || reading.sourceFingerprint !== stage.fingerprint || reading.rawSha256 !== sha256Bytes(Buffer.from(stage.raw ?? ""))
      || reading.disposition !== verdict.disposition || reading.reason !== verdict.reason) return null;
  }
  return read;
}

/**
 * A FAILED appearance whose complete, transport-clean continuity answer was
 * decided by a reader its question no longer uses (in practice: the strict
 * 600-character reader). Such an answer can be decided again for free, once;
 * the re-reading is recorded beside it and never repeated.
 */
export function localPatchRetainedAnswerUndecided(row: { status: string; lastError?: string | null; judgeJson?: string | null }): boolean {
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null"), review = receipt?.boardReview, proof = review?.dual as DualReviewProof | undefined;
    if (!proof || row.status !== "FAILED" || !row.lastError?.startsWith("quality-unresolved:") || receipt?.reviewState !== "board-review-complete"
      || !isDualVisualReviewVersion(review?.version) || proof.version !== review.version || !proof.quality || !proof.continuity
      || proof.imageSha256 !== receipt.judgedSha256 || proof.continuity.reading) return false;
    return visualStageReadable(proof.quality) && visualStageReadable(proof.continuity)
      && (proof.continuity.reader ?? CONTINUITY_READER_STRICT) !== CURRENT_CONTINUITY_READER[proof.version];
  } catch { return false; }
}

/**
 * Proof that a stage is the answer that was actually paid for: the world's own
 * settled bill, the retained envelope and the stage agree in every field. Pure
 * read: it never reserves, settles or dispatches, so it can decide a stored
 * answer even when the world has no capacity left for a new one.
 */
export async function verifiedDualStage(db: Prisma.TransactionClient, worldId: string, stage: DualReviewStage,
  role: "scene-quality" | "head-continuity"): Promise<{ bytes: Buffer; evidence: WorldChargeEvidence } | null> {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!equal(stage.policy, visualReviewPolicy(role, "high")) || !visualStageReadable(stage)
    || !Number.isSafeInteger(stage.attempt) || stage.attempt < 1
    || !/^self-repair:board:[a-z]+:[a-f0-9]{64}$/.test(stage.requestKey)
    || !stage.requestKey.endsWith(`:${stage.fingerprint}`)) return null;
  const ledger = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(db).read(worldId);
  if (!ledger) return null;
  const bill = ledger.snapshot.requests.find(r => r.requestKey === stage.requestKey);
  const retained = await new PrismaRetainedPurchaseStore(db).get(worldId, stage.requestKey);
  if (!bill || !["settled", "linked"].includes(bill.state) || !("evidence" in bill) || bill.scope !== "judge"
    || bill.operationFingerprint !== stage.fingerprint || bill.evidence.model !== stage.policy.model
    || bill.evidence.providerNamespace !== `${stage.policy.provider}:find-me-existing`
    || !retained?.evidence || retained.operationFingerprint !== stage.fingerprint
    || !sameChargeEvidence(retained.evidence, bill.evidence) || stage.costMicroUsd !== bill.evidence.amountMicroUsd) return null;
  let wire: DualReviewStage & { costUnknown?: boolean };
  try { wire = JSON.parse(retained.bytes.toString()); } catch { return null; }
  if (wire.costUnknown !== false || wire.fingerprint !== stage.fingerprint || !equal(wire.policy, stage.policy)
    || wire.raw !== stage.raw || wire.model !== stage.model || wire.wireFault !== stage.wireFault
    || wire.finishReason !== stage.finishReason) return null;
  return { bytes: retained.bytes, evidence: retained.evidence };
}
