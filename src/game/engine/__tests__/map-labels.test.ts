import { describe, expect, it } from "vitest";
import { allWorlds } from "../../../../content/worlds";
import { fitMapLabels, mapLabelsMinHeight, mapMarkerSpace, type MapLabel } from "../map-labels";
import { readFileSync } from "node:fs";

describe("64px map controls", () => {
  it.each([[288, 192], [320, 213], [358, 239], [640, 427], [1100, 733]])("keeps every translated place reachable without clipped or overlapping padding at %i × %i", (width, availableHeight) => {
    for (const world of allWorlds().slice(0, 2)) {
      // The measured pill is CSS-capped to one third of the frame minus the 16px halo.
      const labels = world.nodes.map((node, i) => ({ id: node.boardSlug, x: node.x, y: node.y, width: Math.max(64, Math.min(72 + i * 11, width / 3 - 16) + 16) }));
      const height = Math.max(availableHeight, mapLabelsMinHeight(labels));
      const saved = JSON.stringify(world);
      const positions = fitMapLabels(labels, width, height);
      expect(Object.keys(positions)).toHaveLength(9);
      labels.forEach((label, index) => {
        const p = positions[label.id]!, x = p.x * width, y = p.y * height;
        expect(x - label.width / 2).toBeGreaterThanOrEqual(-1e-8);
        expect(x + label.width / 2).toBeLessThanOrEqual(width + 1e-8);
        expect(y - 32).toBeGreaterThanOrEqual(-1e-8);
        expect(y + 32).toBeLessThanOrEqual(height + 1e-8);
        for (const other of labels.slice(index + 1)) {
          const q = positions[other.id]!;
          expect(Math.abs(x - q.x * width) + 1e-8 >= (label.width + other.width) / 2 || Math.abs(y - q.y * height) + 1e-8 >= 64).toBe(true);
        }
      });
      expect(JSON.stringify(world)).toBe(saved);
    }
  });

  it.each([288, 320, 358, 1100])("reserves actual wrapped name and badge heights in all nine fallback cells at %ipx", width => {
    // A very long translated name and a stacked star badge can need more than 64px.
    // All authored points deliberately coincide so fitting must reorganize the labels.
    const labels: MapLabel[] = [80, 112, 64, 64, 96, 76, 136, 64, 84].map((height, i) => ({ id: `place-${i}`, x: 0.5, y: 0.5, width: width / 3 - 3, height }));
    const saved = JSON.stringify(labels);
    const height = mapLabelsMinHeight(labels);
    expect(height).toBe(112 + 96 + 136 + 16);
    const positions = fitMapLabels(labels, width, height);
    expect(Object.keys(positions)).toHaveLength(9);
    labels.forEach((label, index) => {
      const p = positions[label.id]!, x = p.x * width, y = p.y * height;
      const h = Math.max(64, label.height!);
      expect(x - label.width / 2).toBeGreaterThanOrEqual(-1e-8);
      expect(x + label.width / 2).toBeLessThanOrEqual(width + 1e-8);
      expect(y - h / 2).toBeGreaterThanOrEqual(-1e-8);
      expect(y + h / 2).toBeLessThanOrEqual(height + 1e-8);
      for (const other of labels.slice(index + 1)) {
        const q = positions[other.id]!;
        expect(Math.abs(x - q.x * width) + 1e-8 >= (label.width + other.width) / 2 || Math.abs(y - q.y * height) + 1e-8 >= (h + Math.max(64, other.height!)) / 2).toBe(true);
      }
    });
    expect(JSON.stringify(labels)).toBe(saved);
  });

  it("grows only the affected fallback row and handles an empty map", () => {
    const labels = Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, x: 0.5, y: 0.5, width: 80, height: i === 0 ? 112 : 24 }));
    expect(mapLabelsMinHeight(labels)).toBe(112 + 64 + 64 + 16);
    expect(mapLabelsMinHeight([])).toBe(0);
  });

  it.each([[44, 64], [112, 64], [60, 48]])("keeps a %ipx current pill clear of its %ipx marker and every neighboring target", (buttonHeight, markerHeight) => {
    const space = mapMarkerSpace(buttonHeight, markerHeight);
    const labels: MapLabel[] = Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, x: 0.5, y: 0.5, width: 93, height: i === 0 ? Math.max(64, buttonHeight + 1, space.height) : 64 }));
    const saved = JSON.stringify(labels);
    const width = 288, height = mapLabelsMinHeight(labels);
    const positions = fitMapLabels(labels, width, height);
    const active = positions["0"]!, x = active.x * width, y = active.y * height;
    const markerTop = y - space.clearance - markerHeight - 8; // Include the existing upward travel bob.
    const markerBottom = y - space.clearance;
    expect(y - buttonHeight / 2 - markerBottom).toBe(8);
    expect(markerTop).toBeGreaterThanOrEqual(0);
    expect(markerBottom).toBeLessThanOrEqual(height);
    for (const other of labels.slice(1)) {
      const q = positions[other.id]!, otherX = q.x * width, otherY = q.y * height;
      // The measured 64px sticker and its upward motion never enter another control.
      const separate = x + 32 <= otherX - other.width / 2 || x - 32 >= otherX + other.width / 2 || markerBottom <= otherY - 32 || markerTop >= otherY + 32;
      expect(separate).toBe(true);
    }
    expect(JSON.stringify(labels)).toBe(saved);
  });

  it("keeps spaced authored labels in place and ignores an unmeasured frame", () => {
    const labels = [{ id: "first", x: 0.2, y: 0.2, width: 80 }, { id: "last", x: 0.8, y: 0.8, width: 80 }];
    expect(fitMapLabels(labels, 500, 400)).toEqual({ first: { x: 0.2, y: 0.2 }, last: { x: 0.8, y: 0.8 } });
    expect(fitMapLabels(labels, 0, 0)).toEqual({});
  });

  it("sizes the actual CSS halo and scene chrome to the child floor, with no mobile shrink override", () => {
    const css = readFileSync("src/game/game.css", "utf8");
    for (const match of css.matchAll(/\.scene__btn\s*\{([^}]+)\}/g)) {
      if (!match[1]?.includes("width:") && !match[1]?.includes("height:")) continue;
      expect(match[1]).toContain("width: var(--touch-kid)");
      expect(match[1]).toContain("height: var(--touch-kid)");
    }
    expect(css).toContain("height: max(100%, var(--touch-kid)); transform: translate(-50%, -50%)");
    expect(css).toContain(".wmap__place:has(.wmap__place-stars) { flex-direction: column;");
    expect(css).toContain("var(--wmap-labels-height, 0px)");
    expect(css).toContain("width: 100%; max-width: 100%; min-width: 0;");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    const markerRules = Array.from(css.matchAll(/\.wmap__marker\s*\{([^}]+)\}/g));
    expect(markerRules.filter(rule => rule[1]?.includes("transform:"))).toHaveLength(1);
    expect(css).toContain("calc(-100% - var(--wmap-marker-clearance, var(--space-4)))");
    expect(css).not.toContain("(var(--touch-min) - var(--space-3))");
    expect(css).toContain('[dir="rtl"] .wmap__go-arrow { transform: scaleX(-1); }');
  });
});
