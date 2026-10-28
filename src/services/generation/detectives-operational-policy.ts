import type { Prisma } from '@prisma/client';
import { detectiveSourceScopeOf, DETECTIVE_FAMILY_V2 } from './source-family-scope';
import { env } from '../../lib/env';
import { boardConditioningHash as hash } from './board-conditioned-source';
import { sourcePlacementReleaseOf } from './source-placement-release';
import { leanReleaseOf } from './lean-release';
import { dualVisualReviewVersion } from './visual-review-release';
import { subjectUpgradeOf } from './subject-enrollment';
import { DETECTIVES_OPERATIONAL_RELEASE, detectivesOperationalQualified, detectivesOperationalReceiptSchema, sourceBodyBirthMarkerSchema, SOURCE_BODY_BIRTH_VERSION, type DetectivesOperationalRelease, type DetectivesOperationalReceipt, type SourceBodyBirthMarker } from '../../domain/generation/detectives-operational-policy';
import { SOURCE_BODY_REPAIR_MANIFEST, SOURCE_BODY_REPAIR_MANIFEST_SHA256, assertSourceBodyManifest } from '../../../content/detectives/source-body-repair';
import { SINGLE_VISUAL_REVIEW_VERSION } from '../../domain/generation/single-visual-review';
export const DETECTIVES_OPERATIONAL_ACTION = 'generation:detectives-operational-policy/v1';
export const detectivesOperationalId = (gameId: string) => 'aud_detectives_operational_' + gameId;
type Reader = Pick<Prisma.TransactionClient, 'auditLog'>;
const demand = (v: unknown, why: string): void => { if (!v)
    throw Error('DETECTIVES_OPERATIONAL: ' + why); };
async function expected(db: Reader, gameId: string) {
    const family = await sourcePlacementReleaseOf(db, gameId), record = await db.auditLog.findUnique({ where: { id: 'aud_source_family_' + gameId } });
    demand(family?.baseSceneVersion === 13 && record, 'The exact pinned Detective source family is required');
    let bodyManifestSha256: string;
    if (family?.baseSceneVersion === 13 && family.worldSlug === 'kingdom') {
        // This family has its own measured bodies. Journey's two historical corrections never apply.
        demand(family.version === DETECTIVE_FAMILY_V2, 'Kingdom requires its prospective scope');
        bodyManifestSha256 = hash({version:'detectives-no-body-repair/v1',familyId:family.familyId,manifestSha256:family.manifestSha256});
    } else {
        assertSourceBodyManifest();
        demand(family?.manifestSha256 === SOURCE_BODY_REPAIR_MANIFEST.parentManifestSha256, 'Journey body parent differs');
        bodyManifestSha256 = SOURCE_BODY_REPAIR_MANIFEST_SHA256;
    }
    const body = { version: DETECTIVES_OPERATIONAL_RELEASE, gameId, worldId: gameId + ':board-wizard', sourceFamilySha256: hash(record!.metaJson), sourcePlacementManifestSha256: family!.manifestSha256, sourceBodyManifestSha256: bodyManifestSha256, reviewMode: SINGLE_VISUAL_REVIEW_VERSION, model: 'gpt-6.1-sol' as const, effort: 'low' as const, initialTier: 'flex' as const, oneUsableAssessmentPerImage: true as const, normalImageAttemptLimit: 3 as const, worldCapMicroUsd: 4000000 as const, automaticBudgetExtension: false as const };
    return detectivesOperationalReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
}
/** Chosen by the composition root ONLY in normal creation of a fresh Detective draft. No spend authority, extra attempt, grant or migration. */
export async function pinDetectivesOperationalPolicy(tx: Prisma.TransactionClient, gameId: string, release: DetectivesOperationalRelease | undefined, storageId: string, sealedScope = false) { if (release === undefined)
    return; demand(release === DETECTIVES_OPERATIONAL_RELEASE && storageId === 'db', 'Unsupported release or storage'); const e = env(); demand(detectivesOperationalQualified({ appEnv: e.APP_ENV, promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE, identitySource: e.LOCAL_PATCH_IDENTITY_SOURCE, reviewRelease: await dualVisualReviewVersion(tx, gameId) ?? undefined, leanRelease: await leanReleaseOf(tx, gameId) ?? undefined }), 'Only the qualified QA configuration can select this release'); const scope = sealedScope ? await detectiveSourceScopeOf(tx, gameId) : null; demand(!sealedScope || scope?.operationalRelease === release && scope.storageId === storageId, 'Missing original scope authority'); const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } }); demand((sealedScope ? ['PACKAGE_SELECTED','CHECKOUT_PENDING','PAYMENT_FAILED'].includes(game.status) : game.status === 'DRAFT') && game.styleVersion === 'local-patch-world-v1' && game.searchLevel === 'detectives' && !game.deletedAt && !game.paidAt && !game.readyAt && !game.configJson && (sealedScope || !game.childProfile?.originalPhotoAssetId), 'Only a new draft or its pre-authorized checkout scope can select a policy'); demand(!await tx.order.findFirst({ where: { gameId } }) && !await tx.generationJob.findFirst({ where: { gameId } }) && !await tx.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } }) && !await tx.worldBudgetLedger.findUnique({ where: { worldId: gameId + ':board-wizard' } }), 'Existing work cannot gain a new default'); const pin = await expected(tx, gameId), old = await tx.auditLog.findUnique({ where: { id: detectivesOperationalId(gameId) } }); if (old) {
    demand(await detectivesOperationalPolicyOf(tx, gameId), 'Existing policy is invalid');
    return;
} await tx.auditLog.create({ data: { id: detectivesOperationalId(gameId), actorType: 'SYSTEM', action: DETECTIVES_OPERATIONAL_ACTION, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(pin) } }); }
/** Invalid pins throw rather than falling back to two HIGH questions. The receipt remains usable after ordinary photo deletion. */
export async function detectivesOperationalPolicyOf(db: Reader, gameId: string): Promise<DetectivesOperationalReceipt | null> { const row = await db.auditLog.findUnique({ where: { id: detectivesOperationalId(gameId) } }); if (!row)
    return null; const pin = detectivesOperationalReceiptSchema.parse(JSON.parse(row.metaJson ?? 'null')); demand(row.actorType === 'SYSTEM' && row.actorId === null && row.action === DETECTIVES_OPERATIONAL_ACTION && row.entityType === 'Game' && row.entityId === gameId && row.metaJson === JSON.stringify(pin) && JSON.stringify(pin) === JSON.stringify(await expected(db, gameId)), 'Invalid or foreign from-birth policy'); return pin; }
