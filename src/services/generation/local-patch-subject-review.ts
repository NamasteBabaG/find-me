import sharp from "sharp";
import { LEAN_WARM_HAT_WARDROBE, SUBJECT_PAINTER_V2, SUBJECT_PAINTER_V3, SUBJECT_PAINTER_V4, locatedDefects, subjectRenderDirectionV2, subjectRenderDirectionV3,
  subjectRenderDirectionV4 } from "../../domain/generation/subject-painter";
import { isLeanWorld } from "./lean-release";
import type { Container } from "../container";
import {
  SUBJECT_CHECKS, SUBJECT_CHECKS_V2, SUBJECT_COLLECTION_VARIETY, SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER_V2, SUBJECT_REPAIR_ROUTE,
  SUBJECT_REPAIR_ROUTE_V2, readSubjectAnswer, readSubjectAnswerV2, subjectRenderDirection, subjectReviewLabels, subjectReviewPrompt, subjectReviewPromptV2,
  subjectWardrobe, type SubjectCheck, type SubjectPlan, type SubjectReading, type SubjectReadingV2, type SubjectRepairCodeV2,
} from "../../domain/generation/subject-policy";
import { subjectStageRaw, type SubjectStage } from "./local-patch-dual-evidence";
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
/** Which subject question is asked: the enrolled v1 (replay of what was bought) or v2 (every new question). */
export type SubjectQuestionPolicy = typeof SUBJECT_POLICY_VERSION | typeof SUBJECT_POLICY_V2;

export function subjectQuestion(prepared: Pick<Prepared, "request">, plan: SubjectPlan, photoPng: Buffer, binding: object, attempt: number,
  addendum: string, upgrade: SubjectUpgradeReceipt, policy: SubjectQuestionPolicy = SUBJECT_POLICY_VERSION): PreparedVisualReview {
  const hide = prepared.request.hides[0];
  if (!hide?.closeupPng || hide.hideId !== plan.hideId) throw Error("SUBJECT_REVIEW: one ready appearance with its native closeup is required");
  return prepareVisualReview({ role: "scene-quality", effort: "high",
    images: [photoPng, prepared.request.identityPng, hide.afterPng, hide.closeupPng], labels: subjectReviewLabels(hide.hideId),
    prompt: (policy === SUBJECT_POLICY_V2 ? subjectReviewPromptV2(plan, upgrade.ageYears) : subjectReviewPrompt(plan, upgrade.ageYears))
      + addendum + `\nImmutable candidate binding: ${JSON.stringify({ ...binding,
      subjectPolicy: policy, photoSha256: upgrade.photoSha256, planSha256: subjectPlanSha256(plan) })}. Evidence attempt: ${attempt}.` });
}

/** New pixels get both quality and subject readings in the same Opus HIGH Batch request.
 * Exact legacy quality receipts can still be reused with a separate subject-only question.
 * `policy` v1 rebuilds a bundle bought before v2 exactly (its replay); new bundles ask v2. */
export function combinedQualitySubjectQuestion(quality: PreparedVisualReview, plan: SubjectPlan, photoPng: Buffer,
  upgrade: SubjectUpgradeReceipt, policy: SubjectQuestionPolicy = SUBJECT_POLICY_VERSION): { question: PreparedVisualReview; binding: SubjectQualityBundleBinding } | null {
  const subjectLabels = subjectReviewLabels(plan.hideId);
  // Keep every original quality label. These aliases identify the same portrait
  // and native inset without repeating their already-present role instructions.
  const labels = quality.labels.map((label, index) => index === 1 ? `${label} | EVIDENCE_ID=${plan.hideId}:canonical-portrait (same identity-only face/hair).`
    : label.includes(`EVIDENCE_ID=${plan.hideId}:after `) ? `${label} | EVIDENCE_ID=${plan.hideId}:closeup = RIGHT native head inset.` : label);
  const binding: SubjectQualityBundleBinding = { version: SUBJECT_QUALITY_BUNDLE_VERSION, photoSha256: upgrade.photoSha256,
    planSha256: subjectPlanSha256(plan), ...(policy === SUBJECT_POLICY_V2 ? { subjectPolicy: SUBJECT_POLICY_V2 } : {}) };
  // A lean world's bundle (local-patch-lean/v1) is asked of the same judge, transport and tier as its quality question.
  const question = prepareVisualReview({ role: "scene-quality", effort: "high",
    ...(quality.tier ? { judge: quality.judge, transport: quality.transport, tier: quality.tier } : {}), images: [...quality.images, photoPng],
    labels: [...labels, subjectLabels[0]!], prompt: quality.prompt
      + `\nMANDATORY CHILD INSPECTION (last image = original photo):\n${policy === SUBJECT_POLICY_V2
        ? subjectReviewPromptV2(plan, upgrade.ageYears, "bundle-member") : subjectReviewPrompt(plan, upgrade.ageYears, "bundle-member")}`
      + `\nFINAL OUTPUT CONTRACT, also for format/size recovery: {"version":"${SUBJECT_QUALITY_BUNDLE_VERSION}","quality":<complete quality object above>,"subject":<complete subject object above>}. Both inspections mandatory; never omit a defect/check/observation. Keep passing observations short. Subject binding: ${JSON.stringify(binding)}.` });
  // Very large evidence/retry packets keep the complete ordinary quality and
  // separate subject inspections. Never enlarge a reservation, trim evidence or
  // lower the output cap just to combine them. This decision is deterministic
  // before any purchase; dualQuestions already handles the separate path.
  const bound = visualReviewMaxCharge(question);
  return bound.ok && bound.microUsd <= DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality ? { binding, question } : null;
}

