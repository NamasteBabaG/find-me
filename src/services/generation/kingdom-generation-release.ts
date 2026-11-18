import type { Prisma } from '@prisma/client';
import { kingdomGenerationWindows, KINGDOM_GENERATION_WINDOWS_SHA256,
  KINGDOM_GENERATION_WINDOWS_V2_SHA256 } from '../../../content/detectives/retained-window-v1';
import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from '../../../content/detectives/kingdom/source-placement-release';
import { sourcePlacementSha256 } from '../../domain/scene/source-placement-release';
import { env } from '../../lib/env';
import { KINGDOM_COMPACT_REVIEW, KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS, KINGDOM_PLAYABILITY_REVIEW, KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW } from '../../domain/generation/kingdom-generation';
import { LOCAL_PATCH_SUNBURST_PAINTER, localPatchPainterRelease } from './painter-release';
import type { BoardWizardBudgetCeiling } from './board-wizard-budget';

export const KINGDOM_GENERATION_RELEASE = 'kingdom-generation/v1';
export const KINGDOM_GENERATION_V2 = 'kingdom-generation/v2';
const KINGDOM_GENERATION_V3 = 'kingdom-generation/v3';
const KINGDOM_GENERATION_V4 = 'kingdom-generation/v4';
const KINGDOM_GENERATION_V5 = 'kingdom-generation/v5';
const KINGDOM_GENERATION_POLICY = Object.freeze({
  version: KINGDOM_GENERATION_RELEASE, world: 'kingdom', prospectiveOnly: true,
  windowsSha256: KINGDOM_GENERATION_WINDOWS_SHA256,
  flexOverloadCooldownMs: KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS, paintAhead: 1,
  worldCapMicroUsd: 4_000_000, automaticBudgetExtension: false, includesUnknownReservations: true,
} as const);
const KINGDOM_GENERATION_POLICY_V2 = Object.freeze({
  ...KINGDOM_GENERATION_POLICY, version: KINGDOM_GENERATION_V2,
  windowsSha256: KINGDOM_GENERATION_WINDOWS_V2_SHA256, stopFlexAfterOverload: true,
} as const);
const KINGDOM_GENERATION_POLICY_V3 = Object.freeze({
  ...KINGDOM_GENERATION_POLICY_V2, version: KINGDOM_GENERATION_V3,
  initialTier: 'default', reviewEvidence: KINGDOM_COMPACT_REVIEW,
} as const);
const KINGDOM_GENERATION_POLICY_V4 = Object.freeze({
  ...KINGDOM_GENERATION_POLICY_V3, version: KINGDOM_GENERATION_V4, reviewEvidence: KINGDOM_PLAYABILITY_REVIEW,
} as const);
const KINGDOM_GENERATION_POLICY_V5 = Object.freeze({
  ...KINGDOM_GENERATION_POLICY_V4, version: KINGDOM_GENERATION_V5, reviewEvidence: KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW,
} as const);
const kingdomPolicies = {
  v1: KINGDOM_GENERATION_POLICY, v2: KINGDOM_GENERATION_POLICY_V2,
  v3: KINGDOM_GENERATION_POLICY_V3, v4: KINGDOM_GENERATION_POLICY_V4, v5: KINGDOM_GENERATION_POLICY_V5,
};
export function newKingdomGenerationPolicy() {
  return kingdomPolicies[env().KINGDOM_GENERATION_RELEASE] ?? KINGDOM_GENERATION_POLICY;
}
const id = (gameId: string) => 'aud_kingdom_generation_' + gameId;
type Reader = Pick<Prisma.TransactionClient, 'auditLog'>;

async function receipt(db: Reader, gameId: string, policy: ReturnType<typeof newKingdomGenerationPolicy>) {
  kingdomGenerationWindows(policy.windowsSha256);
  const family = await db.auditLog.findUnique({ where: { id: 'aud_source_family_' + gameId } });
  const saved: { gameId?: string; worldSlug?: string; familyId?: string; manifestSha256?: string } | null =
    JSON.parse(family?.metaJson ?? 'null');
  if (family?.action !== 'generation:source-family-policy' || family.actorType !== 'SYSTEM' || family.actorId !== null
    || family.entityType !== 'Game' || family.entityId !== gameId || saved?.gameId !== gameId
    || saved.familyId !== 'kingdom-detectives/v1' || saved.worldSlug !== 'kingdom'
    || saved.manifestSha256 !== KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256
    || await localPatchPainterRelease(db, gameId) !== LOCAL_PATCH_SUNBURST_PAINTER)
    throw Error('KINGDOM_GENERATION: original Kingdom and Sunburst pins required');
  return {
    version: policy.version, gameId, worldId: gameId + ':board-wizard',
    sourceFamilySha256: sourcePlacementSha256(family.metaJson),
    windowsSha256: policy.windowsSha256,
    flexOverloadCooldownMs: policy.flexOverloadCooldownMs, paintAhead: policy.paintAhead,
    worldCapMicroUsd: policy.worldCapMicroUsd, automaticBudgetExtension: policy.automaticBudgetExtension,
    ...('stopFlexAfterOverload' in policy ? { stopFlexAfterOverload: policy.stopFlexAfterOverload } : {}),
    ...('reviewEvidence' in policy ? { initialTier: policy.initialTier, reviewEvidence: policy.reviewEvidence } : {}),
  };
}

/** Checkout calls this only within its new family seal, before the order or any paid work. */
export async function pinKingdomGenerationRelease(tx: Prisma.TransactionClient, gameId: string) {
  if (env().APP_ENV !== 'qa' || await localPatchPainterRelease(tx, gameId) !== LOCAL_PATCH_SUNBURST_PAINTER) return;
  const value = await receipt(tx, gameId, newKingdomGenerationPolicy());
  await tx.auditLog.create({ data: {
    id: id(gameId), actorType: 'SYSTEM', action: 'generation:' + value.version, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(value),
  } });
}

export async function kingdomGenerationReleaseOf(db: Reader, gameId: string) {
  const row = await db.auditLog.findUnique({ where: { id: id(gameId) } });
  if (!row) return null;
  const policy = Object.values(kingdomPolicies).find(candidate => row.action === 'generation:' + candidate.version);
  if (!policy) throw Error('KINGDOM_GENERATION: invalid or changed release pin');
  const value = await receipt(db, gameId, policy);
  if (row.actorType !== 'SYSTEM' || row.actorId !== null || row.action !== 'generation:' + value.version || row.entityType !== 'Game'
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(value))
    throw Error('KINGDOM_GENERATION: invalid or changed release pin');
  return value;
}

/** The prospective QA receipt is a ceiling; historical completion grants are resolved separately. */
export async function readKingdomGenerationBudget(db: Reader, worldId: string): Promise<BoardWizardBudgetCeiling | null> {
  const suffix = ':board-wizard';
  if (env().APP_ENV !== 'qa' || !worldId.endsWith(suffix)) return null;
  const pin = await kingdomGenerationReleaseOf(db, worldId.slice(0, -suffix.length));
  return pin ? { worldId, capMicroUsd: pin.worldCapMicroUsd, authorizationSha256: sourcePlacementSha256(pin) } : null;
}
