/**
 * Where the places of a world sit on the icon map (Guy, 2026-11-20: the painted maps were too busy; a world is its
 * emblem and each place its own, on a calm map). The layout follows the route, not a painting, so every world
 * shares it and a new world needs no map art.
 *
 * Spots are fractions of the map box, left to right; CSS mirrors them for a right-to-left game.
 * - `snakeSpots`: an upright screen (a phone held the way Guy's rule says). Rows of three that turn at each end,
 *   so nine places fit one screen without scrolling.
 * - `waveSpots`: a wide screen. One trail across, alternately high and low, so neighbouring names never share a row.
 */
export interface MapSpot { x: number; y: number }

const COLUMNS = 3;

export function snakeSpots(count: number): MapSpot[] {
  const rows = Math.max(1, Math.ceil(count / COLUMNS));
  // The top row leaves room for the child standing above a place; the bottom row for a two-line name under it.
  const top = 0.21, bottom = 0.8;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / COLUMNS), inRow = i % COLUMNS;
    const column = row % 2 === 0 ? inRow : COLUMNS - 1 - inRow;
    const y = rows === 1 ? 0.5 : top + ((bottom - top) * row) / (rows - 1);
    // The middle of a row dips a little, so the trail reads as a path rather than a grid.
    return { x: 0.2 + column * 0.3, y: round(y + (column === 1 ? 0.03 : 0)) };
  });
}

export function waveSpots(count: number): MapSpot[] {
  if (count <= 1) return count === 1 ? [{ x: 0.5, y: 0.5 }] : [];
  return Array.from({ length: count }, (_, i) => ({ x: round(0.08 + (0.84 * i) / (count - 1)), y: i % 2 === 0 ? 0.36 : 0.7 }));
}

/**
 * The trail through `spots` as one smooth SVG path in a `size` x `size` box (the SVG stretches it to the map with
 * a non-scaling stroke). Catmull-Rom through every spot, written as cubic Beziers, so it passes each place exactly.
 */
export function trailPath(spots: readonly MapSpot[], size = 1000): string {
  if (spots.length === 0) return "";
  const p = spots.map(s => [round(s.x * size), round(s.y * size)] as const);
  let d = `M${p[0]![0]} ${p[0]![1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[i + 2] ?? p2;
    const c1 = [round(p1[0] + (p2[0] - p0[0]) / 6), round(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [round(p2[0] - (p3[0] - p1[0]) / 6), round(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
