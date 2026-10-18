import sharp from "sharp";
import type { Container } from "../container";
import {
  SUBJECT_CHECKS, SUBJECT_POLICY_VERSION, SUBJECT_REPAIR_ROUTE, subjectRenderDirection, subjectReviewLabels, subjectReviewPrompt, subjectWardrobe,
  type SubjectCheck, type SubjectPlan, type SubjectReading,
} from "../../domain/generation/subject-policy";
import type { prepareLocalPatchBoardReview } from "./local-patch-board-review";
import { parseLocalPatchVerdict, type LocalPatchBoardJudgeResult, type QualityReader } from "./local-patch-judge";
import { prepareVisualReview, visualReviewMaxCharge, type PreparedVisualReview } from "./visual-review";
import { DUAL_REVIEW_V3_RESERVE_MICRO_USD } from "../../domain/generation/dual-review-reserve";
import { sha256Bytes } from "./fixed-sprite";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf, type SubjectUpgradeReceipt } from "./subject-enrollment";
import { LOCAL_PATCH_IMAGE_POLICY, LOCAL_PATCH_LOW_IMAGE_POLICY, localPatchRenderPolicySha256 } from "../../infra/generation/openai-local-patch";
import type { LocalPatchAttemptInput } from "./local-patch-render";
import { SUBJECT_QUALITY_BUNDLE_VERSION, type SubjectQualityBundleBinding } from "../../domain/generation/subject-quality-bundle";

type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;

/** The owned photograph an enrolled review needs is not available: no acceptance and no fallback. */
export class SubjectEvidenceUnavailable extends Error {
  constructor(reason: string) { super(`SUBJECT_REVIEW: ${reason}; no subject acceptance is possible without it`); this.name = "SubjectEvidenceUnavailable"; }
}

/**
 * The privately owned original photograph, exactly the one the enrollment pinned,
 * as the review's identity/age evidence. Owner, type, privacy, liveness and bytes
 * are all checked; the wire copy is a bounded PNG derived from those bytes.
 */
