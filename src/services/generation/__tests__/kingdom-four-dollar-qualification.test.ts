import type { Prisma } from '@prisma/client';
import { afterEach, expect, it, vi } from 'vitest';
import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from '../../../../content/detectives/kingdom/source-placement-release';
import { KINGDOM_FALLBACK_PLACEMENT_SHA256 } from '../../../../content/detectives/kingdom/fallback-placement-v1';
import { KINGDOM_GENERATION_V8, KINGDOM_GENERATION_V9, kingdomCostPolicyOf, kingdomGenerationReleaseOf,
  kingdomV6RecoveryOf, newKingdomGenerationPolicy, pinKingdomGenerationRelease, readKingdomGenerationBudget } from '../kingdom-generation-release';

const candidate = 'game_aaaaaaaaaaaaaaaaaaaa', other = 'game_bbbbbbbbbbbbbbbbbbbb';
const config = vi.hoisted(() => ({ APP_ENV: 'qa', PAYMENT_PROVIDER: 'mock', KINGDOM_GENERATION_RELEASE: 'v8',
  KINGDOM_QA_FOUR_DOLLAR_GAME_ID: undefined as string | undefined }));
vi.mock('../../../lib/env', () => ({ env: () => config }));
vi.mock('../painter-release', async load => {
  const original = await load<typeof import('../painter-release')>();
  return { ...original, localPatchPainterRelease: async () => original.LOCAL_PATCH_SUNBURST_PAINTER };
});

afterEach(() => { config.KINGDOM_QA_FOUR_DOLLAR_GAME_ID = undefined; });

it('pins only the named fresh Kingdom purchase and keeps the same cap when the selector is removed', async () => {
  const rows = new Map<string, Prisma.AuditLogUncheckedCreateInput>();
  for (const gameId of [candidate, other]) {
    const id = 'aud_source_family_' + gameId;
    rows.set(id, { id, actorType: 'SYSTEM', actorId: null, entityType: 'Game', entityId: gameId, action: 'generation:source-family-policy',
      metaJson: JSON.stringify({ gameId, worldSlug: 'kingdom', familyId: 'kingdom-detectives/v1', manifestSha256: KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 }) });
  }
  const tx = { auditLog: {
    findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
    create: async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => {
      if (rows.has(data.id!)) throw Error('unique audit id');
      rows.set(data.id!, { actorId: null, ...data });
    },
  } } as unknown as Prisma.TransactionClient;
  config.KINGDOM_QA_FOUR_DOLLAR_GAME_ID = candidate;
  expect(newKingdomGenerationPolicy()).toMatchObject({ version: KINGDOM_GENERATION_V8, worldCapMicroUsd: 6_000_000 });
  await pinKingdomGenerationRelease(tx, candidate);
  await pinKingdomGenerationRelease(tx, other);
  config.KINGDOM_QA_FOUR_DOLLAR_GAME_ID = undefined;

  expect(await kingdomGenerationReleaseOf(tx, candidate)).toMatchObject({ version: KINGDOM_GENERATION_V9,
    fallbackPlacementSha256: KINGDOM_FALLBACK_PLACEMENT_SHA256, initialTier: 'default', automaticBudgetExtension: false });
  expect(await readKingdomGenerationBudget(tx, candidate + ':board-wizard')).toMatchObject({ capMicroUsd: 4_000_000 });
  expect(await readKingdomGenerationBudget(tx, other + ':board-wizard')).toMatchObject({ capMicroUsd: 6_000_000 });
  expect(await kingdomCostPolicyOf(tx, candidate)).toMatchObject({ ceilingMicroUsd: 4_000_000, ceilingOutcome: 'hold' });
  expect(await kingdomV6RecoveryOf(tx, candidate)).toBe(true);
  const audit = rows.get('aud_kingdom_generation_' + candidate)!;
  audit.metaJson = JSON.stringify({ ...JSON.parse(audit.metaJson!), worldCapMicroUsd: 4_000_001 });
  await expect(readKingdomGenerationBudget(tx, candidate + ':board-wizard')).rejects.toThrow('changed release pin');
});
