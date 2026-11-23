import { KINGDOM_FALLBACK_PLACEMENT as profile, KINGDOM_FALLBACK_PLACEMENT_SHA256 } from '../../../content/detectives/kingdom/fallback-placement-v1';
import { assertPlaceable, cropOf, LocalPatchBoardSchema, maskForHide, type LocalPatchBoard } from './local-patch-hides';
import { LOCAL_PATCH_RETURN_FEATHER, localPatchReturnRegion, rectanglesIntersect, type AuthoredLocalPatchReturnContract,
  type PatchRectangle } from './local-patch-return-region';
import type { ContinuityReading } from './local-patch-body-continuity';
import { AdventureCatalogSchema, type AdventureCatalog } from '../adventure/content';
import { prepareSourceNeighborContract, SOURCE_NEIGHBOR_CONTRACT_VERSION } from './local-patch-source-neighbors';
import { detectiveSourcePlacementHideContractSchema, sourcePlacementSha256, type SourcePlacementHideContract } from './source-placement-release';

const same = (a: unknown, b: unknown) => sourcePlacementSha256(a) === sourcePlacementSha256(b);

export function kingdomFallbackBoard(board: LocalPatchBoard): LocalPatchBoard {
  const original = board.hides.find(hide => hide.id === profile.hideId);
  if (sourcePlacementSha256(profile) !== KINGDOM_FALLBACK_PLACEMENT_SHA256 || board.board !== profile.boardId
    || !original || original.targetId !== profile.targetId || !same(cropOf(original), profile.originalCrop)
    || !same(original.returnRect, profile.originalReturn)) throw Error('KINGDOM_FALLBACK: invalid public placement parent');
  const next = { ...original, ...profile.fallback };
  const returned = localPatchReturnRegion(cropOf(next), maskForHide(next), next.returnRect).region;
  if (board.hides.some(hide => rectanglesIntersect(returned,
    localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).region)))
    throw Error('KINGDOM_FALLBACK: the alternate touches another placement');
  return LocalPatchBoardSchema.parse({ ...board, hides: board.hides.map(hide => hide.id === profile.hideId ? next : hide) });
}

export function kingdomFallbackPlacement(board: LocalPatchBoard, original: SourcePlacementHideContract) {
  if (original.sceneVersion !== 13 || original.hideId !== profile.hideId || original.boardId !== profile.boardId
    || original.source.sha256 !== profile.sourceSha256 || original.source.art !== board.art
    || !same(original.effective.crop, profile.originalCrop) || !same(original.effective.returnRect, profile.originalReturn))
    throw Error('KINGDOM_FALLBACK: source placement differs from its registered parent');
  const alternate = kingdomFallbackBoard(board);
  assertPlaceable(alternate, original.source);
  const hide = alternate.hides.find(item => item.id === profile.hideId)!;
  const effective = { crop: cropOf(hide), child: maskForHide(hide), returnRect: hide.returnRect! };
  const context = { boardId: original.boardId, hideId: original.hideId, source: original.source,
    crop: effective.crop, returnRect: effective.returnRect };
  const neighbors = prepareSourceNeighborContract({ ...context, version: SOURCE_NEIGHBOR_CONTRACT_VERSION,
    neighbors: profile.neighbors }, context);
  if (!neighbors.ok) throw Error('KINGDOM_FALLBACK: alternate breaks the source neighbor contract');
  const contract = detectiveSourcePlacementHideContractSchema.parse({ ...original, effective,
    sourceNeighbors: { contract: neighbors.contract, contractSha256: neighbors.contractSha256 } });
  return { board: alternate, contract };
}

