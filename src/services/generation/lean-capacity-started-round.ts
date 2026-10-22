import type { Prisma } from "@prisma/client";
import type { LeanCapacityReceipt } from "../../domain/generation/lean-capacity-recovery";
import { capacityFailureCode } from "../../domain/generation/lean-capacity-recovery";
import type { BackgroundReviewRound } from "../../domain/generation/background-review-round";
import type { EvidenceRole } from "../../domain/scene/local-patch-evidence-policy";
import { leanReviewPolicyOf } from "../../domain/generation/visual-review-policy";
import { backgroundRoundOfKey, backgroundRoundsOnImage, SOL_BACKGROUND_ACTION } from "./continuity-background";
import { leanCapacityRecoveryOf } from "./lean-capacity-recovery-pin";
import { parkedHoldSha256 } from "./lean-review-recovery-pin";
import { sha256Bytes } from "./fixed-sprite";

type Db = Pick<Prisma.TransactionClient, "auditLog">;
type Candidate = { readonly requestKey: string; readonly fingerprint: string; readonly role: EvidenceRole };
type StartedAnchor = { readonly version: "capacity-started-flex/v1"; readonly requestKey: string;
  readonly fingerprint: string; readonly intentSha256: string; readonly createdAt: string };
export type CapacityRoundAdmission = { readonly kind: "held" | "default" }
  | { readonly kind: "started-flex"; readonly anchor: StartedAnchor };

async function ownIntent(db: Db, round: BackgroundReviewRound) {
  const row = await db.auditLog.findUnique({ where: { id: "aud_sb_" + round.intent.roundId + "_intent" } });
  if (!row || row.actorType !== "SYSTEM" || row.actorId !== null || row.entityType !== "Game"
    || row.entityId !== round.intent.gameId || row.action !== SOL_BACKGROUND_ACTION) return null;
  let event;
  try { event = JSON.parse(row.metaJson ?? "null"); } catch { return null; }
  return event?.kind === "intent" && JSON.stringify(event.intent) === JSON.stringify(round.intent) ? row : null;
}

/** Scope of an already evidenced capacity failure; never reserves, dispatches or approves art. */
export async function capacityReviewRoundAdmission(db: Db, pin: LeanCapacityReceipt, round: BackgroundReviewRound,
  candidates: readonly Candidate[] = []): Promise<CapacityRoundAdmission | null> {
  if (round.intent.gameId !== pin.gameId || round.intent.worldId !== pin.worldId
    || round.intent.binding.identitySha256 !== pin.identitySha256
    || round.terminal?.kind !== "outcome" || round.terminal.state !== "unpriced"
    || round.terminal.providerStatus !== "failed" || !capacityFailureCode(round.terminal.errorCode)) return null;
  if (pin.heldRequestKeys.includes(round.intent.requestKey)) return { kind: "held" };
  const row = await ownIntent(db, round), authorizedAt = Date.parse(pin.authorizedAt);
  if (!row || !Number.isFinite(authorizedAt)) return null;
  const policy = leanReviewPolicyOf(round.intent.policyVersion ?? "");
  if (policy?.serviceTier === "default" && row.createdAt.getTime() >= authorizedAt) return { kind: "default" };
  if (policy?.serviceTier !== "flex") return null;
  const anchorOf = (one: BackgroundReviewRound, createdAt: Date): StartedAnchor => ({ version: "capacity-started-flex/v1",
    requestKey: one.intent.requestKey, fingerprint: one.intent.fingerprint,
    intentSha256: sha256Bytes(Buffer.from(JSON.stringify(one.intent))), createdAt: createdAt.toISOString() });
  // A persisted intent is the start of its immutable question, even if the old
  // hold prevented reservation/dispatch until after the grant.
  if (row.createdAt.getTime() < authorizedAt) return { kind: "started-flex", anchor: anchorOf(round, row.createdAt) };
  // Quality precedes continuity. A later Flex continuity may finish that same
  // prepared round only when its exact quality fingerprint already existed.
  // A new Flex quality question never acquires authority from an older image.
  if (policy.role !== "head-continuity") return null;
  for (const candidate of candidates) {
    if (candidate.role !== "quality") continue;
    const first = await backgroundRoundOfKey(db, pin.gameId, pin.worldId, candidate.requestKey);
    if (!first || first.intent.fingerprint !== candidate.fingerprint) continue;
    const firstPolicy = leanReviewPolicyOf(first.intent.policyVersion ?? "");
    if (firstPolicy?.serviceTier !== "flex" || firstPolicy.role !== "scene-quality"
      || (["hideId", "variantId", "imageSha256", "geometrySha256", "identitySha256"] as const)
        .some(field => first.intent.binding[field] !== round.intent.binding[field])) continue;
    const firstRow = await ownIntent(db, first);
    if (firstRow && firstRow.createdAt.getTime() < authorizedAt)
      return { kind: "started-flex", anchor: anchorOf(first, firstRow.createdAt) };
  }
  return null;
}

const MISSED_STARTED_ROUND = /^local-patch-continue-in-slice\/v1: (self-repair:board:[a-z0-9-]+:[a-f0-9]{64}): its record no longer matches an interruption this continuation admits on these pixels$/;

/** One bounded wake of the exact old-code refusal, not a general release of later holds. */
export async function boundLeanCapacityStartedRoundHold(db: Db, gameId: string,
  job: { id: string; updatedAt: Date; lastError: string | null }) {
  const requestKey = MISSED_STARTED_ROUND.exec(job.lastError ?? "")?.[1];
  if (!requestKey) return null;
  const pin = await leanCapacityRecoveryOf(db, gameId);
  if (!pin || pin.jobId !== job.id) return null;
  const round = await backgroundRoundOfKey(db, gameId, pin.worldId, requestKey);
  if (!round) return null;
  let admission = await capacityReviewRoundAdmission(db, pin, round);
  if (!admission && leanReviewPolicyOf(round.intent.policyVersion ?? "")?.role === "head-continuity") {
    // Wake eligibility may discover a recorded companion on these exact bindings; it buys nothing.
    // The actual continuation still rebuilds and supplies its exact candidates before admitting it.
    const companions = (await backgroundRoundsOnImage(db, gameId, round.intent.binding))
      .filter(one => one.role === "scene-quality" && one.tier === "flex")
      .map(one => ({ requestKey: one.requestKey, fingerprint: one.fingerprint, role: "quality" as const }));
    admission = await capacityReviewRoundAdmission(db, pin, round, companions);
  }
  if (admission?.kind !== "started-flex") return null;
  return { worldId: pin.worldId, jobId: pin.jobId, holdSha256: parkedHoldSha256(job),
    heldRequestKeys: [requestKey], ledgerSha256: pin.ledgerSha256 };
}
