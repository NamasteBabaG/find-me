import { Prisma } from '@prisma/client';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { DbStorage } from '../../infra/storage/db';
import { auditWorldBudget } from './world-budget';
import { boardConditioningHash as hash } from './board-conditioned-source';
import { detectivesSourceBodyRepairState } from './detectives-completion-budget';
import { SOURCE_BODY_REPAIR_MANIFEST, SOURCE_BODY_REPAIR_MANIFEST_SHA256, assertSourceBodyManifest } from '../../../content/detectives/source-body-repair';
import { SOURCE_BODY_REPAIR_VERSION } from '../../domain/scene/source-body-repair';
import { sourceBodyPinSchema, sourceBodySelectionSchema, sourceBodyRepairId, sourceBodyRowHash, sourceBodyRowInvariant, sourceBodyMarkerFor, sourceBodyPurchaseCandidate, readSourceBodyRepairPin, SOURCE_BODY_REPAIR_ACTION } from './source-body-repair-pin';
import { parkedHoldSha256 } from './lean-review-recovery-pin';
import { backgroundReviewWaiting } from './continuity-background';
import { GUIDED_FRAME_MIN_CAPACITY_MICRO_USD } from '../../domain/generation/guided-frame-recovery';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { sha256Bytes } from './fixed-sprite';
const demand = (ok: unknown, why: string): void => { if (!ok)
    throw Error('SOURCE_BODY: ' + why); };
