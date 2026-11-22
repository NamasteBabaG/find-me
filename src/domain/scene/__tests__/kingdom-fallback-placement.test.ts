import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { KINGDOM_FALLBACK_PLACEMENT as profile } from '../../../../content/detectives/kingdom/fallback-placement-v1';
import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE, KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE } from '../../../../content/detectives/kingdom/source-placement-release';
import { KINGDOM_DETECTIVE_ADVENTURE_CATALOG } from '../../../../content/detectives/kingdom/runtime-release';
import { kingdomFallbackAdventure, kingdomFallbackPlacement, kingdomFallbackRefusal } from '../kingdom-fallback-placement';
import { CONTINUITY_READER_BOUNDED, readLocalPatchBodyContinuity } from '../local-patch-body-continuity';
import { cropOf, maskOf } from '../local-patch-hides';
import { rectanglesIntersect, sourceHeadIntersectsReturnBoundary } from '../local-patch-return-region';

it('moves exactly one Sweet Workshop target on the frozen public source and clears the protected seam', () => {
  const original = KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE.find(item => item.board.board === profile.boardId)!;
  const entry = KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(item => item.hideId === profile.hideId)!;
  expect(createHash('sha256').update(readFileSync(original.source.art)).digest('hex')).toBe(profile.sourceSha256);
  const { board, contract } = kingdomFallbackPlacement(original.board, entry);
  const siblings = (hides: typeof board.hides) => hides.filter(hide => hide.id !== profile.hideId);
  expect(siblings(board.hides)).toEqual(siblings(original.board.hides));
  expect(board.hides.map(hide => hide.targetId)).toEqual(original.board.hides.map(hide => hide.targetId));
  const hide = board.hides.find(item => item.id === profile.hideId)!;
  const old = original.board.hides.find(item => item.id === hide.id)!;
  const { returnRect, crop } = contract.effective;
  const returned = { ...returnRect, left: crop.left + returnRect.left, top: crop.top + returnRect.top };
  expect(rectanglesIntersect(cropOf(old), maskOf(hide))).toBe(false);
  expect(contract.sourceNeighbors?.contract.neighbors.every(({ head }) => !sourceHeadIntersectsReturnBoundary(returned, head))).toBe(true);
  expect(() => kingdomFallbackPlacement(original.board, { ...entry, source: { ...entry.source, sha256: '0'.repeat(64) } })).toThrow(/registered parent/);
  const passport = kingdomFallbackAdventure(KINGDOM_DETECTIVE_ADVENTURE_CATALOG);
  const oldBoard = KINGDOM_DETECTIVE_ADVENTURE_CATALOG.boards.find(board => board.boardSlug === profile.boardId)!;
  const newBoard = passport.boards.find(board => board.boardSlug === profile.boardId)!;
  if (oldBoard.status !== 'ready' || newBoard.status !== 'ready') throw Error('Expected two ready layouts');
  expect(newBoard.personalZones).toContainEqual({ x: crop.left / newBoard.art.width, y: crop.top / newBoard.art.height,
    w: crop.width / newBoard.art.width, h: crop.height / newBoard.art.height });
  expect(newBoard.discoveries).toEqual(oldBoard.discoveries);
  expect(newBoard.postcard).toEqual(oldBoard.postcard);
});

it('recognizes the saved bottom-cut failure without treating uncertainty or a different defect as authorization', () => {
  const saved = { hide: profile.hideId, pose: 'standing', reviewState: 'board-review-complete', wireFault: null,
    authoredReturn: { source: { sha256: profile.sourceSha256 }, crop: profile.originalCrop, local: profile.originalReturn },
    qualityDisposition: { state: 'retry' }, verdict: { verdict: 'fail', pictureWhole: 'fail', childComplete: 'fail',
      boundaryIntegrity: { bottom: { status: 'fail' } } }, judgedSha256: 'a'.repeat(64), boardReview: { requestKey: 'synthetic-known-review' } };
  const read = (where: string) => readLocalPatchBodyContinuity(JSON.stringify({ cases: [{ id: `${profile.hideId}:people`,
    state: 'broken', visibleBody: true, headConnection: 'connected', headTrace: 'The visible head joins the torso.',
    bodyTrace: 'The two legs cannot be followed to the feet.', occlusion: '', faults: [{ kind: 'hard-cut', where }] }] }),
    [`${profile.hideId}:people`], CONTINUITY_READER_BOUNDED);
  const cut = read('Target lower legs terminate at the bottom return, y=496.');
  expect(kingdomFallbackRefusal(JSON.stringify(saved), cut)).toEqual({ reviewKey: saved.boardReview.requestKey });
  expect(kingdomFallbackRefusal(JSON.stringify({ ...saved, wireFault: 'schema' }), cut)).toBeNull();
  expect(kingdomFallbackRefusal(JSON.stringify(saved), read('The crown is cut at the top return.'))).toBeNull();
  expect(kingdomFallbackRefusal(JSON.stringify(saved), null)).toBeNull();
});
