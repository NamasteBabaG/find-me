import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { readAssetBuffer } from "../asset.service";
import { avatarDisplayFromSheet } from "../../infra/generation/avatar-cut";
import type { CropBox } from "../../infra/generation/types";
import { boardWizardBudgetOf, boardWizardWorldId, reserveBoardWizardIdentity } from "./board-conditioned-wizard";
import { generateBoardWizardIdentity, holdBoardWizardIdentity, withBoardWizardIdentityClaim, type BoardWizardIdentityClaim } from "./board-wizard-identity-lifecycle";
import { IDENTITY_GATE_ACTION, IDENTITY_SELECTION_POLICY, identityGateReceiptSchema, identityProvenanceSchema,
  identityReceiptReadyForPublication, reviewBoardWizardIdentity, type IdentityGateReceipt } from "./board-wizard-identity-gate";
import { requireLocalPatchIdentityTime } from "./local-patch-identity";
import { boardConditioningHash } from "./board-conditioned-source";

const idsSchema = z.object({ identityAssetId: z.string().min(1), avatarAssetId: z.string().min(1) }).strict();
const checkpointSchema = z.object({ policy: z.literal(IDENTITY_SELECTION_POLICY), first: idsSchema,
  second: idsSchema.optional(), selected: idsSchema.optional() }).strict();
type Checkpoint = z.infer<typeof checkpointSchema>;
export const IDENTITY_CANDIDATE_ACTION = "identity-best-of-two:candidate";
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error(`IDENTITY_SELECTION: ${message}`); }

/** A side-by-side visual choice, not a pass/fail gate for likeness. Technical
 * unusability still matters: a cut/unusable sheet cannot feed the patch engine. */
export function chooseIdentityCandidate(first: IdentityGateReceipt, second?: IdentityGateReceipt): 1 | 2 | null {
  const usable1 = first.checks?.sheetLayout === "pass", usable2 = second?.checks?.sheetLayout === "pass";
  if (!usable1 && !usable2) return null;
  if (!usable1) return 2;
  if (!usable2) return 1;
  if (second?.comparison?.preferredCandidate) return second.comparison.preferredCandidate === "second" ? 2 : 1;
  // Defensive fallback when no comparative preference is available. Never buy
  // a third candidate simply to resolve a subjective tie.
  const rank = (r: IdentityGateReceipt) => (r.checks?.identity === "pass" ? 4 : r.checks?.identity === "uncertain" ? 2 : 0)
    + (r.checks?.age === "pass" ? 1 : 0);
  return second && rank(second) > rank(first) ? 2 : 1;
}

async function saveCheckpoint(tx: Prisma.TransactionClient, jobId: string, value: Checkpoint) {
  const job = await tx.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  await tx.generationJob.update({ where: { id: jobId }, data: {
    stepsJson: JSON.stringify({ ...JSON.parse(job.stepsJson), identityBestOfTwo: checkpointSchema.parse(value) }),
  } });
}

/** Current catalog only. At most two identity renders and two reviews across
 * all ticks. No new parent step, no unbounded retries, no weakened spend fence.
 * The first candidate stays retained until selection completes. */
