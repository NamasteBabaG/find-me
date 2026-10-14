import type { Container } from "../container";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { needsSelfRepair } from "../../domain/scene/local-patch-self-repair";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { localPatchContinuityPending, localPatchRetainedAnswerUndecided, type DualReviewProof } from "./local-patch-dual-evidence";
import { nextDualReviewPurchase, readRetainedAnswer, type DualQuestionAdmission } from "./local-patch-dual-review";
import { prepareLocalPatchBoardReview } from "./local-patch-board-review";
import { localPatchEvidenceRecovery } from "./local-patch-review-recovery";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";
import { dualReviewReserveMicroUsd } from "../../domain/generation/dual-review-reserve";
import { sha256Bytes } from "./fixed-sprite";


export type LocalPatchEvidencePlanHide = {
  readonly hideId: string; readonly boardId: string; readonly status: string; readonly attempts: number;
  readonly plan: "approved" | "free-pass" | "free-repair" | "free-undecided" | "unverifiable" | "first-review" | "continuity-review"
    | "evidence-question" | "evidence-wait" | "evidence-exhausted" | "image-route" | "unpainted" | "other";
  /** Machine detail only (a strategy, a code, a reason class): never answer text. */
  readonly detail: string | null;
};
/** One board's next paid review question, built and admitted exactly as its purchase would be. */
export type LocalPatchNextQuestion = DualQuestionAdmission & { readonly boardId: string; readonly hideId: string };
export type LocalPatchEvidencePlan = {
  readonly gameId: string; readonly status: string; readonly dualVersion: string | null;
  readonly job: { readonly status: string; readonly currentStep: string | null } | null;
  readonly budget: { readonly capMicroUsd: number; readonly committedMicroUsd: number; readonly settledMicroUsd: number;
    readonly reservedMicroUsd: number; readonly remainingMicroUsd: number; readonly held: boolean;
    readonly pendingRequests: number; readonly unknownRequests: number };
  readonly hides: readonly LocalPatchEvidencePlanHide[];
  /** Per board, in the order the pipeline asks them: a saved quality answer's continuity question first. */
  readonly nextQuestions: readonly LocalPatchNextQuestion[];
  readonly summary: Record<LocalPatchEvidencePlanHide["plan"], number> & {
    readonly paidQuestionsStillNeeded: number; readonly questionReserveMicroUsd: number;
    /** The new purchase the pipeline makes next: the first admitted question that fits, else the first admitted one it reaches. */
    readonly nextQuestion: LocalPatchNextQuestion | null;
    readonly nextQuestionFits: boolean; readonly notes: readonly string[] };
};