/** Subject checks that describe the drawn child itself under v2: a recomposition of the same painting cannot change them. */
export const INTRINSIC_SUBJECT_CODES: readonly SubjectRepairCodeV2[] = Object.freeze(["photoLikeness", "canonicalAgreement", "faceVisible", "perceivedAge", "requiredWardrobe"]);
const QUALITY_FACE_CHECKS = ["faceLikeness", "faceReadable", "ageAppropriate"] as const;

/**
 * What the last review of an appearance refused about the child, as the next painting and the next
 * diagnosis are told it: the v1 check codes exactly as the historical painters read them (replay), the
 * v2 repair codes (a v1 plan check is no requirement under v2 and is dropped), and the defects the
 * reviewer located for those codes, quoted from the subject answer (or, without one, the quality
 * judge's own face and age faults). Read from the stage's own reader; nothing is re-decided here.
 */
export function subjectRefusalOf(prior: unknown, plan: SubjectPlan, ageYears: number): {
  readonly v1Codes: SubjectCheck[]; readonly codes: SubjectRepairCodeV2[]; readonly located: string[]; readonly intrinsic: boolean } {
  const receipt = prior as { boardReview?: { dual?: { subject?: SubjectStage } }; verdict?: Record<string, unknown> & { faults?: { check: string; where: string }[] } } | null;
  const stage = receipt?.boardReview?.dual?.subject;
  const failed: unknown = stage?.failedChecks;
  const v1Codes = Array.isArray(failed) ? failed.filter((code): code is SubjectCheck => (SUBJECT_CHECKS as readonly unknown[]).includes(code)) : [];
  const codes = Array.isArray(failed) ? [...new Set(failed.filter((code): code is SubjectRepairCodeV2 =>
    (SUBJECT_CHECKS_V2 as readonly unknown[]).includes(code) || code === SUBJECT_COLLECTION_VARIETY))] : [];
  let faults: readonly { check: string; where: string }[] = [];
  const raw = stage ? subjectStageRaw(stage) : null;
  if (stage && raw) {
    const reading = stage.reader === SUBJECT_READER_V2 ? readSubjectAnswerV2(raw, { hideId: plan.hideId, ageYears, plan })
      : readSubjectAnswer(raw, { hideId: plan.hideId, ageYears, plan });
    if (reading.ok) faults = reading.faults;
  }
  if (stage?.collectionRefusal) faults = [...faults, { check: SUBJECT_COLLECTION_VARIETY, where: stage.collectionRefusal }];
  let located = locatedDefects(faults, codes);
  const verdict = receipt?.verdict;
  const qualityFace = QUALITY_FACE_CHECKS.filter(key => ["fail", "unsure"].includes(String(verdict?.[key] ?? "")));
  if (!located.length && qualityFace.length && Array.isArray(verdict?.faults))
    located = locatedDefects(verdict.faults.filter(f => !String(f.where).startsWith("SUBJECT ")), [...qualityFace]);
  return { v1Codes, codes, located, intrinsic: codes.some(code => INTRINSIC_SUBJECT_CODES.includes(code)) || qualityFace.length > 0 };
}

