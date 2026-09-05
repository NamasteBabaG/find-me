"use client";

/**
 * A bank of picture-book clouds.
 *
 * The curtain over a board is two of these, one from each side, over a sky.
 * Each bank is a wall of cumulus along its inner edge: round lumps in three
 * sizes, each lit from its upper right and shaded toward its lower left,
 * painted back to front so every lump sits in front of the one behind it,
 * the way a cartoon cloud is drawn. A soft body behind them keeps the wall
 * from ever showing a gap. It is one SVG pattern tiled down the edge, so it
 * costs a few dozen circles and no images, and it scales with the board
 * rather than with the screen.
 *
 * The old edge was a column of flat white discs on a plain bank, and it read
 * as a loading placeholder, not as clouds.
 */

/** One tile of the cloud wall; the bank's inner edge is x = EDGE. */
const TILE_W = 900;
const TILE_H = 820;
const EDGE = 600;

/** cx, cy, r — painted in this order: small lumps deep in the bank, the middle row, the big lumps on the edge, tufts beyond it. */
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  // deep in the bank, small
  [430, 60, 44],
  [420, 250, 50],
  [438, 430, 40],
  [416, 610, 54],
  [434, 780, 42],
  // the middle row
  [515, 140, 78],
  [498, 330, 66],
  [526, 500, 84],
  [504, 690, 70],
  // the edge, big: some lumps push out further than others
  [600, 30, 100],
  [650, 220, 124],
  [586, 400, 96],
  [662, 590, 118],
  [604, 760, 94],
  // tufts past the edge
  [738, 120, 36],
  [752, 330, 42],
  [730, 480, 30],
  [760, 680, 40],
];

/** A lump that crosses the tile's top or bottom is drawn again one tile away, so the wall tiles without a seam. */
function tiled(): ReadonlyArray<readonly [number, number, number]> {
  const out: Array<readonly [number, number, number]> = [];
  for (const [cx, cy, r] of PUFFS) {
    out.push([cx, cy, r]);
    if (cy - r < 0) out.push([cx, cy + TILE_H, r]);
    if (cy + r > TILE_H) out.push([cx, cy - TILE_H, r]);
  }
  return out;
}

const WALL = tiled();

export function CloudBank({ side }: { side: "l" | "r" }) {
  const id = `fm-cloud-${side}`;
  return (
    <div className={`scene__cloud scene__cloud--${side}`}>
      <div className="scene__cloud-edge">
        <svg className="scene__cloud-svg" viewBox={`0 0 ${EDGE} 2400`} preserveAspectRatio="xMaxYMid slice" aria-hidden focusable="false">
          <defs>
            {/* One lump: white, lit from the upper right, a breath of sky blue along its lower rim. */}
            <radialGradient id={`${id}-lump`} cx="0.62" cy="0.3" r="0.82">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#ffffff" />
              <stop offset="0.8" stopColor="#f1f6fe" />
              <stop offset="1" stopColor="#c6d6ef" />
            </radialGradient>
            {/* The cloud body behind the lumps: sky-tinted deep in the bank, white at the edge. */}
            <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#eef4fd" stopOpacity="0.9" />
              <stop offset="1" stopColor="#f7faff" stopOpacity="1" />
            </linearGradient>
            <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="18" />
            </filter>
            <pattern id={`${id}-wall`} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
              {/* a soft halo so the wall melts into the sky rather than sitting on it */}
              <g fill="#ffffff" opacity="0.45" filter={`url(#${id}-soft)`}>
                {WALL.map(([cx, cy, r], i) => (
                  <circle key={`h${i}`} cx={cx} cy={cy} r={r + 14} />
                ))}
              </g>
              <rect x="380" y="0" width="240" height={TILE_H} fill={`url(#${id}-body)`} />
              <g fill={`url(#${id}-lump)`}>
                {WALL.map(([cx, cy, r], i) => (
                  <circle key={`p${i}`} cx={cx} cy={cy} r={r} />
                ))}
              </g>
            </pattern>
          </defs>
          <rect x="0" y="0" width={TILE_W} height="2400" fill={`url(#${id}-wall)`} />
        </svg>
      </div>
    </div>
  );
}
