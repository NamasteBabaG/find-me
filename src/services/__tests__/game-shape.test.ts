import { describe, expect, it } from "vitest";
import { gameShape } from "../world-catalog.service";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";

/**
 * A one-world game is one world, nine places and twenty-seven hiding spots.
 * It used to be described as "9 worlds" the moment the parent had paid.
 */
describe("the shape of a game", () => {
  const [journey, kingdom] = allWorlds();

  it("counts one complete world as one world, nine places, 27 spots", () => {
    expect(gameShape(boardSlugs(journey!))).toEqual({ worlds: 1, places: 9, spots: 27 });
  });

  it("counts two complete worlds as two", () => {
    if (!kingdom) return;
    expect(gameShape([...boardSlugs(journey!), ...boardSlugs(kingdom)])).toEqual({ worlds: 2, places: 18, spots: 54 });
  });

  it("does not call half a world a world", () => {
    const shape = gameShape(boardSlugs(journey!).slice(0, 5));
    expect(shape.worlds).toBe(0);
    expect(shape.places).toBe(5);
    expect(shape.spots).toBe(15);
  });
});
