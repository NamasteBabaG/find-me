import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { snakeSpots, trailPath, waveSpots } from "../map-layout";

describe("the icon map's layout", () => {
  it("lays nine places upright as three rows of three that turn at each end", () => {
    const spots = snakeSpots(9);
    expect(spots.map(s => s.x)).toEqual([0.2, 0.5, 0.8, 0.8, 0.5, 0.2, 0.2, 0.5, 0.8]);
    const rows = [spots.slice(0, 3), spots.slice(3, 6), spots.slice(6)].map(row => Math.min(...row.map(s => s.y)));
    expect(rows).toEqual([0.21, 0.505, 0.8]);
    // Room above the top row for the child, below the bottom row for a two-line name.
    for (const s of spots) expect(s.y).toBeGreaterThanOrEqual(0.21), expect(s.y).toBeLessThanOrEqual(0.83);
  });

  it("lays nine places across a wide map, alternately high and low, so neighbours never share a row", () => {
    const spots = waveSpots(9);
    expect(spots[0]).toEqual({ x: 0.08, y: 0.36 });
    expect(spots[8]).toEqual({ x: 0.92, y: 0.36 });
    for (let i = 1; i < spots.length; i++) {
      expect(spots[i]!.x).toBeGreaterThan(spots[i - 1]!.x);
      expect(spots[i]!.y).not.toBe(spots[i - 1]!.y);
    }
  });

  it("handles a round shorter than a world and an empty one", () => {
    expect(snakeSpots(1)).toEqual([{ x: 0.2, y: 0.5 }]);
    expect(snakeSpots(3).every(s => s.y >= 0.5)).toBe(true);
    expect(snakeSpots(0)).toEqual([]);
    expect(waveSpots(1)).toEqual([{ x: 0.5, y: 0.5 }]);
    expect(waveSpots(0)).toEqual([]);
    expect(trailPath([])).toBe("");
  });

  it("draws the trail through every place exactly", () => {
    const spots = snakeSpots(9), d = trailPath(spots);
    expect(d.startsWith("M200 210")).toBe(true);
    for (const s of spots.slice(1)) expect(d).toContain(` ${s.x * 1000} ${Math.round(s.y * 1000)}`);
    expect(d.match(/C/g)).toHaveLength(8);
  });
});

describe("the icon map's stylesheet", () => {
  const css = readFileSync("src/game/game.css", "utf8");

  it("keeps every medal at least the child's 64px target, on a phone too", () => {
    const sizes = Array.from(css.matchAll(/--wmap-stop:\s*(\d+)px/g)).map(m => Number(m[1]));
    expect(sizes).toEqual([96, 76]);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(64);
    for (const match of css.matchAll(/\.scene__btn\s*\{([^}]+)\}/g)) {
      if (!match[1]?.includes("width:") && !match[1]?.includes("height:")) continue;
      expect(match[1]).toContain("width: var(--touch-kid)");
      expect(match[1]).toContain("height: var(--touch-kid)");
    }
  });

  it("switches from rows to one trail by the map's own shape, and mirrors for a right-to-left game", () => {
    expect(css).toContain("container: wmap / size;");
    expect(css.match(/@container wmap \(min-aspect-ratio: 23 \/ 20\)/g)).toHaveLength(2);
    expect(css).toContain(".wmap__art:dir(rtl) { --flip: 1; }");
    expect(css).toContain(".wmap__trail:dir(rtl) { transform: scaleX(-1); }");
    expect(css).toContain('[dir="rtl"] .wmap__go-arrow { transform: scaleX(-1); }');
    // One rule places the child above the medal; travel only animates where it is.
    expect(Array.from(css.matchAll(/\.wmap__marker\s*\{([^}]+)\}/g)).filter(rule => rule[1]?.includes("transform:"))).toHaveLength(1);
    expect(css).not.toContain("--wmap-labels-height");
    expect(css).not.toContain(".wmap__go-stars");
  });
});
