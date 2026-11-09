import type { Container } from "../container";
import { localPatchReadyReviewOwed } from "../../domain/scene/local-patch-progress";
import { sunburstPaintRequiredCapacity } from "../../domain/generation/sunburst-painter";

/** Called under the game's generation lease before a new purchase. A complete
 * assessment of every other unpaid review stays covered, even across boards. */
export async function sunburstRequiredPaintCapacity(c: Pick<Container, "db">, gameId: string, replacingRowId: string) {
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: "A", status: "GENERATED",
    targetInstance: { gameScene: { gameId } } }, select: { id: true, status: true, judgeJson: true } });
  const owed = rows.filter(row => row.id !== replacingRowId && localPatchReadyReviewOwed(row, { required: true })).length;
  return sunburstPaintRequiredCapacity(owed);
}