export function sourceBodyBirthMarkerFor(pin: DetectivesOperationalReceipt, rowId: string, hideId: string, attempt: number): SourceBodyBirthMarker { demand(SOURCE_BODY_REPAIR_MANIFEST.entries.some(g => g.hideId === hideId), 'Only the two corrected public footprints use a native body marker'); return sourceBodyBirthMarkerSchema.parse({ version: SOURCE_BODY_BIRTH_VERSION, policySha256: pin.authorizationSha256, manifestSha256: pin.sourceBodyManifestSha256, rowId, hideId, attempt }); }
export async function sourceBodyBirthPublicationAuthorized(db: Reader, input: {
    gameId: string;
    variantId: string;
    hideId: string;
    attempts: number;
    sceneVersion: number;
    judgeJson: string | null;
}) { try {
    const p = await detectivesOperationalPolicyOf(db, input.gameId);
    if (!p || input.sceneVersion !== 13 || input.attempts < 1 || input.attempts > 3)
        return false;
    const j = JSON.parse(input.judgeJson ?? 'null');
    return j?.sourceBodyRepair === undefined && hash(j?.sourceBodyBirth) === hash(sourceBodyBirthMarkerFor(p, input.variantId, input.hideId, input.attempts)) && !!await subjectUpgradeOf(db, input.gameId);
}
catch {
    return false;
} }
export function sourceBodyBirthRequestKey(marker: SourceBodyBirthMarker) { const g = SOURCE_BODY_REPAIR_MANIFEST.entries.find(g => g.hideId === marker.hideId); demand(g, 'Unknown from-birth footprint'); return marker.hideId + ':' + (g!.boardId === 'paris' ? 'crouching' : 'standing') + ':render:' + marker.attempt; }
/** The world's ordinary image and lease fences are still required before each write. No fourth image is authorized. */
export async function fenceSourceBodyBirthPurchase(db: Pick<Prisma.TransactionClient, 'auditLog' | 'targetVariantAsset'>, gameId: string, rowId: string, marker: SourceBodyBirthMarker) { const p = await detectivesOperationalPolicyOf(db, gameId), row = await db.targetVariantAsset.findFirst({ where: { id: rowId, variant: 'A', targetInstance: { gameScene: { gameId, sceneVersion: 13 } } }, include: { targetInstance: { include: { gameScene: true } } } }); demand(p && row && hash(marker) === hash(sourceBodyBirthMarkerFor(p!, rowId, marker.hideId, marker.attempt)) && SOURCE_BODY_REPAIR_MANIFEST.entries.some(g => g.hideId === marker.hideId && g.hideId === g.boardId + '-detectives-' + row!.targetInstance.targetId && g.boardId === row!.targetInstance.gameScene.sceneSlug) && ((row!.attempts === marker.attempt - 1 && ['PENDING', 'FAILED'].includes(row!.status)) || (row!.attempts === marker.attempt && row!.status === 'PENDING' && hash(JSON.parse(row!.judgeJson ?? 'null')?.sourceBodyBirth) === hash(marker))), 'The normal finite from-birth purchase checkpoint changed'); }
