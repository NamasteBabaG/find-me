import source from "./source-v1.json";
import journey from "../worlds/journey/world.json";
import { LocalPatchBoardSchema, assertPlaceable, cropOf, maskForHide, type LocalPatchBoard } from "../../src/domain/scene/local-patch-hides";
import { localPatchReturnRegion, sourceHeadIntersectsReturnBoundary } from "../../src/domain/scene/local-patch-return-region";

/** Reviewed, child-free inputs for the Detectives runtime connection. This is
 * deliberately separate from DETECTIVE_RELEASES: source readiness does not
 * authorize a purchase before discoveries, identity and publication are wired. */
export const DETECTIVE_SOURCE_RELEASE = "journey-detectives-source/v1" as const;
export const DETECTIVE_RUNTIME_BLOCKERS = ["discoveries-and-postcards", "identity-style-source", "generation-and-publication-policy", "player-validation"] as const;
if (source.version !== DETECTIVE_SOURCE_RELEASE || source.runtimeReady !== false || source.worldSlug !== "journey")
  throw Error("DETECTIVES_SOURCE: invalid staged source release");
const routes = [...journey.nodes].sort((a, b) => a.routeIndex - b.routeIndex).map(node => node.boardSlug);
if (source.boards.length !== 9 || new Set(source.boards.map(row => row.board)).size !== 9
  || source.boards.some((row, i) => row.board !== routes[i])) throw Error("DETECTIVES_SOURCE: nine ordered Journey boards required");

export const DETECTIVE_SOURCE_BOARDS = source.boards.map(row => {
  if (!/^public\/scenes\/journey-[a-z0-9-]+-detectives-v[1-9][0-9]*\/base\.webp$/.test(row.path)
    || !/^[a-f0-9]{64}$/.test(row.sha256) || row.width !== 3840 || row.height !== 2160)
    throw Error(`DETECTIVES_SOURCE: invalid approved art for ${row.board}`);
  const board = LocalPatchBoardSchema.parse(row.definition);
  if (board.board !== row.board || board.art !== row.path || board.hides.length !== 3
    || new Set(board.hides.map(h => h.targetId)).size !== 3 || board.hides.some((hide, i) => hide.targetId !== `hide-${i + 1}`
      || !hide.hint?.he || !hide.hint.en || !hide.mask || !hide.placement || !hide.wardrobe))
    throw Error(`DETECTIVES_SOURCE: three bound placements, outfits and hints required for ${row.board}`);
  assertPlaceable(board, row);
  const annotations = source.boundaryHeadZones.find(item => item.board === row.board);
  if (annotations) {
    if (annotations.sourceArt !== row.path || annotations.sourceSha256 !== row.sha256)
      throw Error(`DETECTIVES_SOURCE: source head annotations do not bind ${row.board}`);
    for (const hide of board.hides) {
      const zone = annotations.hides.find(item => item.hideId === hide.id);
      const region = localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).region;
      if (!zone || zone.heads.some(head => sourceHeadIntersectsReturnBoundary(region, head)))
        throw Error(`DETECTIVES_SOURCE: the return window crosses an annotated source head for ${hide.id}`);
    }
  }
  return Object.freeze({ ...row, definition: board });
});

export function detectiveSourceBoard(slug: string): Readonly<{ board: string; path: string; sha256: string; width: number; height: number; definition: LocalPatchBoard }> {
  const row = DETECTIVE_SOURCE_BOARDS.find(board => board.board === slug);
  if (!row) throw Error(`DETECTIVES_SOURCE: unknown board ${slug}`);
  return row;
}
