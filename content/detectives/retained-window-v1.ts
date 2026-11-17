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

function authorityOf(family: RetainedWindowAuthority['family'], hideId: string, targetSourceId: string) {
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
}
export const RETAINED_WINDOW_AUTHORITIES: readonly RetainedWindowAuthority[] = Object.freeze(selected.map(([family,hideId,targetSourceId]) =>
  authorityOf(family,hideId,targetSourceId)));

export function retainedWindowAuthorityFor(parent: AuthoredLocalPatchReturnContract,
  manifest = RETAINED_WINDOW_MANIFEST_SHA256): RetainedWindowAuthority | null {
  let authorities: readonly RetainedWindowAuthority[];
  if (manifest === RETAINED_WINDOW_MANIFEST_SHA256) {
    assertRetainedWindowManifest();
    authorities = RETAINED_WINDOW_AUTHORITIES;
  } else if (manifest === RETAINED_KINGDOM_TAIL_MANIFEST_SHA256) {
    assertRetainedKingdomTailManifest();
    authorities = RETAINED_KINGDOM_TAIL_WINDOWS.map(item=>item.authority);
  } else if (manifest === KINGDOM_GENERATION_WINDOWS_SHA256) {
    assertKingdomGenerationWindows();
    authorities = KINGDOM_GENERATION_WINDOWS.map(item => item.authority);
  } else return null;
  const a = authorities.find(a => a.hideId === parent?.hideId);
  const same = (x: unknown, y: unknown) => retainedWindowCanonicalHash(x) === retainedWindowCanonicalHash(y);
  return a && parent.contentVersion === a.sceneVersion && parent.boardId === a.boardId && same(parent.source, a.source)
    && same(parent.crop, a.crop) && same(parent.child, a.parentChild) && same(parent.local, a.parentReturn)
    && parent.sourcePlacement?.basePlacementSha256 === a.parentPlacementSha256 ? a : null;
}

// Frozen public-only inventory. This permission is not a visual or spending approval.
export const RETAINED_WINDOW_MANIFEST_SHA256 = '5ddc3e7511e0d5ecd32ccba31442c11a9892e177df072c3dc7b8fb95b3bed4e6';
export const RETAINED_KINGDOM_TAIL_MANIFEST_SHA256 = '7a3af0b65356d142a7c1d81fe4a7eaace30d58f4b033ced00bfce3d62435e395';
export const RETAINED_KINGDOM_TAIL_WINDOWS = Object.freeze([
  {
    sourceRequestKey:'icepalace-detectives-hide-1:standing:render:3',
    authority:authorityOf('kingdom-detectives/v1','icepalace-detectives-hide-1','source-child'),
  },
  {
    sourceRequestKey:'giantlibrary-detectives-hide-1:standing:render:3',
    authority:Object.freeze({
      ...authorityOf('kingdom-detectives/v1','giantlibrary-detectives-hide-1','source-child'),
      // Original balcony rail and posts, measured in the unchanged 512×768 SOURCE crop.
      foregroundTop:[
        {x:0,y:503},{x:128,y:535},{x:144,y:527},{x:155,y:515},{x:197,y:516},
        {x:210,y:535},{x:222,y:554},{x:415,y:608},{x:432,y:600},{x:448,y:587},
        {x:475,y:598},{x:496,y:615},{x:511,y:620},
      ],
    }),
  },
]);

/** Prospective public geometry. These permissions do not name a paid attempt.
 * The ordinary painter and reviewer still have to produce a complete child. */
export const KINGDOM_GENERATION_WINDOWS = Object.freeze([
  {
    authority: RETAINED_KINGDOM_TAIL_WINDOWS[0]!.authority,
    supportBottom: 568,
    direction: 'Keep both skates, ankles and the point of contact with the ice inside the return. Match the original ground plane and preserve complete nearby skaters.',
  },
  {
    authority: RETAINED_KINGDOM_TAIL_WINDOWS[1]!.authority,
    direction: 'The source balcony railing and posts remain in front of the child. Keep the visible body continuous above the rail and put the hidden legs behind it.',
  },
  {
    authority: Object.freeze({ ...authorityOf('kingdom-detectives/v1', 'dragoncave-detectives-hide-1', 'source-child'), preserveSourceNeighbors: true }),
    direction: 'Replace only the central target. Preserve both neighbors including their visible bodies, and place all visible parts of the new child inside the return.',
  },
  {
    authority: Object.freeze({ ...authorityOf('kingdom-detectives/v1', 'underwater-detectives-hide-3', 'source-child'), preserveSourceNeighbors: true }),
    direction: 'Replace only the registered target. Preserve the foreground and the heads, limbs and positions of the people on either side of the child.',
  },
  ...['icepalace-detectives-hide-3', 'cloudcity-detectives-hide-1'].map(hideId => ({
    authority: RETAINED_WINDOW_AUTHORITIES.find(authority => authority.hideId === hideId)!,
    direction: 'Keep the complete target and its support inside the editable return. Preserve the source people that cross the crop.',
  })),
].map(profile => Object.freeze(profile)));

export const KINGDOM_GENERATION_WINDOWS_SHA256 = 'd51f11d6fd3915b5d9f18f312805a82fc5d734aafbfe3d59984cb9fe4533349a';

export function assertKingdomGenerationWindows() {
  if (retainedWindowHash(KINGDOM_GENERATION_WINDOWS) !== KINGDOM_GENERATION_WINDOWS_SHA256)
    throw Error('RETAINED_WINDOW: prospective Kingdom geometry differs from its release');
  for (const profile of KINGDOM_GENERATION_WINDOWS) {
    const { authority } = profile;
    const supportBottom = 'supportBottom' in profile ? profile.supportBottom : undefined;
    assertRetainedWindowAuthority(authority);
    if (supportBottom !== undefined && (supportBottom <= authority.parentChild.top + authority.parentChild.height
      || supportBottom > 768 - authority.frame - 2 * authority.feather))
      throw Error('RETAINED_WINDOW: skating support must clear the editable frame');
  }
}
/** Separate finite changed-source recovery. No old composition permission or
 * verdict changes; the rejected image and its paid answer remain in lineage. */
export const RETAINED_WINDOW_NEIGHBOR_ALTERNATE = Object.freeze({
  version: 'retained-window-neighbor-alternate/v1' as const,
  hideId: 'cloudcity-detectives-hide-2',
  failedSourceKey: 'cloudcity-detectives-hide-2:walking:render:3',
  replacementSourceKey: 'cloudcity-detectives-hide-2:walking:render:1',
});
export function assertRetainedWindowManifest() {
  if (retainedWindowHash(RETAINED_WINDOW_AUTHORITIES) !== RETAINED_WINDOW_MANIFEST_SHA256)
    throw Error('RETAINED_WINDOW: public permissions differ from the frozen release');
}
export function assertRetainedKingdomTailManifest() {
  if(retainedWindowHash(RETAINED_KINGDOM_TAIL_WINDOWS)!==RETAINED_KINGDOM_TAIL_MANIFEST_SHA256)
    throw Error('RETAINED_WINDOW: Kingdom recovery differs from its public release');
}