export async function loadSubjectPhoto(c: Pick<Container, "db" | "storage">,
  prepared: { game: { ownerId: string | null }; child: { originalPhotoAssetId: string | null; ageYears: number | null } },
  upgrade: SubjectUpgradeReceipt): Promise<Buffer> {
  const { game, child } = prepared;
  if (!child.originalPhotoAssetId) throw new SubjectEvidenceUnavailable("the original photograph is no longer kept");
  if (child.originalPhotoAssetId !== upgrade.photoAssetId || child.ageYears !== upgrade.ageYears || game.ownerId !== upgrade.ownerId)
    throw new SubjectEvidenceUnavailable("the child's photograph or age differs from the enrolled one");
  const photo = await c.db.asset.findUnique({ where: { id: upgrade.photoAssetId } });
  if (!photo || photo.ownerId !== game.ownerId || photo.type !== "ORIGINAL_PHOTO" || photo.visibility !== "PRIVATE"
    || photo.status !== "READY" || photo.deletedAt) throw new SubjectEvidenceUnavailable("the original photograph is not a live private asset of this owner");
  const bytes = await c.storage.get(photo.storagePath);
  if (sha256Bytes(bytes) !== upgrade.photoSha256) throw new SubjectEvidenceUnavailable("the original photograph's bytes differ from the enrolled ones");
  return sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/**
 * The subject question about one ready appearance, byte for byte as it is bought:
 * the photo and canonical face as labelled identity/age evidence, the actual
 * player context and closeup as the authority for style and light, the plan, and
 * the immutable binding (candidate, photo and plan digests). Opus HIGH on the
 * scene-quality policy; its own prompt makes it a separate operation.
 */
export function subjectQuestion(prepared: Pick<Prepared, "request">, plan: SubjectPlan, photoPng: Buffer, binding: object, attempt: number,
  addendum: string, upgrade: SubjectUpgradeReceipt): PreparedVisualReview {
  const hide = prepared.request.hides[0];
  if (!hide?.closeupPng || hide.hideId !== plan.hideId) throw Error("SUBJECT_REVIEW: one ready appearance with its native closeup is required");
  return prepareVisualReview({ role: "scene-quality", effort: "high",
    images: [photoPng, prepared.request.identityPng, hide.afterPng, hide.closeupPng], labels: subjectReviewLabels(hide.hideId),
    prompt: subjectReviewPrompt(plan, upgrade.ageYears) + addendum + `\nImmutable candidate binding: ${JSON.stringify({ ...binding,
      subjectPolicy: SUBJECT_POLICY_VERSION, photoSha256: upgrade.photoSha256, planSha256: subjectPlanSha256(plan) })}. Evidence attempt: ${attempt}.` });
}

/** New pixels get both quality and subject readings in the same Opus HIGH Batch request.
 * Exact legacy quality receipts can still be reused with a separate subject-only question. */
export function combinedQualitySubjectQuestion(quality: PreparedVisualReview, plan: SubjectPlan, photoPng: Buffer,
  upgrade: SubjectUpgradeReceipt): { question: PreparedVisualReview; binding: SubjectQualityBundleBinding } | null {
  const subjectLabels = subjectReviewLabels(plan.hideId);
  // Keep every original quality label. These aliases identify the same portrait
  // and native inset without repeating their already-present role instructions.
  const labels = quality.labels.map((label, index) => index === 1 ? `${label} | EVIDENCE_ID=${plan.hideId}:canonical-portrait (same identity-only face/hair).`
    : label.includes(`EVIDENCE_ID=${plan.hideId}:after `) ? `${label} | EVIDENCE_ID=${plan.hideId}:closeup = RIGHT native head inset.` : label);
  const binding: SubjectQualityBundleBinding = { version: SUBJECT_QUALITY_BUNDLE_VERSION, photoSha256: upgrade.photoSha256,
    planSha256: subjectPlanSha256(plan) };
  const question = prepareVisualReview({ role: "scene-quality", effort: "high", images: [...quality.images, photoPng],
    labels: [...labels, subjectLabels[0]!], prompt: quality.prompt
      + `\nMANDATORY CHILD INSPECTION (last image = original photo):\n${subjectReviewPrompt(plan, upgrade.ageYears, "bundle-member")}`
      + `\nFINAL OUTPUT CONTRACT, also for format/size recovery: {"version":"${SUBJECT_QUALITY_BUNDLE_VERSION}","quality":<complete quality object above>,"subject":<complete subject object above>}. Both inspections mandatory; never omit a defect/check/observation. Keep passing observations short. Subject binding: ${JSON.stringify(binding)}.` });
  // Very large evidence/retry packets keep the complete ordinary quality and
  // separate subject inspections. Never enlarge a reservation, trim evidence or
  // lower the output cap just to combine them. This decision is deterministic
  // before any purchase; dualQuestions already handles the separate path.
  const bound = visualReviewMaxCharge(question);
  return bound.ok && bound.microUsd <= DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality ? { binding, question } : null;
}

/**
 * What an enrolled world's painter is told about one appearance, with the fixed
 * check codes its last subject refusal named; undefined for any other world or
 * version. Deterministic for a given row, so a resumed attempt asks the same.
 */
export async function subjectDirectionFor(c: Pick<Container, "db" | "storage">, gameId: string, hideId: string,
  contentVersion: number, judgeJson: string | null,
  painter: { basePolicySha256?: string; attemptNumber?: number; forceMedium?: boolean } = {}): Promise<LocalPatchAttemptInput["subjectDirection"]> {
  if (contentVersion !== 12) return undefined;
  const upgrade = await subjectUpgradeOf(c.db, gameId);
  if (!upgrade) return undefined;
  const plan = subjectPlanOfHide(hideId);
  if (!plan) throw Error(`SUBJECT_PLAN: enrolled ${hideId} has no subject plan`);
  let codes: SubjectCheck[] = [];
  let qualityFaceFault = false;
  try {
    const prior = JSON.parse(judgeJson ?? "null");
    const failed: unknown = prior?.boardReview?.dual?.subject?.failedChecks;
    if (Array.isArray(failed)) codes = failed.filter((code): code is SubjectCheck => (SUBJECT_CHECKS as readonly unknown[]).includes(code));
    qualityFaceFault = ["faceLikeness", "faceReadable", "ageAppropriate"].some(key => ["fail", "unsure"].includes(prior?.verdict?.[key]));
  } catch { codes = []; }
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
  if (!game || game.deletedAt || !game.childProfile || game.childProfile.deletedAt)
    throw new SubjectEvidenceUnavailable("the game or child is no longer live");
  const photoPng = await sharp(await loadSubjectPhoto(c, { game, child: game.childProfile }, upgrade))
    .resize(384, 384, { fit: "inside", withoutEnlargement: true }).png().toBuffer(), photoSha256 = sha256Bytes(photoPng);
  // Keep the game's LOW pin for pose/wardrobe changes. A located/uncertain face or
  // age fault, a final attempt, or a diagnosed redraw escalates explicitly to MEDIUM.
  const medium = painter.forceMedium || (painter.attemptNumber ?? 1) >= 3 || qualityFaceFault
    || codes.some(code => ["photoLikeness", "canonicalAgreement", "perceivedAge", "faceVisible"].includes(code))
    || painter.basePolicySha256 !== localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY);
  const quality = medium ? "medium" as const : "low" as const;
  const policySha256 = localPatchRenderPolicySha256(medium ? LOCAL_PATCH_IMAGE_POLICY : LOCAL_PATCH_LOW_IMAGE_POLICY);
  const text = subjectRenderDirection(plan, upgrade.ageYears, codes)
    + "\nREFERENCE ROLES, in image order: image 1 is the actual scene crop and controls style, lighting and geometry. Image 2 is the canonical illustrated face and corroborates identity only. Image 3 is the original photograph and controls facial likeness and age only. Never copy the photograph's pose, smile, clothing, photographic texture or lighting. Render the planned action and expression in the scene's illustration style.";
  const wardrobe = subjectWardrobe(plan);
  return { text, ...(wardrobe ? { wardrobe } : {}), photoPng, photoSha256, policySha256, quality,
    sha256: sha256Bytes(Buffer.from(JSON.stringify([text, wardrobe ?? null, photoSha256, policySha256, quality]))) };
}

