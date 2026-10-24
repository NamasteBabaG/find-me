import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { boardConditioningHash as hash } from './board-conditioned-source';
import { detectiveTailReceiptSchema, detectivesTailId, detectivesTailResumeId, DETECTIVES_TAIL_ACTION, DETECTIVES_TAIL_RESUMED } from '../../domain/generation/detectives-completion-budget';
import { sourceBodyMarker, sourceBodyMarkerSchema, SOURCE_BODY_REPAIR_VERSION } from '../../domain/scene/source-body-repair';
import { SOURCE_BODY_REPAIR_MANIFEST, SOURCE_BODY_REPAIR_MANIFEST_SHA256, assertSourceBodyManifest } from '../../../content/detectives/source-body-repair';
export const SOURCE_BODY_REPAIR_ACTION = 'generation:source-body-geometry-repair/v1';
export const sourceBodyRepairId = (gameId: string) => 'aud_source_body_' + gameId;
const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const sourceBodySelectionSchema = z.object({ rowId: id, hideId: id, sourceRowSha256: digest, rowInvariantSha256: digest, previousJudgeSha256: digest,
    previousJudgeJson: z.string().max(250000), originalAttempts: z.number().int().min(3).max(4), authorizedAttempt: z.number().int().min(4).max(5), requestKey: z.string().min(1).max(240) }).strict();
const bodySchema = z.object({ version: z.literal(SOURCE_BODY_REPAIR_VERSION), gameId: id, ownerId: id, worldId: z.string(), jobId: id, jobAttempts: z.number().int().nonnegative(),
    tailAuthorizationSha256: digest, familySha256: digest, manifestSha256: digest, capMicroUsd: z.literal(10000000), ledgerRevision: z.number().int().nonnegative(), ledgerSha256: digest,
    holdSha256: digest, selected: z.array(sourceBodySelectionSchema).length(2), protectedRows: z.array(z.object({ rowId: id, rowSha256: digest }).strict()).length(25), createdAt: z.string().datetime() }).strict();
