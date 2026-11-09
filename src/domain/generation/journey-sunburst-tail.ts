import { retainedWindowCanonicalHash } from './retained-window';
import { JOURNEY_SUNBURST_TAIL_AUTHORITIES, JOURNEY_SUNBURST_TAIL_SOURCE_MANIFEST_SHA256 } from '../../../content/detectives/journey-sunburst-tail-v1';
import type { AuthoredLocalPatchReturnContract } from '../scene/local-patch-return-region';

/** A finite, explicitly funded tail in an existing scene13 QA world. Old v2
 * SOURCE-head and single-Paris Sunburst pins retain their original contracts. */
export const JOURNEY_SUNBURST_TAIL_VERSION = 'journey-source-head-sunburst-tail/v1' as const;
export const JOURNEY_SUNBURST_TAIL_ACTION = 'generation:journey-source-head-sunburst-tail/v1' as const;
export const JOURNEY_SUNBURST_TAIL_HIDE_IDS = [
  'amazon-detectives-hide-3',
  'greatwall-detectives-hide-1',
  'paris-detectives-hide-1',
] as const;
export type JourneySunburstTailHideId = typeof JOURNEY_SUNBURST_TAIL_HIDE_IDS[number];
export const journeySunburstTailPinId = (gameId: string, hideId: JourneySunburstTailHideId) =>
  'aud_journey_head_sbt_' + retainedWindowCanonicalHash([gameId, hideId]).slice(0, 40);

export type JourneySunburstTailAuthority = typeof JOURNEY_SUNBURST_TAIL_AUTHORITIES[number];
export function assertJourneySunburstTailManifest() {
  if (retainedWindowCanonicalHash(JOURNEY_SUNBURST_TAIL_AUTHORITIES) !== JOURNEY_SUNBURST_TAIL_SOURCE_MANIFEST_SHA256)
    throw Error('JOURNEY_SUNBURST_TAIL: public SOURCE permission changed');
}

/** Binds the original authored parent without rewriting it. The distinct
 * permission may open room for the SOURCE hairstyle outside its old planning
 * return, but the native composer changes only the published head polygon. */
export function journeySunburstTailAuthorityFor(parent: AuthoredLocalPatchReturnContract): JourneySunburstTailAuthority | null {
  assertJourneySunburstTailManifest();
  const a = JOURNEY_SUNBURST_TAIL_AUTHORITIES.find(a => a.hideId === parent?.hideId);
  const equal = (x: unknown, y: unknown) => retainedWindowCanonicalHash(x) === retainedWindowCanonicalHash(y);
  return a && parent.contentVersion === 13 && parent.boardId === a.boardId && equal(parent.source, a.source)
    && equal(parent.crop, a.crop) && equal(parent.child, a.parentChild) && equal(parent.local, a.parentReturn)
    && parent.sourcePlacement?.basePlacementSha256 === a.basePlacementSha256 ? a : null;
}