/**
 * The quality verdict with the subject result applied, re-read by the reader that
 * read the quality answer: each located subject failure fails the check that routes
 * its repair (SUBJECT_REPAIR_ROUTE) with its own located fault; explicit subject
 * uncertainty leaves that check unsure, which the bounded image route repairs. A
 * subject result that is not a pass can never leave the verdict acceptable.
 */
export function withSubject(verdicts: LocalPatchBoardJudgeResult["verdicts"], hideId: string, reading: Extract<SubjectReading, { ok: true }>,
  reader: QualityReader): LocalPatchBoardJudgeResult["verdicts"] {
  const current = verdicts[hideId];
  if (!current || reading.disposition === "pass") return verdicts;
  const wire = Object.fromEntries(Object.entries(current).filter(([key]) =>
    !["claimedVerdict", "verdictOverridden", "downgraded", "contradicted", "unclassified"].includes(key)));
  const failed = SUBJECT_CHECKS.filter(k => reading.checks[k] === "fail");
  if (reading.disposition === "repair") {
    const routed = [...new Set(failed.map(k => SUBJECT_REPAIR_ROUTE[k]))];
    const faults = reading.faults.filter(f => (failed as readonly string[]).includes(f.check))
      .map(f => ({ check: SUBJECT_REPAIR_ROUTE[f.check as typeof failed[number]], where: `SUBJECT ${f.check}: ${f.where}`.slice(0, 300) }));
    return { ...verdicts, [hideId]: parseLocalPatchVerdict({ ...wire, ...Object.fromEntries(routed.map(k => [k, "fail"])), verdict: "fail",
      reason: "Independent subject review found a located subject defect", faults: [...current.faults, ...faults].slice(0, 16) }, 12, reader) };
  }
  const uncertain = SUBJECT_CHECKS.filter(k => reading.checks[k] !== "pass");
  // An unclassified fault beside all-pass checks is still not a pass.
  const targets: readonly SubjectCheck[] = uncertain.length ? uncertain : ["plannedAction"];
  // The legacy peeking exception may tolerate age uncertainty alone. A new
  // subject uncertainty must still take the repair route, never that waiver.
  const routed = [...new Set([...targets.map(k => SUBJECT_REPAIR_ROUTE[k]), "childPresent"])];
  return { ...verdicts, [hideId]: parseLocalPatchVerdict({ ...wire, ...Object.fromEntries(routed.map(k => [k, "unsure"])), verdict: "unsure",
    reason: "Independent subject review could not establish the subject for these pixels",
    faults: current.faults.filter(f => !(routed as readonly string[]).includes(f.check)) }, 12, reader) };
}