/**
 * Dry run: what an unfinished local-patch world can still do, and at what cost.
 * Reads rows, retained answers, the ledger, the boards and stored pixels only,
 * and builds each board's next question as its purchase would. It never
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
        // A passing quality answer already saved for these pixels leaves only its continuity question.
        if (receipt.reviewState !== "board-review-complete") hides.push(entry(localPatchContinuityPending(row) ? "continuity-review" : "first-review"));
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
  const plans = ["approved", "free-pass", "free-repair", "free-undecided", "unverifiable", "first-review", "continuity-review", "evidence-question",
    "evidence-wait", "evidence-exhausted", "image-route", "unpainted", "other"] as const;
  const counts = Object.fromEntries(plans.map(plan => [plan, count(plan)])) as Record<LocalPatchEvidencePlanHide["plan"], number>;
  // A lower bound: a first review is two questions (quality, then anatomy); a
  // saved passing quality answer and a re-asked anatomy question leave one.
  // Image routes also need a new picture and its reviews, so they are counted separately.
  const paidQuestionsStillNeeded = 2 * counts["first-review"] + counts["continuity-review"] + counts["evidence-question"] + counts["free-undecided"];
  const notes: string[] = [];
  // The next question of each board with an appearance awaiting one, built and
  // admitted as the purchase builds and admits it, in the pipeline's order: a
  // saved quality answer's continuity question before new Opus work. A board with
  // an answer still to be decided for free is skipped: that decision comes first
  // and chooses what it needs next.
  const nextQuestions: LocalPatchNextQuestion[] = [];
  if (version) {
    const continuityFirst = (sceneId: string) => Number(!rows.some(r => r.targetInstance.gameSceneId === sceneId && localPatchContinuityPending(r)));
    const asking = new Set(hides.filter(h => ["first-review", "continuity-review", "evidence-question"].includes(h.plan)).map(h => h.boardId));
    for (const scene of [...game.scenes].sort((a, b) => continuityFirst(a.id) - continuityFirst(b.id))) {
      if (scene.sceneVersion !== 12 || !asking.has(scene.sceneSlug)
        || rows.some(r => r.targetInstance.gameSceneId === scene.id && localPatchRetainedAnswerUndecided(r))) continue;
      let prepared;
      try { prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId: scene.id }, {}, { includePlayerCandidates: true, skipApprovedEvidence: true, playerReview: true }); }
      catch (error) { notes.push(`${scene.sceneSlug}: its next question cannot be built (${(error instanceof Error ? error.message : String(error)).slice(0, 200)}).`); continue; }
      if (!prepared.ready || prepared.protectedRows.size === prepared.entries.length) continue;
      const next = await nextDualReviewPurchase(prepared, version);
      if (next) nextQuestions.push({ ...next, boardId: scene.sceneSlug, hideId: prepared.request.hides[0]!.hideId });
    }
  }
  // As the pipeline goes through them: a key already in the ledger is replayed or
  // awaited, never reserved again; a refused question parks the world; a question
  // the budget refuses is passed for the next board's; the first that fits is bought.
  let nextQuestion: LocalPatchNextQuestion | null = null, affordable = false, parksAt: LocalPatchNextQuestion | null = null;
  for (const q of nextQuestions.filter(q => !q.existing)) {
    if (q.refused) { parksAt = q; break; }
    nextQuestion ??= q;
    if (!audit.held && audit.remainingMicroUsd >= q.reserveMicroUsd) { nextQuestion = q; affordable = true; break; }
  }
  // Under the ceiling in force now. The world's one automatic extension (four to
  // five dollars, where policy allows it) is the pipeline's decision, not this plan's.
  // With no question to build yet, the role still waiting decides the amount.
  const questionReserveMicroUsd = nextQuestion?.reserveMicroUsd
    ?? dualReviewReserveMicroUsd(version === DUAL_VISUAL_REVIEW_V3, counts["continuity-review"] ? "continuity" : "quality");
  const nextQuestionFits = affordable || (!nextQuestion && !parksAt && !audit.held && audit.remainingMicroUsd >= questionReserveMicroUsd);
  if (counts["free-pass"] + counts["free-repair"]) notes.push(`${counts["free-pass"] + counts["free-repair"]} appearances are decided from answers already paid for, with no new question or reservation.`);
  if (parksAt) notes.push(`${parksAt.boardId} ${parksAt.hideId}: ${parksAt.refused}. The world parks there before reserving or sending it.`);
  if (paidQuestionsStillNeeded && !nextQuestionFits) notes.push(`At least ${paidQuestionsStillNeeded} paid questions remain; the next reserves ${questionReserveMicroUsd} micro-USD and ${audit.remainingMicroUsd} remain of ${audit.capMicroUsd}. `
    + (audit.capMicroUsd < 5_000_000 ? "The pipeline decides at its first refusal whether the world's one automatic extension to 5000000 applies; this plan does not activate it."
      : "No automatic path exists within the authorized ceiling: a service decision is required."));
  if (counts["image-route"] || counts["unpainted"]) notes.push("Image routes and unpainted appearances also need new pictures and their reviews; actual settled costs vary and this plan promises no completion.");
  return { gameId, status: game.status, dualVersion: version, job: job ? { status: job.status, currentStep: job.currentStep } : null,
    budget: { capMicroUsd: audit.capMicroUsd, committedMicroUsd: audit.committedMicroUsd, settledMicroUsd: audit.settledMicroUsd,
      reservedMicroUsd: audit.reservedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd, held: audit.held,
      pendingRequests: audit.pendingRequestKeys.length, unknownRequests: audit.unknownRequestKeys.length },
    hides, nextQuestions, summary: { ...counts, paidQuestionsStillNeeded, questionReserveMicroUsd, nextQuestion, nextQuestionFits, notes } };
}