export async function planSourceBodyGeometryRepair(c: Container, gameId: string) {
    assertSourceBodyManifest();
    demand(env().APP_ENV === 'qa' && c.storage.id === 'db', 'QA database required');
    demand(!await readSourceBodyRepairPin(c.db, gameId), 'One geometry adoption only');
    const a = await detectivesSourceBodyRepairState(c, gameId), { pin, state, stored, job, rows } = a;
    demand(state.game.status === 'TARGETS_GENERATING' && !state.game.configJson && !state.game.readyAt && job.status === 'FAILED' && job.currentStep === 'local-patch:recovery-exhausted' && job.attempts > pin.jobAttempts, 'Concluded original finite tail required');
    const budget = auditWorldBudget(stored.snapshot, 10000000);
    demand(!budget.held && !budget.pendingRequestKeys.length && !budget.conflictRequestKeys.length && !budget.overrunRequestKeys.length && budget.remainingMicroUsd >= 2 * GUIDED_FRAME_MIN_CAPACITY_MICRO_USD, 'Same existing cap must cover two finite images and one LOW each');
    demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, 'Pending provider work must finish first');
    const failed = rows.filter(r => r.status === 'FAILED'), accepted = rows.filter(r => r.status === 'GENERATED');
    demand(rows.length === 27 && failed.length === 2 && accepted.length === 25, 'Exactly two diagnosed failures and 25 protected results required');
    const selected = [];
    for (const row of failed) {
        const j = JSON.parse(row.judgeJson ?? 'null'), old = pin.tailRows.find(s => s.rowId === row.id), g = SOURCE_BODY_REPAIR_MANIFEST.entries.find(g => g.hideId === old?.hideId);
        demand(g&&old,'Only the two original exhausted source hides are eligible');
        demand(row.attempts===old!.maxAttempt,'Original finite-tail image counter changed');
        demand(j?.authoredReturn?.source?.sha256===g!.sourceSha256,'Original source-body art binding changed');
        demand(hash(j.authoredReturn.local)===hash(g!.parentReturnRect),'Original source-body return geometry changed');
        const known = g!.boardId === 'paris' ? row.attempts === 4 && j.reviewState === 'board-review-complete' && j.wireFault === null && j.verdict?.verdict === 'fail' && j.verdict?.pictureWhole === 'fail' && j.verdict?.neighborsIntact === 'fail' : row.attempts === 3 && j.renderFault?.startsWith('quality-seam:') && j.seam?.verdict === 'background-rewritten' && j.seam.shift?.dx === 0 && j.seam.shift?.dy === 0 && j.compositionPermission === 'refused';
        demand(known, 'A genuine conclusive body/background refusal is required');
        const pose = g!.boardId === 'paris' ? 'crouching' : 'standing', requestKey = g!.hideId + ':' + pose + ':render:' + (row.attempts + 1);
        demand(!stored.snapshot.requests.some(r => r.requestKey === requestKey) && !await new PrismaRetainedPurchaseStore(c.db).get(pin.worldId, requestKey), 'Corrected geometry purchase must be new, never replayed or duplicated');
        selected.push(sourceBodySelectionSchema.parse({ rowId: row.id, hideId: g!.hideId, sourceRowSha256: sourceBodyRowHash(row), rowInvariantSha256: sourceBodyRowInvariant(row), previousJudgeJson: row.judgeJson!, previousJudgeSha256: hash(row.judgeJson), originalAttempts: row.attempts, authorizedAttempt: row.attempts + 1, requestKey }));
    }
    demand(new Set(selected.map(s => s.hideId)).size === 2, 'Both distinct public corrections required');
    for (const row of accepted) {
        const j = JSON.parse(row.judgeJson ?? 'null'), scene = state.game.scenes.find(s => s.id === row.targetInstance.gameSceneId), asset = row.assetId ? await c.db.asset.findUnique({ where: { id: row.assetId } }) : null;
        demand(scene && asset && j.reviewState === 'board-review-complete' && j.verdict?.verdict === 'pass' && j.wireFault === null && await hasLocalPatchPublicationPolicy(c, { gameId, sceneVersion: 13, hideId: j.hide, variantId: row.id, attempts: row.attempts, assetId: asset!.id, imageSha256: sha256Bytes(await c.storage.get(asset!.storagePath)), geometrySha256: localPatchPublicationGeometryHash(row), identityAssetId: pin.identityAssetId, identitySha256: pin.identitySha256, judgeJson: row.judgeJson }), 'Every protected result retains its real publication evidence');
    }
    const family = await c.db.auditLog.findUniqueOrThrow({ where: { id: 'aud_source_family_' + gameId } });
    const body = { version: SOURCE_BODY_REPAIR_VERSION, gameId, ownerId: pin.ownerId, worldId: pin.worldId, jobId: pin.jobId, jobAttempts: job.attempts, tailAuthorizationSha256: pin.authorizationSha256, familySha256: hash(family.metaJson), manifestSha256: SOURCE_BODY_REPAIR_MANIFEST_SHA256, capMicroUsd: 10000000 as const, ledgerRevision: stored.revision, ledgerSha256: hash(stored.snapshot), holdSha256: parkedHoldSha256(job), selected, protectedRows: accepted.map(r => ({ rowId: r.id, rowSha256: sourceBodyRowHash(r) })), createdAt: new Date().toISOString() };
    return { ...a, receipt: sourceBodyPinSchema.parse({ ...body, authorizationSha256: hash(body) }) };
}
/** One qualified software-repair wake. The owner's existing cap is unchanged; no art decision, reset or extra planner. */
export async function resumeSourceBodyGeometryRepair(c: Container, gameId: string) {
    if (env().APP_ENV !== 'qa' || c.storage.id !== 'db' || await c.db.auditLog.findUnique({ where: { id: sourceBodyRepairId(gameId) } }))
        return false;
    const p = await planSourceBodyGeometryRepair(c, gameId), receipt = p.receipt;
    return c.db.$transaction(async (tx) => {
        const scoped = { ...c, db: tx as Container['db'], storage: new DbStorage(tx) }, fresh = await detectivesSourceBodyRepairState(scoped, gameId);
        demand(fresh.job.status === 'FAILED' && fresh.job.attempts === receipt.jobAttempts && parkedHoldSha256(fresh.job) === receipt.holdSha256 && fresh.stored.revision === receipt.ledgerRevision && hash(fresh.stored.snapshot) === receipt.ledgerSha256 && fresh.pin.authorizationSha256 === receipt.tailAuthorizationSha256, 'Live hold, authority or ledger changed');
        demand(fresh.rows.length === 27 && receipt.protectedRows.every(r => fresh.rows.some(f => f.id === r.rowId && sourceBodyRowHash(f) === r.rowSha256)) && receipt.selected.every(r => fresh.rows.some(f => f.id === r.rowId && sourceBodyRowHash(f) === r.sourceRowSha256)), 'Previously reviewed rows changed');
        const locked = await tx.game.updateMany({ where: { id: gameId, status: 'TARGETS_GENERATING', deletedAt: null, updatedAt: fresh.state.game.updatedAt, ownerId: receipt.ownerId }, data: { updatedAt: new Date() } });
        const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: receipt.worldId, revision: receipt.ledgerRevision }, data: { revision: { increment: 1 } } });
        const resumed = await tx.generationJob.updateMany({ where: { id: receipt.jobId, gameId, status: 'FAILED', attempts: receipt.jobAttempts, currentStep: 'local-patch:recovery-exhausted', updatedAt: fresh.job.updatedAt, lastError: fresh.job.lastError }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
        demand(locked.count === 1 && ledger.count === 1 && resumed.count === 1, 'Concurrent source geometry wake changed');
        await tx.auditLog.create({ data: { id: sourceBodyRepairId(gameId), actorType: 'SYSTEM', action: SOURCE_BODY_REPAIR_ACTION, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(receipt) } });
        return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
export async function requireSourceBodyPurchase(c: Container, gameId: string, rowId: string) {
    const p = await readSourceBodyRepairPin(c.db, gameId);
    demand(p, 'No geometry repair adoption');
    const rows = await c.db.targetVariantAsset.findMany({ where: { id: rowId, targetInstance: { gameScene: { gameId, sceneVersion: 13 } } } }), row = rows[0];
    demand(row && sourceBodyPurchaseCandidate(p!, row), 'No current bound geometry purchase');
    const budget = await (await import('./board-conditioned-wizard')).boardWizardBudgetOf(c).audit(gameId + ':board-wizard');
    demand(budget.capMicroUsd === 10000000 && !budget.held, 'Original world budget gate remains required');
    return { pin: p!, selected: p!.selected.find(s => s.rowId === rowId)!, marker: sourceBodyMarkerFor(p!, p!.selected.find(s => s.rowId === rowId)!) };
}
