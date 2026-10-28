import raw from "./identity-style-v1.json";
import { KINGDOM_DETECTIVE_SOURCE_BOARDS, KINGDOM_DETECTIVE_SOURCE_RELEASE } from "./source-release";

/** Intact original Detective scene contexts; never customer identity or Explorer face tiles. */
export const KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES = Object.freeze(raw.map((source, i) => {
  const board = KINGDOM_DETECTIVE_SOURCE_BOARDS[i];
  if (!board || source.boardId !== board.board || source.art !== board.path || source.sha256 !== board.sha256
    || source.width !== board.width || source.height !== board.height || !Object.values(source.crop).every(Number.isInteger)
    || source.crop.left < 0 || source.crop.top < 0 || source.crop.width < 1 || source.crop.height < 1
    || source.crop.left + source.crop.width > board.width || source.crop.top + source.crop.height > board.height)
    throw Error(`DETECTIVES_STYLE: invalid source context ${source.boardId}`);
  return Object.freeze({ ...source, crop: Object.freeze({ ...source.crop }) });
}));
if (KINGDOM_DETECTIVE_SOURCE_RELEASE !== "kingdom-detectives-source/v1" || KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES.length !== 9)
  throw Error("DETECTIVES_STYLE: nine exact Detective sources required");
// Precomputed canonical envelope: version,sceneVersion,worldSlug,sourceRelease,sources.
// Kept data-only so catalog imports never pull a server crypto module into client bundles.
export const KINGDOM_DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 = "baac3cb8dc95ef191d3ab318886ee95b5d9793e4b2a17328d149bd259745b554" as const;
