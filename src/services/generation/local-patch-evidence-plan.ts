import type { Container } from "../container";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { needsSelfRepair } from "../../domain/scene/local-patch-self-repair";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { localPatchRetainedAnswerUndecided, type DualReviewProof } from "./local-patch-dual-evidence";
import { readRetainedAnswer } from "./local-patch-dual-review";
import { localPatchEvidenceRecovery } from "./local-patch-review-recovery";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { dualVisualReviewVersion } from "./visual-review-release";
import { sha256Bytes } from "./fixed-sprite";

/** Each dual question reserves this before dispatch; the two roles reserve in turn. */
export const LOCAL_PATCH_DUAL_QUESTION_RESERVE_MICRO_USD = 300_000;

export type LocalPatchEvidencePlanHide = {
  readonly hideId: string; readonly boardId: string; readonly status: string; readonly attempts: number;
  readonly plan: "approved" | "free-pass" | "free-repair" | "free-undecided" | "unverifiable" | "first-review"
    | "evidence-question" | "evidence-wait" | "evidence-exhausted" | "image-route" | "unpainted" | "other";
  /** Machine detail only (a strategy, a code, a reason class): never answer text. */
  readonly detail: string | null;
};
export type LocalPatchEvidencePlan = {
  readonly gameId: string; readonly status: string; readonly dualVersion: string | null;
  readonly job: { readonly status: string; readonly currentStep: string | null } | null;
  readonly budget: { readonly capMicroUsd: number; readonly committedMicroUsd: number; readonly settledMicroUsd: number;
    readonly reservedMicroUsd: number; readonly remainingMicroUsd: number; readonly held: boolean;
    readonly pendingRequests: number; readonly unknownRequests: number };
  readonly hides: readonly LocalPatchEvidencePlanHide[];
  readonly summary: Record<LocalPatchEvidencePlanHide["plan"], number> & {
    readonly paidQuestionsStillNeeded: number; readonly questionReserveMicroUsd: number;
    readonly nextQuestionFits: boolean; readonly notes: readonly string[] };
};

/**
 * Dry run: what an unfinished local-patch world can still do, and at what cost.
 * Reads rows, retained answers, the ledger and stored pixels only. It never
 * reserves, settles, dispatches, writes a row or an audit record, and it makes
 * no promise that the remaining budget completes the world.
 */