/** The passport checks the full sprite crop against its own catalog geometry. */
export function kingdomFallbackAdventure(catalog: AdventureCatalog): AdventureCatalog {
  const parent = catalog.boards.find(board => board.boardSlug === profile.boardId);
  if (parent?.status !== 'ready' || parent.sceneVersion !== 13 || parent.art.sha256 !== profile.sourceSha256
    || parent.postcard.targetId === profile.targetId) throw Error('KINGDOM_FALLBACK: invalid passport placement parent');
  const normalize = ({ left, top, width, height }: ReturnType<typeof cropOf>) => ({ x: left / parent.art.width,
    y: top / parent.art.height, w: width / parent.art.width, h: height / parent.art.height });
  const original = normalize(profile.originalCrop);
  const alternate = normalize({ ...profile.originalCrop, left: profile.fallback.left, top: profile.fallback.top });
  if (parent.personalZones.filter(zone => same(zone, original)).length !== 1)
    throw Error('KINGDOM_FALLBACK: no exact passport zone to replace');
  return AdventureCatalogSchema.parse({ ...catalog, boards: catalog.boards.map(board => board === parent
    ? { ...parent, personalZones: parent.personalZones.map(zone => same(zone, original) ? alternate : zone) } : board) });
}

/** A paid crown at the right feather of the candy-tray placement can use
 * the adjacent background. Keep the crop, mask, and other three joins intact. */
export function kingdomFallbackHeadEdge(parent: AuthoredLocalPatchReturnContract | undefined, heads: readonly PatchRectangle[]) {
  const crop = { ...profile.originalCrop, left: profile.fallback.left, top: profile.fallback.top };
  const returned = profile.fallback.returnRect, feather = LOCAL_PATCH_RETURN_FEATHER;
  if (parent?.contentVersion !== 13 || parent.hideId !== profile.hideId || parent.boardId !== profile.boardId
    || parent.source?.sha256 !== profile.sourceSha256 || parent.sourcePlacement?.manifestSha256 !== KINGDOM_FALLBACK_PLACEMENT_SHA256
    || !same(parent.crop, crop) || !same(parent.child, profile.fallback.mask) || !same(parent.local, returned)
    || heads.length !== 2) return null;
  const right = returned.left + returned.width;
  const gaps = heads.map(head => right - head.left - head.width);
  if (gaps.some(gap => gap < 1) || !gaps.some(gap => gap <= 2)
    || heads.some(head => head.left - returned.left < feather || head.top - returned.top < feather
      || returned.top + returned.height - head.top - head.height < feather)) return null;
  const extra = 2 * feather;
  const strip = { left: crop.left + right, top: crop.top + returned.top, width: extra + feather, height: returned.height };
  if (right + extra > crop.width || profile.neighbors.some(neighbor => rectanglesIntersect(strip, neighbor.head))) return null;
  return { ...returned, width: returned.width + extra };
}

/** The corroborated failure must be on the original complete, settled board review. */
export function kingdomFallbackRefusal(judgeJson: string | null, continuity: ContinuityReading | null) {
  if (!judgeJson) return null;
  try {
    const saved = JSON.parse(judgeJson);
    const verdict = saved.verdict;
    if (saved.hide !== profile.hideId || saved.pose !== 'standing' || saved.reviewState !== 'board-review-complete'
      || saved.wireFault !== null || saved.authoredReturn?.source?.sha256 !== profile.sourceSha256
      || !same(saved.authoredReturn.crop, profile.originalCrop) || !same(saved.authoredReturn.local, profile.originalReturn)
      || saved.qualityDisposition?.state !== 'retry' || verdict?.verdict !== 'fail' || verdict.pictureWhole !== 'fail'
      || verdict.childComplete !== 'fail' || verdict.boundaryIntegrity?.bottom?.status !== 'fail'
      || !continuity?.ok || !continuity.people.some(person => (!continuity.crowd || person.role === 'target') && person.state === 'broken'
        && person.visibleBody && person.faults.some(fault => fault.kind === 'hard-cut'
          && /(?:\bbottom\b|\by\s*=?\s*496\b)/i.test(fault.where)))
      || typeof saved.judgedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(saved.judgedSha256)
      || typeof saved.boardReview?.requestKey !== 'string') return null;
    return { reviewKey: saved.boardReview.requestKey as string };
  } catch { return null; }
}
