import type { Prisma } from '@prisma/client';
import { assertKingdomGenerationWindows, KINGDOM_GENERATION_WINDOWS_SHA256 } from '../../../content/detectives/retained-window-v1';
import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from '../../../content/detectives/kingdom/source-placement-release';
import { sourcePlacementSha256 } from '../../domain/scene/source-placement-release';
import { env } from '../../lib/env';
import { KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS } from '../../domain/generation/kingdom-generation';
import { LOCAL_PATCH_SUNBURST_PAINTER, localPatchPainterRelease } from './painter-release';
import type { BoardWizardBudgetCeiling } from './board-wizard-budget';

export const KINGDOM_GENERATION_RELEASE = 'kingdom-generation/v1';
export const KINGDOM_GENERATION_POLICY = Object.freeze({
  version: KINGDOM_GENERATION_RELEASE, world: 'kingdom', prospectiveOnly: true,
  windowsSha256: KINGDOM_GENERATION_WINDOWS_SHA256,
  flexOverloadCooldownMs: KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS, paintAhead: 1,
  worldCapMicroUsd: 4_000_000, automaticBudgetExtension: false, includesUnknownReservations: true,
} as const);
const action = 'generation:' + KINGDOM_GENERATION_RELEASE;
const id = (gameId: string) => 'aud_kingdom_generation_' + gameId;
type Reader = Pick<Prisma.TransactionClient, 'auditLog'>;

async function receipt(db: Reader, gameId: string) {
  assertKingdomGenerationWindows();
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
    version: KINGDOM_GENERATION_RELEASE, gameId, worldId: gameId + ':board-wizard',
    sourceFamilySha256: sourcePlacementSha256(family.metaJson),
    windowsSha256: KINGDOM_GENERATION_POLICY.windowsSha256,
    flexOverloadCooldownMs: KINGDOM_GENERATION_POLICY.flexOverloadCooldownMs, paintAhead: KINGDOM_GENERATION_POLICY.paintAhead,
    worldCapMicroUsd: KINGDOM_GENERATION_POLICY.worldCapMicroUsd, automaticBudgetExtension: KINGDOM_GENERATION_POLICY.automaticBudgetExtension,
  };
}

/** Checkout calls this only within its new family seal, before the order or any paid work. */
export async function pinKingdomGenerationRelease(tx: Prisma.TransactionClient, gameId: string) {
  if (env().APP_ENV !== 'qa' || await localPatchPainterRelease(tx, gameId) !== LOCAL_PATCH_SUNBURST_PAINTER) return;
  const value = await receipt(tx, gameId);
  await tx.auditLog.create({ data: {
    id: id(gameId), actorType: 'SYSTEM', action, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(value),
  } });
}

export async function kingdomGenerationReleaseOf(db: Reader, gameId: string) {
  const row = await db.auditLog.findUnique({ where: { id: id(gameId) } });
  if (!row) return null;
  const value = await receipt(db, gameId);
  if (row.actorType !== 'SYSTEM' || row.actorId !== null || row.action !== action || row.entityType !== 'Game'
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(value))
    throw Error('KINGDOM_GENERATION: invalid or changed release pin');
  return value;
}

/** The prospective QA receipt is a ceiling; historical completion grants are resolved separately. */
export async function readKingdomGenerationBudget(db: Reader, worldId: string): Promise<BoardWizardBudgetCeiling | null> {
  const suffix = ':board-wizard';
  if (env().APP_ENV !== 'qa' || !worldId.endsWith(suffix)) return null;
  const pin = await kingdomGenerationReleaseOf(db, worldId.slice(0, -suffix.length));
  return pin ? { worldId, capMicroUsd: KINGDOM_GENERATION_POLICY.worldCapMicroUsd, authorizationSha256: sourcePlacementSha256(pin) } : null;
}
