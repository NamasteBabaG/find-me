import sharp, { type OverlayOptions } from "sharp";
import { readBoardConditionedCatalog, loadBoardConditionedCatalogBoard } from "./board-conditioned-catalog";
import { sha256Bytes } from "./fixed-sprite";
import type { QaCharacterStyleContract } from "../../infra/generation/types";

export const BOARD_WIZARD_IDENTITY_STYLE_VERSION: QaCharacterStyleContract["version"] = "board-matched-identity/v1";
/** Mandatory source-backed style reference. No photo, generated identity or
 * network input enters this builder, and missing assets never fall back to prose.
 * Nine original-people crops show medium/linework, not identity-sheet lighting. */
export async function buildBoardWizardIdentityStyle(root = process.cwd()) {
  const { catalog, sha256: catalogSha256 } = await readBoardConditionedCatalog(root);
  const empty = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#808080" } }).png().toBuffer();
  const reference = { profileId: "static-style-reference-only", ageYears: 8, referenceRole: "illustrated-identity" as const,
    illustratedIdentity: { png: empty, sha256: sha256Bytes(empty) } };
  const composites: OverlayOptions[] = [], examples = [];
  for (const [index, entry] of catalog.boards.entries()) {
    // The existing loader verifies paths, realpath containment, exact PNG hashes
    // and all mandatory static assets. Its synthetic child is never composited.
    const input = await loadBoardConditionedCatalogBoard(catalog, entry.boardId, reference, root);
    const crop = entry.slots[0]!.originalPeople, image = sharp(input.board.png, { limitInputPixels: 25_000_000 }), metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1
      || (metadata.orientation ?? 1) !== 1 || crop.left + crop.width > metadata.width || crop.top + crop.height > metadata.height) {
      throw new Error("BOARD_IDENTITY_STYLE: original-people example is outside its verified static board");
    }
    const native = await image.extract(crop).png().toBuffer();
    const tile = await sharp(native).resize(320, 320, { fit: "contain", background: "#e4dfd5" }).png().toBuffer();
    composites.push({ input: tile, left: 16 + (index % 3) * 336, top: 16 + Math.floor(index / 3) * 336 });
    examples.push({ boardId: entry.boardId, boardSha256: input.board.sha256, crop, cropSha256: sha256Bytes(native) });
  }
  if (examples.length !== 9) throw new Error("BOARD_IDENTITY_STYLE: all nine original-board examples are required");
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#e4dfd5" } }).composite(composites).png().toBuffer();
  return { png, version: BOARD_WIZARD_IDENTITY_STYLE_VERSION, catalogSha256, atlasSha256: sha256Bytes(png), examples };
}