/**
 * What an enrolled world's painter is told about one appearance: for a new purchase the v3 direction
 * (local-patch-subject-paint/v3, policy v2) with the codes and located defects of its last refusal;
 * for a started purchase the exact v2 or v1 direction it was bought with (`legacy`, replay only).
 * Undefined for any other world or version. Deterministic for a given row.
 */
export async function subjectDirectionFor(c: Pick<Container, "db" | "storage">, gameId: string, hideId: string,
  contentVersion: number, judgeJson: string | null,
  painter: { basePolicySha256?: string; attemptNumber?: number; forceMedium?: boolean } = {}): Promise<LocalPatchAttemptInput["subjectDirection"]> {
  if (contentVersion !== 12) return undefined;
  const upgrade = await subjectUpgradeOf(c.db, gameId);
  if (!upgrade) return undefined;
  const plan = subjectPlanOfHide(hideId);
  if (!plan) throw Error(`SUBJECT_PLAN: enrolled ${hideId} has no subject plan`);
  let prior: unknown = null;
  try { prior = JSON.parse(judgeJson ?? "null"); } catch { prior = null; }
  const refusal = subjectRefusalOf(prior, plan, upgrade.ageYears);
  const qualityFaceFault = QUALITY_FACE_CHECKS.some(key => ["fail", "unsure"].includes(String((prior as { verdict?: Record<string, unknown> } | null)?.verdict?.[key] ?? "")));
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
  if (!game || game.deletedAt || !game.childProfile || game.childProfile.deletedAt)
    throw new SubjectEvidenceUnavailable("the game or child is no longer live");
  const photoPng = await sharp(await loadSubjectPhoto(c, { game, child: game.childProfile }, upgrade))
    .resize(384, 384, { fit: "inside", withoutEnlargement: true }).png().toBuffer(), photoSha256 = sha256Bytes(photoPng);
  // Keep the game's LOW pin for pose/wardrobe changes. A located/uncertain face or
  // age fault, a final attempt, or a diagnosed redraw escalates explicitly to MEDIUM.
  // The historical directions keep their own decision, so a started purchase replays.
  const faceCodes = ["photoLikeness", "canonicalAgreement", "perceivedAge", "faceVisible"];
  const escalated = painter.forceMedium || (painter.attemptNumber ?? 1) >= 3 || qualityFaceFault
    || painter.basePolicySha256 !== localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY);
  const wardrobe = subjectWardrobe(plan);
  const direction = (text: string, medium: boolean) => {
    const quality = medium ? "medium" as const : "low" as const;
    const policySha256 = localPatchRenderPolicySha256(medium ? LOCAL_PATCH_IMAGE_POLICY : LOCAL_PATCH_LOW_IMAGE_POLICY);
    return { text, ...(wardrobe ? { wardrobe } : {}), photoPng, photoSha256, policySha256, quality,
      sha256: sha256Bytes(Buffer.from(JSON.stringify([text, wardrobe ?? null, photoSha256, policySha256, quality]))) };
  };
  const references = "\nREFERENCE ROLES, in image order: image 1 is the actual scene crop and controls style, lighting and geometry. Image 2 is the canonical illustrated face and corroborates identity only. Image 3 is the original photograph and controls facial likeness and age only. Never copy the photograph's pose, smile, clothing, photographic texture or lighting.";
  const historical = references + " Render the planned action and expression in the scene's illustration style.";
  const mediumV1 = escalated || refusal.v1Codes.some(code => faceCodes.includes(code));
  const mediumV3 = escalated || refusal.codes.some(code => faceCodes.includes(code));
  const v3 = { ...direction(subjectRenderDirectionV3(plan, upgrade.ageYears, { codes: refusal.codes, located: refusal.located })
    + references + " Render a natural pose and expression in the scene's illustration style.", mediumV3), painterVersion: SUBJECT_PAINTER_V3 };
  const legacy = [{ ...direction(subjectRenderDirectionV2(plan, upgrade.ageYears, refusal.v1Codes) + historical, mediumV1), painterVersion: SUBJECT_PAINTER_V2 },
    direction(subjectRenderDirection(plan, upgrade.ageYears, refusal.v1Codes) + historical, mediumV1)];
  // local-patch-lean/v1: every painting MEDIUM, the planned look and the pushed-back hat (v4). Its own
  // wardrobe replaces the enrolled one; the earlier directions stay only to replay a started purchase.
  if (await isLeanWorld(c.db, gameId)) {
    const lean = (text: string) => {
      const policySha256 = localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY), hat = plan.warmHat ? LEAN_WARM_HAT_WARDROBE : undefined;
      return { text, ...(hat ? { wardrobe: hat } : {}), photoPng, photoSha256, policySha256, quality: "medium" as const,
        sha256: sha256Bytes(Buffer.from(JSON.stringify([text, hat ?? null, photoSha256, policySha256, "medium"]))) };
    };
    return { ...lean(subjectRenderDirectionV4(plan, upgrade.ageYears, { codes: refusal.codes, located: refusal.located })
      + references + " Render the planned look in the scene's illustration style."), painterVersion: SUBJECT_PAINTER_V4, legacy: [v3, ...legacy] };
  }
  return { ...v3, legacy };
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

