import { kingdomDefaultTailPeak, KINGDOM_APPEARANCE_COUNT } from '../../domain/generation/kingdom-generation';
import { localPatchReadyReviewOwed } from '../../domain/scene/local-patch-progress';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
import { localPatchEvidenceRecovery } from './local-patch-review-recovery';
import type { Container } from '../container';

/** Re-read committed cash and all full holds immediately before new work.
 * A ready paid asset owes a review. Missing, failed or unverified art owes a painting too. */
export async function kingdomDefaultTail(c: Container, gameId: string, worldId: string,
  review?: { variantId: string; requestKey: string; fingerprint: string; reserveMicroUsd: number }) {
  const budget = boardWizardBudgetOf(c);
  const audit = await budget.audit(worldId);
  const rows = await c.db.targetVariantAsset.findMany({
    where: { variant: 'A', provider: 'local-patch', targetInstance: { gameScene: { gameId } } },
    select: { id: true, assetId: true, status: true, judgeJson: true, lastError: true, updatedAt: true },
  });
  const ready = rows.filter(row => row.assetId && (row.status === 'GENERATED' || row.id === review?.variantId
    || localPatchEvidenceRecovery(row)?.retry));
  const completed = ready.filter(row => row.status === 'GENERATED' && !localPatchReadyReviewOwed(row, { required: true })).length;
  const paints = KINGDOM_APPEARANCE_COUNT - ready.length, reviewsOnly = ready.length - completed;
  const peak = kingdomDefaultTailPeak(paints, reviewsOnly);
  // A worker can stop after making the pending reservation and before claiming the create.
  // The same reservation is already included in the projection. Count it once; change no ledger entries.
  const held = review && audit.pendingRequestKeys.includes(review.requestKey) ? await budget.readRequest(worldId, review.requestKey) : null;
  const samePending = held?.state === 'pending' && held.scope === 'judge' && !held.conflicts.length
    && held.operationFingerprint === review?.fingerprint && held.reserveMicroUsd === review?.reserveMicroUsd;
  const available = audit.remainingMicroUsd + (samePending ? held.reserveMicroUsd : 0);
  return {
    fits: audit.capMicroUsd === 4_000_000 && audit.overCapMicroUsd === 0 && available >= peak,
    pending: audit.pendingRequestKeys.length > (samePending ? 1 : 0),
    reason: 'Kingdom Flex overload: the Default tail needs ' + peak + ' micro-USD of observed peak coverage ('
      + paints + ' paintings and ' + reviewsOnly + ' review-only appearances); '
      + available + ' micro-USD cover this tail after accounting for existing reservations.',
  };
}
