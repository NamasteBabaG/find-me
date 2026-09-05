import { tf, type Dictionary } from "./index";
import type { GameShape } from "@/services/world-catalog.service";

/** "1 world · 9 places · 27 hiding spots", in the dictionary's language. */
export function gameShapeLabel(t: Dictionary, shape: GameShape): string {
  const worlds = shape.worlds === 1 ? t.common.worldCountOne : tf(t.common.worldsCount, { n: shape.worlds });
  return tf(t.common.gameShape, { worlds, places: shape.places, spots: shape.spots });
}
