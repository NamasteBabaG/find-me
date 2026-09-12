import sharp from "sharp";
import type { PatchJudgeInput } from "../../infra/generation/types";
import type { BoardConditioningInput } from "./board-conditioned-source";
import type { prepareBoardConditionedPlayerBoard } from "./board-conditioned-player";
import { boardConditioningHash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";

export const boardWizardContextKey = (worldId: string, boardId: string, slotId: string, attempt: number) =>
  `private:board-wizard-context:${boardConditioningHash([worldId, boardId, slotId, attempt])}`;

/** Lossless assembly of the exact player rasters, including final RGB grading.
 * The judge never receives an ungraded source pose in place of the visible child. */
export async function prepareBoardWizardReviews(worldId: string, attempt: number, input: BoardConditioningInput,
  player: Pick<Awaited<ReturnType<typeof prepareBoardConditionedPlayerBoard>>, "assetWrites"> & {
    manifest: Pick<Awaited<ReturnType<typeof prepareBoardConditionedPlayerBoard>>["manifest"], "width" | "height" | "placements">;
  }) {
  const { width, height, placements } = player.manifest;
  const overlays = placements.map(p => ({ input: player.assetWrites.find(a => a.key === p.assetKey)!.png, left: p.boardPixelRect.left, top: p.boardPixelRect.top }));
  const board = await sharp(input.board.png).composite(overlays).png().toBuffer();
  return Promise.all(input.slots.map(async direction => {
    const placed = placements.find(p => p.slotId === direction.slot.id)!;
    const patch = player.assetWrites.find(a => a.key === placed.assetKey)!;
    const regions = [direction.context, direction.originalPeople, placed.boardPixelRect];
    const left = Math.max(0, Math.min(...regions.map(r => r.left)) - 24), top = Math.max(0, Math.min(...regions.map(r => r.top)) - 24);
    const right = Math.min(width, Math.max(...regions.map(r => r.left + r.width)) + 24), bottom = Math.min(height, Math.max(...regions.map(r => r.top + r.height)) + 24);
    const context = await sharp(board).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
    const alpha = await sharp(direction.foreground.png).ensureAlpha().extractChannel(3).raw().toBuffer();
    const layered = alpha.some(v => v > 0);
    const recipe = {
      pose: direction.poseDescription,
      support: `${direction.slot.mode === "open" ? "Standing at the authored ground contact; both feet must plausibly touch the same surface as nearby people." : "Lower-body concealment by original foreground is intentional, not amputated anatomy; evaluate the visible final contact."} ${direction.lighting.key}; ${direction.lighting.fill}; ${direction.lighting.shadows}; ${direction.lighting.exposure}. Compare brightness, saturation, material shading and edge/detail density with ORIGINAL adjacent people at this depth. Reject an obviously spotlighted or overly saturated pasted figure. A sunlit standing figure with missing physically necessary cast shadow is a contact/integration defect; an already shaded location need not have a new visible shadow.`,
      occlusion: layered ? "The original foreground has been applied exactly once to the final child pixels; judge only what is actually visible in the composed scene." : "There is no foreground mask; the complete body and support must work in this open placement.",
      occlusionMode: layered ? "layer" : direction.slot.mode === "open" ? "open" : "clipped",
      comparators: `ORIGINAL painted people in crop-native rectangle x=${direction.originalPeople.left - left},y=${direction.originalPeople.top - top},width=${direction.originalPeople.width},height=${direction.originalPeople.height}, before fitting crop to 1024. Compare same-depth human head/body sizes, not different-depth figures or the inserted child.`,
    } satisfies NonNullable<PatchJudgeInput["recipe"]>;
    return { slotId: direction.slot.id, assetKey: patch.key, patchSha256: sha256Bytes(patch.png), contextKey: boardWizardContextKey(worldId, input.boardId, direction.slot.id, attempt), contextSha256: sha256Bytes(context), context, recipe };
  }));
}
