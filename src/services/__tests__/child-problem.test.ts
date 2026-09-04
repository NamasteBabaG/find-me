import { describe, expect, it } from "vitest";
import { childProblem, type PatchResult } from "../generation/patch";

/**
 * What counts as "the model painted a child".
 *
 * Every case here is a real render, with the numbers measured off it
 * (`npx tsx scripts/slot-patch.ts diagnose <world> <spot> A`). That matters:
 * this rule decides whether a roll that has already been paid for is kept, so a
 * threshold moved by feel costs real money in retries — two of these were good
 * children the old rule threw away, and about half of every roll was going the
 * same way.
 */

function render(shape: Partial<PatchResult["shape"]> & { largest: number; expected: number; painted?: number }): PatchResult {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  return {
    webp: Buffer.alloc(0),
    width: 0,
    height: 0,
    geometry: { rect: zero, hitRect: zero, anchor: { x: 0, y: 0 } },
    largest: shape.largest,
    painted: shape.painted ?? shape.largest,
    expected: shape.expected,
    shape: {
      width: shape.width ?? 100,
      height: shape.height ?? 200,
      centerX: shape.centerX ?? 0,
      centerY: shape.centerY ?? 0,
      childPx: shape.childPx ?? 200,
      slotX: shape.slotX ?? 0,
      slotY: shape.slotY ?? 0,
    },
  };
}

describe("childProblem", () => {
  it("accepts a child crouched behind market sacks, showing a third of herself", () => {
    // market/spices: she is peeking between the baskets, so her silhouette is a
    // fraction of a whole child's — which is exactly the hiding we asked for.
    expect(
      childProblem(render({ largest: 1453, expected: 4292, width: 58, height: 77, childPx: 102, centerX: 134.6, centerY: 0, slotX: 0, slotY: 0 })),
    ).toBeNull();
  });

  it("accepts a child painted larger than asked, standing a body away", () => {
    // beach/float: 1.7x the requested height, so her centre sits proportionally
    // further from the spot. One deviation, not two.
    expect(
      childProblem(render({ largest: 12872, expected: 12489, width: 131, height: 296, childPx: 174, centerX: 297.5, centerY: 0, slotX: 0, slotY: 0 })),
    ).toBeNull();
  });

  it("still rejects a repainted crop", () => {
    // beach/umbrella B: the model redrew the whole window instead of adding a child.
    expect(childProblem(render({ largest: 200_000, expected: 8435, width: 700, height: 768, childPx: 143 }))).toMatch(/far more than/);
  });

  it("still rejects a child too small to be the one asked for", () => {
    // ship/captain: 25px where a child there is ~92px.
    expect(childProblem(render({ largest: 400, expected: 3500, width: 14, height: 25, childPx: 92 }))).toMatch(/a child here is/);
  });

  it("accepts a child standing at the landmark rather than on the slot point", () => {
    // ship/lifebuoy: painted two body-heights from the slot — behind the lifebuoy,
    // which is where the mission actually sends the player. The search area
    // already bounds how far she can be found; this rule only has to catch the
    // edge of it.
    expect(childProblem(render({ largest: 9000, expected: 9000, width: 90, height: 190, childPx: 190, centerX: 380, slotX: 0 }))).toBeNull();
  });

  it("still rejects a child painted somewhere else entirely", () => {
    expect(childProblem(render({ largest: 9000, expected: 9000, width: 90, height: 190, childPx: 190, centerX: 610, slotX: 0 }))).toMatch(/away from the hiding spot/);
  });

  it("rejects scattered marks that fill a person-sized box", () => {
    // Scenery edges spread across the window: the right height and shape, but
    // nothing solid inside. Area alone could not tell this from a hiding child.
    expect(childProblem(render({ largest: 3000, expected: 12000, width: 100, height: 200, childPx: 200 }))).toMatch(/scattered marks/);
  });

  it("rejects a crop that came back unchanged", () => {
    expect(childProblem(render({ largest: 0, expected: 9000 }))).toMatch(/painted nothing/);
  });

  it("rejects something wider than it is tall", () => {
    expect(childProblem(render({ largest: 20_000, expected: 9000, width: 340, height: 200, childPx: 200 }))).toMatch(/wider than tall/);
  });

  it("rejects a child severed at the waist, and the stray smear beside her", () => {
    // icepalace/pillar came back as a torso and a pair of legs with a gap
    // between them; fairyforest/mushroom as a whole child plus a loose brown
    // blob of scenery. Both would have been drawn on the board as they are.
    expect(childProblem(render({ largest: 1877, painted: 2745, expected: 3491, width: 31, height: 128, childPx: 92 }))).toContain("in pieces");
    expect(childProblem(render({ largest: 7056, painted: 9143, expected: 8435, width: 130, height: 155, childPx: 143 }))).toContain("in pieces");
  });

  it("rejects a cut-out too narrow to be her, and one too wide to be only her", () => {
    // dragoncave/hoard was a vertical strip of hair and one eye, 24px across
    // where a child there is ~77px: childlike in height, density and position,
    // and nothing else could see it. giantlibrary/book was the largest, most
    // confident blob of the whole run — and held three other children.
    expect(childProblem(render({ largest: 1049, expected: 4292, width: 24, height: 63, childPx: 102 }))).toContain("a strip of her");
    expect(childProblem(render({ largest: 17801, expected: 8435, width: 173, height: 172, childPx: 143 }))).toContain("more than one child");
  });

  it("keeps the ones that came back whole", () => {
    // Same run, the accepted ones: one connected shape, to the pixel.
    for (const [largest, width, height, childPx] of [
      [4167, 43, 143, 113],
      [9281, 71, 208, 133],
      [13189, 84, 222, 113],
      [3701, 57, 90, 154],
      [5405, 59, 134, 113],
    ] as const) {
      expect(childProblem(render({ largest, painted: largest, expected: largest, width, height, childPx }))).toBeNull();
    }
  });
});
