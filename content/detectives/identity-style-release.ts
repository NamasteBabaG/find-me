import raw from "./identity-style-v1.json";
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_SOURCE_RELEASE } from "./source-release";

/** Intact original Detective scene contexts; never customer identity or Explorer face tiles. */
export const DETECTIVE_IDENTITY_STYLE_SOURCES = Object.freeze(raw.map((source, i) => {
  const board = DETECTIVE_SOURCE_BOARDS[i];
  if (!board || source.boardId !== board.board || source.art !== board.path || source.sha256 !== board.sha256
    || source.width !== board.width || source.height !== board.height || !Object.values(source.crop).every(Number.isInteger)
    || source.crop.left < 0 || source.crop.top < 0 || source.crop.width < 1 || source.crop.height < 1
    || source.crop.left + source.crop.width > board.width || source.crop.top + source.crop.height > board.height)
    throw Error(`DETECTIVES_STYLE: invalid source context ${source.boardId}`);
  return Object.freeze({ ...source, crop: Object.freeze({ ...source.crop }) });
}));
if (DETECTIVE_SOURCE_RELEASE !== "journey-detectives-source/v1" || DETECTIVE_IDENTITY_STYLE_SOURCES.length !== 9)
  throw Error("DETECTIVES_STYLE: nine exact Detective sources required");
// Precomputed canonical envelope: version,sceneVersion,worldSlug,sourceRelease,sources.
// Kept data-only so catalog imports never pull a server crypto module into client bundles.
export const DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 = "e1162f40efc6a40a0656963153a0e3b11edfd3adb6636cec85d047cca62596d3" as const;