export async function selectBestIdentity(c: Container, initialClaim: BoardWizardIdentityClaim, input: {
  atlas: Buffer; contentVersion: 9 | 10; deadlineAt?: number; preflight(): Promise<void>;
}): Promise<BoardWizardIdentityClaim | null> {
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(initialClaim.gameId);
  let claim = initialClaim;
  demand(claim.identityAssetId && claim.avatarAssetId && claim.ageYears && c.avatars.createCharacter, "Complete candidate/provider required");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
  const saved = JSON.parse(job.stepsJson).identityBestOfTwo;
  let checkpoint: Checkpoint = saved ? checkpointSchema.parse(saved) : {
    policy: IDENTITY_SELECTION_POLICY, first: { identityAssetId: claim.identityAssetId, avatarAssetId: claim.avatarAssetId },
  };
  const expectedCurrent = checkpoint.selected ?? checkpoint.second ?? checkpoint.first;
  demand(expectedCurrent.identityAssetId === claim.identityAssetId && expectedCurrent.avatarAssetId === claim.avatarAssetId, "Checkpoint/child differ");
  if (checkpoint.selected) return claim; // Enrollment rechecks selection, pixels and billing.
  if (!saved) await withBoardWizardIdentityClaim(c, claim, tx => saveCheckpoint(tx, claim.jobId, checkpoint));

  const photo = await readAssetBuffer(c, claim.photoAssetId);
  const firstSheet = await readAssetBuffer(c, checkpoint.first.identityAssetId);
  const review = async (ids: z.infer<typeof idsSchema>, compare = false) => {
    const painted = await c.db.auditLog.findFirst({ where: { action: "sheet:painted", entityType: "Asset", entityId: ids.identityAssetId }, orderBy: { createdAt: "desc" } });
    const provenance = identityProvenanceSchema.parse(JSON.parse(painted?.metaJson ?? "{}").identityProvenance);
    return reviewBoardWizardIdentity({ db: c.db, apiKey: env().OPENAI_API_KEY!, budget,
      beforeDispatch: async () => { await input.preflight(); requireLocalPatchIdentityTime(input.deadlineAt, 115_000);
        await withBoardWizardIdentityClaim(c, claim, async () => undefined); },
      write: work => withBoardWizardIdentityClaim(c, claim, work),
    }, { gameId: claim.gameId, identityAssetId: ids.identityAssetId, sheet: compare ? await readAssetBuffer(c, ids.identityAssetId) : firstSheet,
      photo, atlas: input.atlas, provenance, contentVersion: input.contentVersion, deadlineAt: input.deadlineAt,
      ...(compare ? { compareWith: { identityAssetId: checkpoint.first.identityAssetId, sheet: firstSheet } } : {}) });
  };
  const first = await review(checkpoint.first);
  // Known subjective findings are a reason to improve, not an operator hold.
  // Unresolved transport/billing is NOT subjective likeness and cannot spend on.
  if (!first.checks || (await budget.audit(worldId)).held) {
    await holdBoardWizardIdentity(c, claim, "unresolved-identity"); return null;
  }
  let reason: "first-sufficient" | "best-of-two" | "budget-fallback" = "first-sufficient";
  let second: IdentityGateReceipt | undefined;
  if (!identityReceiptReadyForPublication(first, input.contentVersion) || checkpoint.second) {
    reason = "best-of-two";
    if (!checkpoint.second) {
      // The existing $4 world ceiling includes the second image ($0.50 reserve)
      // and its single comparison ($0.04 reserve); no ceiling increase.
      if ((await budget.audit(worldId)).remainingMicroUsd < 540_000) reason = "budget-fallback";
      else {
        await input.preflight(); requireLocalPatchIdentityTime(input.deadlineAt, 175_000);
        const feedback = JSON.stringify({ checks: first.checks, reason: first.reason });
        const provenance = identityProvenanceSchema.parse({ ...first.provenance,
          repair: { policy: IDENTITY_SELECTION_POLICY, feedbackSha256: boardConditioningHash(feedback) } });
        const ok = await generateBoardWizardIdentity(c, claim, { attempt: 2, provenance,
          reserve: () => reserveBoardWizardIdentity(c, claim.gameId, { policy: IDENTITY_SELECTION_POLICY,
            firstIdentityAssetId: checkpoint.first.identityAssetId, provenance, model: "gpt-image-2", attempts: 1 }, 2),
          generate: async () => {
            const character = await c.avatars.createCharacter!({ originalPhoto: photo, mimeType: "image/png",
              crop: provenance.crop as CropBox | null, childName: claim.childName, ageYears: claim.ageYears,
              styleRef: input.atlas, qaStyleContract: provenance.style, identityRepair: { reason: feedback },
              ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt - 25_000 }) });
            return { ...character, avatarPng: await avatarDisplayFromSheet(character.sheetPng, character.sheetWidth), avatarWidth: 512, avatarHeight: 512 };
          },
          onPersisted: async (tx, ids) => {
            checkpoint = { ...checkpoint, second: ids };
            await saveCheckpoint(tx, claim.jobId, checkpoint);
            await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: IDENTITY_CANDIDATE_ACTION,
              entityType: "Game", entityId: claim.gameId, metaJson: JSON.stringify({ childId: claim.childId, first: checkpoint.first, second: ids }) } });
          },
        });
        if (!ok) return null;
        demand(checkpoint.second, "Second candidate was not retained");
        claim = { ...claim, ...idsSchema.parse(checkpoint.second) };
      }
    }
    if (checkpoint.second) second = await review(checkpoint.second, true);
  }
  if ((await budget.audit(worldId)).held) { await holdBoardWizardIdentity(c, claim, "unresolved-identity"); return null; }
  const winner = chooseIdentityCandidate(first, second);
  if (!winner) { await holdBoardWizardIdentity(c, claim, "identity-style-review-required"); return null; }
  const selected = winner === 2 ? checkpoint.second! : checkpoint.first, selectedReview = winner === 2 ? second! : first;
  const receipt = identityGateReceiptSchema.parse({ ...selectedReview, automaticSelection: {
    policy: IDENTITY_SELECTION_POLICY, sourceFingerprint: selectedReview.fingerprint,
    candidates: [checkpoint.first.identityAssetId, ...(checkpoint.second ? [checkpoint.second.identityAssetId] : [])],
    selectedIdentityAssetId: selected.identityAssetId, reason,
  } });
  demand(identityReceiptReadyForPublication(receipt, input.contentVersion), "Selected image is technically unusable");
  await withBoardWizardIdentityClaim(c, claim, async tx => {
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: IDENTITY_GATE_ACTION,
      entityType: "Asset", entityId: selected.identityAssetId, metaJson: JSON.stringify(receipt) } });
    await tx.childProfile.update({ where: { id: claim.childId }, data: selected });
    checkpoint = { ...checkpoint, selected };
    await saveCheckpoint(tx, claim.jobId, checkpoint);
  });
  return { ...claim, ...selected };
}
