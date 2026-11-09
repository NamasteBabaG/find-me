import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE } from './kingdom/source-placement-release';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE } from './source-placement-release';
import { SOURCE_BODY_REPAIR_MANIFEST } from './source-body-repair';
import { assertRetainedWindowAuthority, retainedWindowHash, RETAINED_WINDOW_VERSION,
  retainedWindowCanonicalHash, type RetainedWindowAuthority } from '../../src/domain/generation/retained-window';
import type { AuthoredLocalPatchReturnContract } from '../../src/domain/scene/local-patch-return-region';

/** Public SOURCE permissions only. No customer, game, paid image or bill belongs here.
 * Existing scene13 placement manifests and all old return contracts stay exact. */
const selected = [
  ['kingdom-detectives/v1', 'castlegate-detectives-hide-1', 'source-child'],
  ['kingdom-detectives/v1', 'icepalace-detectives-hide-3', 'source-child'],
  ['kingdom-detectives/v1', 'underwater-detectives-hide-1', 'source-child'],
  ['kingdom-detectives/v1', 'cloudcity-detectives-hide-1', 'source-child'],
  ['kingdom-detectives/v1', 'cloudcity-detectives-hide-2', 'source-child'],
  ['kingdom-detectives/v1', 'cloudcity-detectives-hide-3', 'source-child'],
  ['kingdom-detectives/v1', 'giantlibrary-detectives-hide-1', 'source-child'],
  ['kingdom-detectives/v1', 'giantlibrary-detectives-hide-2', 'source-child'],
  ['kingdom-detectives/v1', 'nightcarnival-detectives-hide-1', 'source-child'],
  ['kingdom-detectives/v1', 'nightcarnival-detectives-hide-3', 'source-child'],
  ['journey-detectives/v1', 'newyork-detectives-hide-1', 'source-flower-child'],
  ['journey-detectives/v1', 'paris-detectives-hide-1', 'source-petanque-child'],
  ['journey-detectives/v1', 'amazon-detectives-hide-3', 'source-orange-instrument-child'],
  ['journey-detectives/v1', 'greatwall-detectives-hide-1', 'source-pink-pinwheel-child'],
] as const;

export const RETAINED_WINDOW_AUTHORITIES: readonly RetainedWindowAuthority[] = Object.freeze(selected.map(([family, hideId, targetSourceId]) => {
  const release = family === 'kingdom-detectives/v1' ? KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE : DETECTIVE_SOURCE_PLACEMENT_RELEASE;
  const entry = release.inventory.find(e => e.hideId === hideId);
  if (!entry?.sourceNeighbors) throw Error('RETAINED_WINDOW: complete public SOURCE neighborhood required');
  const body = family === 'journey-detectives/v1' ? SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId === hideId) : undefined;
  const authority: RetainedWindowAuthority = {
    version: RETAINED_WINDOW_VERSION, sceneVersion: 13, family, boardId: entry.boardId, hideId,
    source: entry.source, crop: entry.effective.crop, parentChild: body?.child ?? entry.effective.child,
    parentReturn: body?.returnRect ?? entry.effective.returnRect, parentPlacementSha256: entry.basePlacementSha256,
    targetSourceId, sourceHeads: entry.sourceNeighbors.contract.neighbors.map(h => ({ sourceId: h.sourceId, head: h.head })),
    frame: 12, feather: 12, maxRegistration: 3, maximumMeanDifference: 24,
  };
  assertRetainedWindowAuthority(authority);
  return Object.freeze(authority);
}));

export function retainedWindowAuthorityFor(parent: AuthoredLocalPatchReturnContract): RetainedWindowAuthority | null {
  assertRetainedWindowManifest();
  const a = RETAINED_WINDOW_AUTHORITIES.find(a => a.hideId === parent?.hideId);
  const same = (x: unknown, y: unknown) => retainedWindowCanonicalHash(x) === retainedWindowCanonicalHash(y);
  return a && parent.contentVersion === a.sceneVersion && parent.boardId === a.boardId && same(parent.source, a.source)
    && same(parent.crop, a.crop) && same(parent.child, a.parentChild) && same(parent.local, a.parentReturn)
    && parent.sourcePlacement?.basePlacementSha256 === a.parentPlacementSha256 ? a : null;
}

// Frozen public-only inventory. This permission is not a visual or spending approval.
export const RETAINED_WINDOW_MANIFEST_SHA256 = '5ddc3e7511e0d5ecd32ccba31442c11a9892e177df072c3dc7b8fb95b3bed4e6';
export function assertRetainedWindowManifest() {
  if (retainedWindowHash(RETAINED_WINDOW_AUTHORITIES) !== RETAINED_WINDOW_MANIFEST_SHA256)
    throw Error('RETAINED_WINDOW: public permissions differ from the frozen release');
}