/** The codes a v2 refusal names, for the stage's record and the next painting: its failed or
 * uncertain checks, or the collection's variety refusal. */
export function subjectV2RefusalCodes(reading: Extract<SubjectReadingV2, { ok: true }>, collectionRefusal: string | null): SubjectRepairCodeV2[] {
  const checks = SUBJECT_CHECKS_V2.filter(k => reading.checks[k] !== "pass");
  return checks.length ? [...checks] : collectionRefusal ? [SUBJECT_COLLECTION_VARIETY] : [];
}

/**
 * withSubject for a v2 reading: its located failures fail the checks that route their repair
 * (SUBJECT_REPAIR_ROUTE_V2), its uncertainty leaves them unsure for the bounded image route, and a
 * pass the collection refused (its look already covers a third of the world) fails childPresent
 * with that reason. A pass the collection accepts leaves the verdict as the quality reader read it.
 */
export function withSubjectV2(verdicts: LocalPatchBoardJudgeResult["verdicts"], hideId: string, reading: Extract<SubjectReadingV2, { ok: true }>,
  collectionRefusal: string | null, reader: QualityReader): LocalPatchBoardJudgeResult["verdicts"] {
  const current = verdicts[hideId];
  if (!current || reading.disposition === "pass" && !collectionRefusal) return verdicts;
  const wire = Object.fromEntries(Object.entries(current).filter(([key]) =>
    !["claimedVerdict", "verdictOverridden", "downgraded", "contradicted", "unclassified"].includes(key)));
  if (reading.disposition === "repair" || reading.disposition === "pass") {
    const failed: SubjectRepairCodeV2[] = reading.disposition === "repair" ? SUBJECT_CHECKS_V2.filter(k => reading.checks[k] === "fail") : [SUBJECT_COLLECTION_VARIETY];
    const routed = [...new Set(failed.map(k => SUBJECT_REPAIR_ROUTE_V2[k]))];
    const located = reading.disposition === "repair"
      ? reading.faults.filter(f => (failed as readonly string[]).includes(f.check)).map(f => ({ check: SUBJECT_REPAIR_ROUTE_V2[f.check as SubjectRepairCodeV2], where: `SUBJECT ${f.check}: ${f.where}`.slice(0, 300) }))
      : [{ check: "childPresent", where: `SUBJECT ${SUBJECT_COLLECTION_VARIETY}: ${collectionRefusal}`.slice(0, 300) }];
    return { ...verdicts, [hideId]: parseLocalPatchVerdict({ ...wire, ...Object.fromEntries(routed.map(k => [k, "fail"])), verdict: "fail",
      reason: reading.disposition === "repair" ? "Independent subject review found a located subject defect"
        : "This look already covers a third of the world; this appearance is repainted for variety",
      faults: [...current.faults, ...located].slice(0, 16) }, 12, reader) };
  }
  const uncertain = SUBJECT_CHECKS_V2.filter(k => reading.checks[k] !== "pass");
  const routed = [...new Set([...uncertain.map(k => SUBJECT_REPAIR_ROUTE_V2[k]), "childPresent"])];
  return { ...verdicts, [hideId]: parseLocalPatchVerdict({ ...wire, ...Object.fromEntries(routed.map(k => [k, "unsure"])), verdict: "unsure",
    reason: "Independent subject review could not establish the subject for these pixels",
    faults: current.faults.filter(f => !(routed as readonly string[]).includes(f.check)) }, 12, reader) };
}
