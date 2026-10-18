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
import { DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_VERSION, isDualVisualReviewVersion, type DualVisualReviewVersion } from "./visual-review-release";
import { QUALITY_FAULT_LOCATION_MAX, QUALITY_READER_LOCATED_V2, QUALITY_READER_STRICT, QUALITY_READERS, localPatchQualityDisposition,
  type LocalPatchVerdict, type QualityReader } from "./local-patch-judge";
import { parseVisualSceneVerdicts } from "./visual-review";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import type { SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER, SUBJECT_READER_V2, SubjectCheck, SubjectRepairCodeV2 } from "../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION, readSubjectQualityBundle, type SubjectQualityBundleBinding } from "../../domain/generation/subject-quality-bundle";

/** A later reading of the SAME retained answer: recorded beside the original,
 * never in place of it, and bound to its request, fingerprint and exact text. */
export type ContinuityReReading = {
  readonly version: "continuity-reading/v1"; readonly reader: ContinuityReader; readonly previousReader: ContinuityReader;
  readonly sourceRequestKey: string; readonly sourceFingerprint: string; readonly rawSha256: string;
  readonly disposition: "pass" | "repair" | "unresolved"; readonly reason: string; readonly readAt: string;
};
/** The same, for a retained scene-quality answer. */
export type QualityReReading = {
  readonly version: "quality-reading/v1"; readonly reader: QualityReader; readonly previousReader: QualityReader;
  readonly sourceRequestKey: string; readonly sourceFingerprint: string; readonly rawSha256: string;
  readonly disposition: "acceptable" | "retry" | "unresolved"; readonly readAt: string;
};
/** One paid role's retained answer, as bought. */
export type DualStageBase = { requestKey: string; fingerprint: string; attempt: number;
  policy: VisualReviewPolicy; raw: string | null; model: string | null; finishReason: string | null;
  wireFault: string | null; costMicroUsd: number;
  /** The recovery variant of the question, when it was not the standard one. */
  strategy?: EvidenceStrategy;
  /** Why the answer could not be used: a code and a JSON path, never answer text. */
  readFault?: ContinuityReadFault | null };
/** Each role names the reader that decided it. Absent on stages written before readers were named. */
export type ContinuityStage = DualStageBase & { reader?: ContinuityReader; reading?: ContinuityReReading };
export type QualityStage = DualStageBase & { reader?: QualityReader; reading?: QualityReReading; subjectBundle?: SubjectQualityBundleBinding };
/** An enrolled world's subject review (subject-policy.ts): an Opus HIGH answer about the
 * same pixels against the owned photograph and the canonical face, bound to both and to the plan.
 * A v1 stage is read by subject-read/v1 for good; a v2 stage (local-patch-subject/v2) by v2. */
export type SubjectStage = DualStageBase & { subjectPolicy: typeof SUBJECT_POLICY_VERSION | typeof SUBJECT_POLICY_V2;
  reader: typeof SUBJECT_READER | typeof SUBJECT_READER_V2;
  photoSha256: string; planSha256: string;
  /** Check codes a refusal named, for the next painting's fixed repair line; never answer text. */
  failedChecks?: (SubjectCheck | SubjectRepairCodeV2)[]; combined?: typeof SUBJECT_QUALITY_BUNDLE_VERSION;
  /** v2 only: why the collection refused an appearance that passed its own checks (subjectCollectionRefusal). */
  collectionRefusal?: string };
export type DualReviewStage = ContinuityStage | QualityStage | SubjectStage;
export type DualReviewProof = { version: DualVisualReviewVersion; hideId: string;
  imageSha256: string; geometrySha256: string; identitySha256: string;
  quality: QualityStage; continuity: ContinuityStage | null;
  /** Present only in an enrolled world; absent on every historical proof. */
  subject?: SubjectStage | null };

/** The reader new scene-quality answers are decided by, under either pinned question. */
export const CURRENT_QUALITY_READER: QualityReader = QUALITY_READER_LOCATED_V2;
/** A free re-reading of a refused answer can only help when the current reader reads
 * more of it. v1-located and v2 parse alike, so an answer refused by v1-located is
 * never re-read for nothing; a strict refusal still is. */
