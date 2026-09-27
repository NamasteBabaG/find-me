import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { BOARD_FACE_FINISH_VERSION, composeBoardFaceFinish, prepareBoardFaceFinish, renderBoardFaceFinish } from '../board-face-finish';
import { LOCAL_PATCH_IMAGE_POLICY } from '../../../infra/generation/openai-local-patch';
import type { PurchaseLedger, RetainedPurchase, RetainedPurchaseStore } from '../paid-operation';
import type { WorldBudgetRequest, WorldChargeEvidence } from '../world-budget';

async function fixture() {
  const targetPng = await sharp(Buffer.from('<svg width="96" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="128" fill="#ace"/><path d="M0 0L96 128M96 0L0 128" stroke="#173452" stroke-width="3"/></svg>')).png().toBuffer();
  const editableAlphaPng = await sharp(Buffer.from('<svg width="96" height="128" xmlns="http://www.w3.org/2000/svg"><ellipse cx="45" cy="46" rx="20" ry="23" fill="white"/></svg>')).png().toBuffer();
  return { targetPng, identityPng: targetPng, paintPng: targetPng, editableAlphaPng, window: { left: 16, top: 16, width: 64, height: 64 },
    expectedVersion: BOARD_FACE_FINISH_VERSION as typeof BOARD_FACE_FINISH_VERSION, worldId: 'test-finish', requestKey: 'finish:1', apiKey: 'test',
    policy: { ...LOCAL_PATCH_IMAGE_POLICY, size: '1024x1024' as const } };
}
function state() {
  const rows = new Map<string, WorldBudgetRequest>(), retained = new Map<string, RetainedPurchase>();
  const at = (w: string, k: string) => `${w}:${k}`;
  const ledger: PurchaseLedger = {
    readRequest: async (w, k) => rows.get(at(w, k)) ?? null,
    reserve: async (w, r) => {
      if (rows.has(at(w, r.requestKey))) return { acquired: false };
      rows.set(at(w, r.requestKey), { ...r, origin: 'reserved', state: 'pending', unknownReasons: [], conflicts: [] }); return { acquired: true };
    },
    settle: async (w, k, evidence) => rows.set(at(w, k), { ...rows.get(at(w, k))!, state: 'settled', evidence }),
    markUnknown: async (w, k, reason) => rows.set(at(w, k), { ...rows.get(at(w, k))!, state: 'unknown', unknownReasons: [reason] }),
  };
  const store: RetainedPurchaseStore = { get: async (w, k) => retained.get(at(w, k)) ?? null, put: async (w, k, v) => { retained.set(at(w, k), v); } };
  return { ledger, store, rows, retained };
}
const bill: WorldChargeEvidence = { providerNamespace: 'openai:test', providerRequestId: 'req-finish', usageId: 'usage-finish', rawUsage: { total: 1 }, model: 'gpt-image-2', amountMicroUsd: 50000, costBasis: 'provider-billed' };

it('makes a square close-up and validates authoring before purchase', async () => {
  const input = await fixture(), prepared = await prepareBoardFaceFinish(input);
  expect(await sharp(prepared.target).metadata()).toMatchObject({ width: 512, height: 512 });
  await expect(prepareBoardFaceFinish({ ...input, window: { ...input.window, width: 63 } })).rejects.toThrow('window');
  await expect(prepareBoardFaceFinish({ ...input, window: { left: 30, top: 30, width: 64, height: 64 } })).rejects.toThrow('boundary');
  const empty = await sharp({ create: { width: 96, height: 128, channels: 4, background: '#0000' } }).png().toBuffer();
  await expect(prepareBoardFaceFinish({ ...input, editableAlphaPng: empty })).rejects.toThrow('empty');
});
it('preserves every protected native pixel even when the provider repaints everything', async () => {
  const input = await fixture();
  const generated = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'red' } }).png().toBuffer();
  const result = await composeBoardFaceFinish(input.targetPng, generated, input.window, input.editableAlphaPng);
  expect(result.protectedChanges).toBe(0);
  expect(result.changedPixels).toBeGreaterThan(500);
  expect(result.requiresVisualReview).toBe(true);
  const before = await sharp(input.targetPng).extract({ left: 0, top: 0, width: 96, height: 15 }).raw().toBuffer();
  const after = await sharp(result.candidate).extract({ left: 0, top: 0, width: 96, height: 15 }).raw().toBuffer();
  expect(after).toEqual(before);
});
it('retains one purchase, replays exactly, and refuses changed identity/paint/window under the same key', async () => {
  const input = await fixture(), deps = state();
  const raw = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'red' } }).png().toBuffer();
  const render = vi.fn(async () => ({ png: raw, quarantined: null, rejected: null, evidence: bill, unknownReason: null }));
  const first = await renderBoardFaceFinish({ ...deps, render }, input);
  const second = await renderBoardFaceFinish({ ...deps, render }, input);
  expect(first).toMatchObject({ kind: 'candidate', replayed: false, protectedChanges: 0 });
  expect(second).toMatchObject({ kind: 'candidate', replayed: true });
  const other = await sharp(input.identityPng).negate().png().toBuffer();
  for (const change of [{ identityPng: other }, { paintPng: other }, { targetPng: other }, { window: { ...input.window, left: 15 } }]) {
    expect(await renderBoardFaceFinish({ ...deps, render }, { ...input, ...change })).toMatchObject({ kind: 'stopped' });
  }
  expect(render).toHaveBeenCalledTimes(1);
  expect(deps.retained.size).toBe(1);
});
it('rejects mismatched recipe/quality before touching ledger or provider', async () => {
  const input = await fixture(), deps = state(), render = vi.fn();
  await expect(renderBoardFaceFinish({ ...deps, render }, { ...input, expectedVersion: 'old' as typeof BOARD_FACE_FINISH_VERSION })).rejects.toThrow('mismatch');
  await expect(renderBoardFaceFinish({ ...deps, render }, { ...input, policy: { ...input.policy, quality: 'low' } })).rejects.toThrow('mismatch');
  expect(render).not.toHaveBeenCalled(); expect(deps.rows.size).toBe(0);
});
it('unknown billing retains evidence and never dispatches again', async () => {
  const input = await fixture(), deps = state();
  const render = vi.fn(async () => ({ png: input.targetPng, quarantined: null, rejected: null, evidence: null, unknownReason: 'missing usage' }));
  for (let n = 0; n < 2; n++) expect(await renderBoardFaceFinish({ ...deps, render }, input)).toMatchObject({ kind: 'stopped' });
  expect(render).toHaveBeenCalledTimes(1); expect(deps.retained.size).toBe(1);
});
