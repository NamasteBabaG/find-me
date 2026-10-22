import raw from "./runtime-v1.json";
import journey from "../worlds/journey/world.json";
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_SOURCE_RELEASE } from "./source-release";
import { DETECTIVES_SCENE_VERSION } from "../../src/domain/scene/local-patch-versions";
import { LocalPatchBoardSchema, assertPlaceable, cropOf, maskForHide } from "../../src/domain/scene/local-patch-hides";
import { localPatchReturnRegion, sourceHeadIntersectsReturnBoundary } from "../../src/domain/scene/local-patch-return-region";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";

/** Prospective scene13 authoring. Source-v1 and every historical paid recipe stay immutable.
 * Data readiness does not activate sales or supply a visual verdict for generated pixels. */
export const DETECTIVE_RUNTIME_RELEASE = "journey-detectives-runtime/v1" as const;
const routes = [...journey.nodes].sort((a,b) => a.routeIndex-b.routeIndex).map(row => row.boardSlug);
if (raw.version !== DETECTIVE_RUNTIME_RELEASE || raw.sceneVersion !== DETECTIVES_SCENE_VERSION
  || raw.worldSlug !== "journey" || raw.sourceRelease !== DETECTIVE_SOURCE_RELEASE
  || raw.boards.length !== 9 || raw.boards.some((row,i) => row.board !== routes[i]))
  throw Error("DETECTIVES_RUNTIME: exact ordered scene13 family required");

export const DETECTIVE_PATCH_BOARDS = Object.freeze(raw.boards.map((row,i) => {
  const source = DETECTIVE_SOURCE_BOARDS[i], board = LocalPatchBoardSchema.parse(row.definition);
  if (!source || row.board !== source.board || board.board !== row.board || board.art !== source.path
    || JSON.stringify(row.source) !== JSON.stringify({ path:source.path,sha256:source.sha256,width:source.width,height:source.height })
    || board.hides.length !== 3 || board.hides.some((hide,j) => hide.id !== `${row.board}-detectives-hide-${j+1}`
      || hide.targetId !== `hide-${j+1}` || !hide.mask || !hide.returnRect || !hide.hint || !hide.placement || !hide.wardrobe))
    throw Error(`DETECTIVES_RUNTIME: mixed source or incomplete placement ${row.board}`);
  assertPlaceable(board,source);
  return board;
}));

export const DETECTIVE_SOURCE_NEIGHBORS = Object.freeze(raw.boards.flatMap(row => row.sourceNeighbors).map(entry => {
  const board = DETECTIVE_PATCH_BOARDS.find(b => b.board === entry.boardId), hide = board?.hides.find(h => h.id === entry.hideId);
  if (!board || !hide || entry.neighbors.length < 1 || entry.neighbors.length > 8
    || new Set(entry.neighbors.map(n => n.sourceId)).size !== entry.neighbors.length)
    throw Error(`DETECTIVES_RUNTIME: invalid local source neighborhood ${entry.hideId}`);
  const region = localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).region;
  for (const neighbor of entry.neighbors) {
    const h=neighbor.head;
    if (!neighbor.sourceId || !Object.values(h).every(Number.isInteger) || h.left<0 || h.top<0 || h.width<1 || h.height<1
      || h.left+h.width>3840 || h.top+h.height>2160 || sourceHeadIntersectsReturnBoundary(region,h))
      throw Error(`DETECTIVES_RUNTIME: unsafe source head ${entry.hideId}/${neighbor.sourceId}`);
  }
  return Object.freeze({ boardId:entry.boardId,hideId:entry.hideId,
    neighbors:Object.freeze(entry.neighbors.map(n => Object.freeze({ sourceId:n.sourceId,head:Object.freeze({...n.head}) }))) });
}));
if (DETECTIVE_SOURCE_NEIGHBORS.length !== 27 || new Set(DETECTIVE_SOURCE_NEIGHBORS.map(n => n.hideId)).size !== 27)
  throw Error("DETECTIVES_RUNTIME: explicit local source coverage required for every authored return");

export const DETECTIVE_ADVENTURE_CATALOG = AdventureCatalogSchema.parse({ version:1,releaseId:"journey-detectives-v13",boards:raw.boards.map(row => row.adventure) });
for (const board of DETECTIVE_PATCH_BOARDS) {
  const plan=DETECTIVE_ADVENTURE_CATALOG.boards.find(p => p.boardSlug===board.board);
  if (!plan || plan.status!=="ready" || plan.sceneVersion!==13 || plan.worldSlug!=="journey" || plan.discoveries.length!==6)
    throw Error(`DETECTIVES_RUNTIME: incomplete adventure ${board.board}`);
  // Album protection follows the immutable shipped raster, not its smaller repainted return.
  const normalized=board.hides.map(hide => {const r=cropOf(hide);
    return {x:r.left/plan.art.width,y:r.top/plan.art.height,w:r.width/plan.art.width,h:r.height/plan.art.height};});
  if(JSON.stringify(plan.personalZones)!==JSON.stringify(normalized) || !board.hides.some(hide=>hide.targetId===plan.postcard.targetId))
    throw Error(`DETECTIVES_RUNTIME: shipping crop/postcard binding mismatch ${board.board}`);
}