export const qualityReaderReadsMore = (current: QualityReader, previous: QualityReader | undefined) =>
  QUALITY_FAULT_LOCATION_MAX[current] > (QUALITY_FAULT_LOCATION_MAX[previous ?? QUALITY_READER_STRICT] ?? Infinity);

/** The reader that decided a quality stage: its re-reading, its own record, or the strict historical one. */
export function qualityStageReader(stage: Pick<QualityStage, "reader" | "reading">): QualityReader | null {
  const reader = stage.reading?.reader ?? stage.reader ?? QUALITY_READER_STRICT;
  return (QUALITY_READERS as readonly string[]).includes(reader) ? reader : null;
}

/** A retained quality answer read exactly as its decision was made, or null. A
 * re-reading must still describe this exact answer and agree with itself. */
export function readQualityStage(stage: QualityStage, hideId: string): LocalPatchVerdict | null {
  const reader = qualityStageReader(stage);
  if (!reader || !visualStageReadable(stage)) return null;
  const verdict = parseVisualSceneVerdicts(qualityStageRaw(stage), [hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE, reader)[hideId] ?? null;
  const reading = stage.reading;
  if (reading && (reading.version !== "quality-reading/v1" || reading.previousReader !== (stage.reader ?? QUALITY_READER_STRICT)
    || reading.reader === reading.previousReader || reading.sourceRequestKey !== stage.requestKey
    || reading.sourceFingerprint !== stage.fingerprint || reading.rawSha256 !== sha256Bytes(Buffer.from(stage.raw ?? ""))
    || reading.disposition !== localPatchQualityDisposition(verdict, 12, { hideId, reader }).state)) return null;
  return verdict;
}

export function qualityStageRaw(stage: Pick<QualityStage, "raw" | "subjectBundle">): string | null {
  if (!stage.subjectBundle) return stage.raw;
  return stage.subjectBundle.version === SUBJECT_QUALITY_BUNDLE_VERSION ? readSubjectQualityBundle(stage.raw)?.quality ?? null : null;
}
export function subjectStageRaw(stage: Pick<SubjectStage, "raw" | "combined">): string | null {
  return stage.combined === undefined ? stage.raw : stage.combined === SUBJECT_QUALITY_BUNDLE_VERSION
    ? readSubjectQualityBundle(stage.raw)?.subject ?? null : null;
}

/** Which readers may decide an answer to each pinned question. The strict
 * reader remains the reading of every historical v1 stage that names none. */
export const CONTINUITY_READERS_FOR: Readonly<Record<DualVisualReviewVersion, readonly ContinuityReader[]>> = Object.freeze({
  [DUAL_VISUAL_REVIEW_VERSION]: [CONTINUITY_READER_STRICT, CONTINUITY_READER_BOUNDED],
  [DUAL_VISUAL_REVIEW_V2]: [CONTINUITY_READER_CROWD],
  // v3 asks v1's continuity question; its stages always name their reader.
  [DUAL_VISUAL_REVIEW_V3]: [CONTINUITY_READER_BOUNDED],
});
/** The reader new answers to each question are decided by. */
export const CURRENT_CONTINUITY_READER: Readonly<Record<DualVisualReviewVersion, ContinuityReader>> = Object.freeze({
  [DUAL_VISUAL_REVIEW_VERSION]: CONTINUITY_READER_BOUNDED,
  [DUAL_VISUAL_REVIEW_V2]: CONTINUITY_READER_CROWD,
  [DUAL_VISUAL_REVIEW_V3]: CONTINUITY_READER_BOUNDED,
});

export function visualStageReadable(stage: Pick<DualReviewStage, "policy" | "model" | "wireFault" | "finishReason">) {
  return !stage.wireFault && stage.model === stage.policy.model
    && stage.finishReason === (stage.policy.provider === "anthropic" ? "end_turn" : "stop");
}

/** The reader that decided a stage: its re-reading, its own record, or the strict historical one. */
export function continuityStageReader(stage: Pick<ContinuityStage, "reader" | "reading">, version: DualVisualReviewVersion): ContinuityReader | null {
  const reader = stage.reading?.reader ?? stage.reader ?? (version === DUAL_VISUAL_REVIEW_VERSION ? CONTINUITY_READER_STRICT : null);
  return reader && CONTINUITY_READERS_FOR[version].includes(reader) ? reader : null;
}

/** Read a retained continuity stage exactly as its decision was made. A
 * re-reading must still describe this exact answer and agree with itself. */
export function readContinuityStage(stage: ContinuityStage, hideId: string, version: DualVisualReviewVersion): ContinuityReading | null {
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
 * A FAILED appearance whose complete, transport-clean answer was decided by a
 * reader its question no longer uses. Such an answer can be decided again for
 * free, once; the re-reading is recorded beside it and never repeated.
 *
 * - Continuity: the anatomy answer was refused by the strict 600-character reader.
 * - Quality alone: the Opus answer itself was refused by the strict reader, so no
 *   anatomy question was ever bought. Only a refusal qualifies (a readable strict
 *   verdict reads the same under every reader), and only when the current reader
 *   does NOT find it acceptable: a re-read pass would still need its anatomy
 *   question, which is never free, so it stays with the paid evidence route.
 */
export function localPatchRetainedAnswerUndecided(row: { status: string; lastError?: string | null; judgeJson?: string | null }): boolean {
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null"), review = receipt?.boardReview, proof = review?.dual as DualReviewProof | undefined;
    if (!proof || row.status !== "FAILED" || !row.lastError?.startsWith("quality-unresolved:") || receipt?.reviewState !== "board-review-complete"
      || !isDualVisualReviewVersion(review?.version) || proof.version !== review.version || !proof.quality
      || proof.imageSha256 !== receipt.judgedSha256) return false;
    if (!proof.continuity) {
      if (receipt.verdict !== null || proof.quality.reading || !visualStageReadable(proof.quality)
        || !qualityReaderReadsMore(CURRENT_QUALITY_READER, proof.quality.reader)) return false;
      const verdict = parseVisualSceneVerdicts(proof.quality.raw, [proof.hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE, CURRENT_QUALITY_READER)[proof.hideId] ?? null;
      return localPatchQualityDisposition(verdict, 12, { hideId: proof.hideId, reader: CURRENT_QUALITY_READER }).state !== "acceptable";
    }
    if (proof.continuity.reading) return false;
    return visualStageReadable(proof.quality) && visualStageReadable(proof.continuity)
      && (proof.continuity.reader ?? CONTINUITY_READER_STRICT) !== CURRENT_CONTINUITY_READER[proof.version];
  } catch { return false; }
}

/** Scheduling hint only. The paid review still verifies all durable evidence,
 * pixels, questions and ownership; this helper never approves or dispatches. */
export function localPatchContinuityPending(row: { status: string; judgeJson?: string | null }): boolean {
  if (row.status !== "GENERATED") return false;
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null"), proof = receipt?.dualQualityCheckpoint as DualReviewProof | undefined;
    if (!proof || receipt.boardReview || !isDualVisualReviewVersion(proof.version) || !proof.quality || proof.continuity
      || proof.hideId !== receipt.hide || proof.imageSha256 !== receipt.judgedSha256 || proof.geometrySha256 !== receipt.geometrySha256) return false;
    const reader = qualityStageReader(proof.quality), verdict = readQualityStage(proof.quality, proof.hideId);
    return reader !== null && localPatchQualityDisposition(verdict, 12, { hideId: proof.hideId, reader }).state === "acceptable";
  } catch { return false; }
}

/**
 * Proof that a stage is the answer that was actually paid for: the world's own
 * settled bill, the retained envelope and the stage agree in every field. Pure
 * read: it never reserves, settles or dispatches, so it can decide a stored
 * answer even when the world has no capacity left for a new one.
 */
export async function verifiedDualStage(db: Prisma.TransactionClient, worldId: string, stage: DualReviewStage,
  role: "scene-quality" | "head-continuity",
  /** An enrolled world's continuity may also be the background question's answer. */
  options: { allowBackground?: boolean } = {}): Promise<{ bytes: Buffer; evidence: WorldChargeEvidence } | null> {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const allowed = [visualReviewPolicy(role, "high"), ...(options.allowBackground && role === "head-continuity"
    ? [visualReviewPolicy(role, "high", undefined, "responses-background")] : [])];
  if (!allowed.some(policy => equal(stage.policy, policy)) || !visualStageReadable(stage)
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
