import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { env } from '../../lib/env';
import { BOUND_SOURCE_NEIGHBOR_READER, readQuestionBoundSourceNeighborEnvelope } from '../../domain/generation/bound-source-neighbor-envelope';
import { BOUND_SOURCE_CONTRACT_READER, readQuestionBoundSourceContractEnvelope,
  type BoundSourceNeighborReadingMarker } from '../../domain/generation/bound-source-contract-envelope';
import { BACKGROUND_REVIEW_TRANSPORT, type BackgroundReviewBinding } from '../../domain/generation/background-review-round';
import { isSingleMediumReviewPolicy } from '../../domain/generation/visual-review-policy';
import { readSingleVisualReview } from '../../domain/generation/single-visual-review';
import type { QualityStage } from './local-patch-dual-evidence';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonicalBinding = (b: BackgroundReviewBinding) => ({ hideId: b.hideId, variantId: b.variantId,
  imageSha256: b.imageSha256, geometrySha256: b.geometrySha256, identitySha256: b.identitySha256,
  ...(b.authoredReviewBinding === undefined ? {} : { authoredReviewBinding: b.authoredReviewBinding }) });

/** Read-only. A marker can name this reading only if the immutable dispatched
 * question, completed provider round, retained payload, bill and all candidate
 * bindings still agree. It grants neither a provider call nor an art approval. */
export async function authenticateBoundSourceNeighborReading(db: Prisma.TransactionClient, input: {
  gameId: string; worldId: string; binding: BackgroundReviewBinding; stage: QualityStage; questionBodySha256?: string;
}): Promise<BoundSourceNeighborReadingMarker | null> {
  try {
    const { stage, binding } = input;
    if (env().APP_ENV !== 'qa' || input.worldId !== input.gameId + ':board-wizard' || !isSingleMediumReviewPolicy(stage.policy)
      || !stage.sourceNeighbors || stage.sourceNeighbors.binding.candidateSha256 !== binding.imageSha256) return null;
    const outer = readSingleVisualReview(stage.raw);
    if (!outer || outer.doubt) return null;
    const expected = { contract: stage.sourceNeighbors.contract, binding: stage.sourceNeighbors.binding };
    const reader = readQuestionBoundSourceNeighborEnvelope(outer.assessment, expected) ? BOUND_SOURCE_NEIGHBOR_READER
      : readQuestionBoundSourceContractEnvelope(outer.assessment, expected) ? BOUND_SOURCE_CONTRACT_READER : null;
    if (!reader) return null;
    const { verifiedDualStage } = await import('./local-patch-dual-evidence');
    const paid = await verifiedDualStage(db, input.worldId, stage, 'scene-quality',
      { allowSingle: true, authoredReviewBinding: binding.authoredReviewBinding });
    if (!paid) return null;
    const { backgroundRoundOfKey } = await import('./continuity-background');
    const round = await backgroundRoundOfKey(db, input.gameId, input.worldId, stage.requestKey);
    if (!round || round.intent.gameId !== input.gameId || round.intent.worldId !== input.worldId
      || round.intent.requestKey !== stage.requestKey || round.intent.fingerprint !== stage.fingerprint
      || round.intent.policyVersion !== stage.policy.version || !isDeepStrictEqual(round.intent.binding, binding)
      || !/^[a-f0-9]{64}$/.test(round.intent.bodySha256)
      || input.questionBodySha256 !== undefined && round.intent.bodySha256 !== input.questionBodySha256
      || round.terminal?.kind !== 'outcome' || round.terminal.state !== 'answered' || round.terminal.providerStatus !== 'completed') return null;
    const wire = JSON.parse(paid.bytes.toString('utf8'));
    if (round.terminal.responseId !== wire.responseId || wire.requestId !== wire.responseId
      || paid.evidence.providerRequestId !== wire.responseId || wire.providerStatus !== 'completed'
      || wire.transport !== BACKGROUND_REVIEW_TRANSPORT || wire.raw !== stage.raw) return null;
    return { version: reader, sourceRequestKey: stage.requestKey, sourceFingerprint: stage.fingerprint,
      sourcePayloadSha256: hash(paid.bytes), rawSha256: hash(stage.raw!), questionBodySha256: round.intent.bodySha256,
      questionBindingSha256: hash(JSON.stringify(canonicalBinding(binding))), roundId: round.intent.roundId };
  } catch { return null; }
}