export const sourceBodyPinSchema = bodySchema.extend({ authorizationSha256: digest }).strict();
export type SourceBodyPin = z.infer<typeof sourceBodyPinSchema>;
export const sourceBodyRowHash = (row: Record<string, unknown>) => hash(Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'targetInstance')));
export const sourceBodyRowInvariant = (row: Record<string, unknown>) => hash(Object.fromEntries(Object.entries(row).filter(([k]) => !['attempts', 'status', 'lastError', 'updatedAt', 'judgeJson', 'targetInstance'].includes(k))));
type Reader = Pick<Prisma.TransactionClient, 'auditLog'>;
/** Immutable normal SYSTEM adoption, chained to the consumed owner ten-dollar receipt. No additional capacity. */
export async function readSourceBodyRepairPin(db: Reader, gameId: string): Promise<SourceBodyPin | null> {
    const row = await db.auditLog.findUnique({ where: { id: sourceBodyRepairId(gameId) } });
    if (!row)
        return null;
    assertSourceBodyManifest();
    const p = sourceBodyPinSchema.parse(JSON.parse(row.metaJson ?? 'null')), { authorizationSha256, ...body } = p;
    if (row.actorType !== 'SYSTEM' || row.actorId !== null || row.action !== SOURCE_BODY_REPAIR_ACTION || row.entityType !== 'Game' || row.entityId !== gameId || p.gameId !== gameId || p.worldId !== gameId + ':board-wizard' || p.manifestSha256 !== SOURCE_BODY_REPAIR_MANIFEST_SHA256 || hash(body) !== authorizationSha256 || row.metaJson !== JSON.stringify(p))
        throw Error('SOURCE_BODY: invalid adoption receipt');
    const rows = await db.auditLog.findMany({ where: { id: { in: [detectivesTailId(gameId), detectivesTailResumeId(gameId), 'aud_source_family_' + gameId] } } });
    const grant = rows.find(r => r.id === detectivesTailId(gameId)), wake = rows.find(r => r.id === detectivesTailResumeId(gameId)), family = rows.find(r => r.id === 'aud_source_family_' + gameId);
    const t = detectiveTailReceiptSchema.parse(JSON.parse(grant?.metaJson ?? 'null')), { authorizationSha256: ta, ...tb } = t;
    const w = JSON.parse(wake?.metaJson ?? 'null');
    if (!grant || grant.actorType !== 'ADMIN' || grant.actorId !== t.ownerId || grant.action !== DETECTIVES_TAIL_ACTION || grant.entityId !== gameId || t.gameId !== gameId || t.ownerId !== p.ownerId || t.capMicroUsd !== p.capMicroUsd || ta !== p.tailAuthorizationSha256 || hash(tb) !== ta || !wake || wake.actorType !== 'SYSTEM' || wake.actorId !== null || wake.entityId !== gameId || wake.action !== DETECTIVES_TAIL_RESUMED || w.authorizationSha256 !== ta || w.holdSha256 !== t.holdSha256 || !family || family.actorType !== 'SYSTEM' || family.actorId !== null || family.entityId !== gameId || hash(family.metaJson) !== p.familySha256)
        throw Error('SOURCE_BODY: original authority chain changed');
    if (new Set(p.selected.map(s => s.rowId)).size !== 2 || new Set(p.selected.map(s => s.hideId)).size !== 2 || p.selected.some(s => s.authorizedAttempt !== s.originalAttempts + 1 || hash(s.previousJudgeJson) !== s.previousJudgeSha256 || !t.tailRows.some(old => old.rowId === s.rowId && old.hideId === s.hideId && old.maxAttempt === s.originalAttempts)))
        throw Error('SOURCE_BODY: finite original exhausted rows changed');
    for(const selected of p.selected){const g=SOURCE_BODY_REPAIR_MANIFEST.entries.find(g=>g.hideId===selected.hideId),original=g?.boardId==='paris'?4:3,pose=g?.boardId==='paris'?'crouching':'standing';if(!g||selected.originalAttempts!==original||selected.authorizedAttempt!==original+1||selected.requestKey!==g.hideId+':'+pose+':render:'+(original+1))throw Error('SOURCE_BODY: wrong source repair purchase key or counter');}
    if(new Set(p.protectedRows.map(r=>r.rowId)).size!==25||p.protectedRows.some(r=>p.selected.some(s=>s.rowId===r.rowId)))throw Error('SOURCE_BODY: protected variant inventory changed');
    return p;
}
export function sourceBodyMarkerFor(p: SourceBodyPin, s: SourceBodyPin['selected'][number]) { return sourceBodyMarkerSchema.parse({ version: SOURCE_BODY_REPAIR_VERSION, authorizationSha256: p.authorizationSha256, manifestSha256: p.manifestSha256, rowId: s.rowId, sourceRowSha256: s.sourceRowSha256, previousJudgeSha256: s.previousJudgeSha256, originalAttempts: s.originalAttempts, authorizedAttempt: s.authorizedAttempt }); }
export function sourceBodyPurchaseCandidate(p: SourceBodyPin, row: {
    id: string;
    status: string;
    attempts: number;
    judgeJson: string | null;
}) { const s = p.selected.find(s => s.rowId === row.id); if (!s)
    return false; if (row.status === 'FAILED' && row.attempts === s.originalAttempts)
    return sourceBodyRowHash(row as unknown as Record<string, unknown>) === s.sourceRowSha256; return row.status === 'PENDING' && row.attempts === s.authorizedAttempt && hash(sourceBodyMarker(row)) === hash(sourceBodyMarkerFor(p, s)) && sourceBodyRowInvariant(row as unknown as Record<string, unknown>) === s.rowInvariantSha256; }
export async function sourceBodyPublicationAuthorized(db: Reader, input: {
    gameId: string;
    variantId: string;
    hideId: string;
    attempts: number;
    sceneVersion: number;
    judgeJson: string | null;
}) {
    try {
        const p = await readSourceBodyRepairPin(db, input.gameId), m = sourceBodyMarker(input);
        if (!p || !m || input.sceneVersion !== 13)
            return false;
        const s = p.selected.find(s => s.rowId === input.variantId && s.hideId === input.hideId);
        return !!s && input.attempts === s.authorizedAttempt && hash(m) === hash(sourceBodyMarkerFor(p, s));
    }
    catch {
        return false;
    }
}
export async function fenceSourceBodyPurchase(db: Pick<Prisma.TransactionClient, 'auditLog' | 'targetVariantAsset'>, gameId: string, rowId: string, marker: unknown) { const p = await readSourceBodyRepairPin(db, gameId), s = p?.selected.find(s => s.rowId === rowId), row = await db.targetVariantAsset.findFirst({ where: { id: rowId, targetInstance: { gameScene: { gameId, sceneVersion: 13 } } } }); if (!p || !s || !row || hash(marker) !== hash(sourceBodyMarkerFor(p, s)) || !sourceBodyPurchaseCandidate(p, row))
    throw Error('SOURCE_BODY: concurrent finite purchase checkpoint changed'); }
