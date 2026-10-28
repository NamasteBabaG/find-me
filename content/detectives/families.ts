/** Client-safe content selection. Historical Journey exports remain nine boards.
 * A version alone is never a world: callers select by world or an exact board.
 */
import { DETECTIVE_PATCH_BOARDS, DETECTIVE_ADVENTURE_CATALOG } from './runtime-release';
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_SOURCE_RELEASE } from './source-release';
import { DETECTIVE_IDENTITY_STYLE_SOURCES, DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from './identity-style-release';
import { KINGDOM_DETECTIVE_PATCH_BOARDS, KINGDOM_DETECTIVE_ADVENTURE_CATALOG } from './kingdom/runtime-release';
import { KINGDOM_DETECTIVE_SOURCE_BOARDS, KINGDOM_DETECTIVE_SOURCE_RELEASE } from './kingdom/source-release';
import { KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES, KINGDOM_DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from './kingdom/identity-style-release';

export const DETECTIVE_FAMILIES = Object.freeze([
  Object.freeze({worldSlug:'journey' as const,familyId:'journey-detectives/v1' as const,sourceRelease:DETECTIVE_SOURCE_RELEASE,
    boards:DETECTIVE_PATCH_BOARDS,sources:DETECTIVE_SOURCE_BOARDS,adventure:DETECTIVE_ADVENTURE_CATALOG,
    styles:DETECTIVE_IDENTITY_STYLE_SOURCES,styleSha256:DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256}),
  Object.freeze({worldSlug:'kingdom' as const,familyId:'kingdom-detectives/v1' as const,sourceRelease:KINGDOM_DETECTIVE_SOURCE_RELEASE,
    boards:KINGDOM_DETECTIVE_PATCH_BOARDS,sources:KINGDOM_DETECTIVE_SOURCE_BOARDS,adventure:KINGDOM_DETECTIVE_ADVENTURE_CATALOG,
    styles:KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES,styleSha256:KINGDOM_DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256}),
]);
export type DetectiveWorld = typeof DETECTIVE_FAMILIES[number]['worldSlug'];
export function detectiveFamilyForWorld(world: string) {
  const family=DETECTIVE_FAMILIES.find(f=>f.worldSlug===world);
  if(!family) throw Error('DETECTIVE_FAMILY: unknown world');
  return family;
}
export function detectiveFamilyForBoard(board: string) {
  const family=DETECTIVE_FAMILIES.find(f=>f.boards.some(b=>b.board===board));
  if(!family) throw Error('DETECTIVE_FAMILY: unknown board');
  return family;
}
export const ALL_DETECTIVE_PATCH_BOARDS=Object.freeze(DETECTIVE_FAMILIES.flatMap(f=>f.boards));
export const ALL_DETECTIVE_SOURCE_BOARDS=Object.freeze(DETECTIVE_FAMILIES.flatMap(f=>f.sources));