export async function planLocalPatchEvidenceRecovery(c: Container, gameId: string): Promise<LocalPatchEvidencePlan> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { scenes: { orderBy: { orderIndex: "asc" } }, childProfile: true } });
  const job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` }, select: { status: true, currentStep: true } });
  const version = await dualVisualReviewVersion(c.db, gameId);
  const worldId = boardWizardWorldId(gameId), audit = await boardWizardBudgetOf(c).audit(worldId);
  const identity = game.childProfile?.identityAssetId ? await c.db.asset.findUnique({ where: { id: game.childProfile.identityAssetId } }) : null;
  const identitySha256 = identity && !identity.deletedAt ? sha256Bytes(await c.storage.get(identity.storagePath)) : null;
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } } });
  const hides: LocalPatchEvidencePlanHide[] = [];
  for (const scene of game.scenes) {
    for (const hide of localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion)?.hides ?? []) {
      const row = rows.find(r => r.targetInstance.gameSceneId === scene.id && r.targetInstance.targetId === hide.targetId);
      const entry = (plan: LocalPatchEvidencePlanHide["plan"], detail: string | null = null): LocalPatchEvidencePlanHide =>
        ({ hideId: hide.id, boardId: scene.sceneSlug, status: row?.status ?? "MISSING", attempts: row?.attempts ?? 0, plan, detail });
      if (!row || row.status === "PENDING" || !row.assetId) { hides.push(entry("unpainted")); continue; }
      let receipt: Record<string, unknown> & { reviewState?: unknown; boardReview?: { dual?: DualReviewProof } } = {};
      try { receipt = JSON.parse(row.judgeJson ?? "{}"); } catch { /* reported below as other */ }
      const asset = await c.db.asset.findUnique({ where: { id: row.assetId } });
      const imageSha256 = asset && !asset.deletedAt ? sha256Bytes(await c.storage.get(asset.storagePath)) : null;
      const binding = { gameId, sceneVersion: scene.sceneVersion, hideId: hide.id, variantId: row.id, attempts: row.attempts,
        identityAssetId: identity?.id ?? "", identitySha256: identitySha256 ?? "", assetId: row.assetId,
        imageSha256: imageSha256 ?? "", geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson };
      if (row.status === "GENERATED") {
        if (receipt.reviewState !== "board-review-complete") hides.push(entry("first-review"));
        else hides.push(await hasLocalPatchPublicationPolicy(c, binding) ? entry("approved") : entry("other", "reviewed without a valid publication record"));
        continue;
      }
      if (version && localPatchRetainedAnswerUndecided(row)) {
        const retained = imageSha256 && identitySha256 ? await readRetainedAnswer(c.db, worldId, version, receipt.boardReview?.dual,
          { hideId: hide.id, imageSha256, geometrySha256: binding.geometrySha256, identitySha256 }) : { ok: false as const, reason: "Stored pixels or identity are unavailable" };
        if (!retained.ok) hides.push(entry("unverifiable", retained.reason));
        else if (retained.role === "quality") {
          // A refused Opus answer read again: a located defect is a free repair
          // decision; anything else still needs a question, never an approval.
          hides.push(entry(retained.disposition === "retry" ? "free-repair" : "free-undecided",
            `${retained.reader}: ${retained.fault ? `${retained.fault.code} at ${retained.fault.path}` : retained.disposition}`));
        }
        else hides.push(entry(retained.verdict.disposition === "pass" ? "free-pass" : retained.verdict.disposition === "repair" ? "free-repair" : "free-undecided",
          `${retained.reader}: ${retained.verdict.reason}`));
        continue;
      }
      const recovery = localPatchEvidenceRecovery(row);
      if (recovery?.retry) hides.push(entry("evidence-question", `${recovery.role} ${recovery.strategy} round ${recovery.nextAttempt}`));
      else if (recovery?.waiting) hides.push(entry("evidence-wait", `retry after ${new Date(recovery.retryAt).toISOString()}`));
      else if (recovery?.exhausted) hides.push(entry("evidence-exhausted", recovery.step && recovery.step.diagnosis ? `${recovery.step.diagnosis.role} ${recovery.step.diagnosis.kind}` : null));
      else if (row.status === "FAILED" && (needsSelfRepair(row) || row.lastError?.startsWith("quality-retry:"))) hides.push(entry("image-route"));
      else hides.push(entry("other", row.lastError?.split(":")[0] ?? null));
    }
  }
  const count = (plan: LocalPatchEvidencePlanHide["plan"]) => hides.filter(h => h.plan === plan).length;
  const plans = ["approved", "free-pass", "free-repair", "free-undecided", "unverifiable", "first-review", "evidence-question",
    "evidence-wait", "evidence-exhausted", "image-route", "unpainted", "other"] as const;
  const counts = Object.fromEntries(plans.map(plan => [plan, count(plan)])) as Record<LocalPatchEvidencePlanHide["plan"], number>;
  // A lower bound: a first review is two questions (quality, then anatomy); a
  // re-asked anatomy question reuses its passing quality answer. Image routes
  // also need a new picture and its reviews, so they are counted separately.
  const paidQuestionsStillNeeded = 2 * counts["first-review"] + counts["evidence-question"] + counts["free-undecided"];
  // Under the ceiling in force now. The world's one automatic extension (four to
  // five dollars, where policy allows it) is the pipeline's decision, not this plan's.
  const nextQuestionFits = !audit.held && audit.remainingMicroUsd >= LOCAL_PATCH_DUAL_QUESTION_RESERVE_MICRO_USD;
  const notes: string[] = [];
  if (counts["free-pass"] + counts["free-repair"]) notes.push(`${counts["free-pass"] + counts["free-repair"]} appearances are decided from answers already paid for, with no new question or reservation.`);
  if (paidQuestionsStillNeeded && !nextQuestionFits) notes.push(`At least ${paidQuestionsStillNeeded} paid questions remain; each reserves ${LOCAL_PATCH_DUAL_QUESTION_RESERVE_MICRO_USD} micro-USD and ${audit.remainingMicroUsd} remain of ${audit.capMicroUsd}. `
    + (audit.capMicroUsd < 5_000_000 ? "The pipeline decides at its first refusal whether the world's one automatic extension to 5000000 applies; this plan does not activate it."
      : "No automatic path exists within the authorized ceiling: a service decision is required."));
  if (counts["image-route"] || counts["unpainted"]) notes.push("Image routes and unpainted appearances also need new pictures and their reviews; actual settled costs vary and this plan promises no completion.");
  return { gameId, status: game.status, dualVersion: version, job: job ? { status: job.status, currentStep: job.currentStep } : null,
    budget: { capMicroUsd: audit.capMicroUsd, committedMicroUsd: audit.committedMicroUsd, settledMicroUsd: audit.settledMicroUsd,
      reservedMicroUsd: audit.reservedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd, held: audit.held,
      pendingRequests: audit.pendingRequestKeys.length, unknownRequests: audit.unknownRequestKeys.length },
    hides, summary: { ...counts, paidQuestionsStillNeeded, questionReserveMicroUsd: LOCAL_PATCH_DUAL_QUESTION_RESERVE_MICRO_USD, nextQuestionFits, notes } };
}
