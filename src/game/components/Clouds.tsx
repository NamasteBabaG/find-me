"use client";

/**
 * A bank of picture-book clouds — drawn the way an illustrator draws one.
 *
 * The previous bank was dozens of individually shaded circles, and Guy read
 * it exactly as that: a group of circles, not clouds. The difference between
 * bubbles and a cumulus is that a cumulus has ONE silhouette: a single bumpy
 * outline whose lobes vary in size and rhythm, shaded as a whole, with a
 * pocket of shadow where lobe meets lobe — plus a couple of small detached
 * clouds with the classic flat-bottom profile drifting off its edge.
 *
 * So this is three copies of one continuous lobed path (a soft back
 * silhouette, a shade layer peeking out along the lobes' undersides, and the
 * white body lit toward its edge), and three little flat-bottomed cloudlets.
 * The lobe radii are hand-tuned and irregular on purpose; nothing here is a
 * free-standing circle.
 *
 * The right bank mirrors this SVG in CSS, so one drawing serves both sides.
 */

const W = 1280;
const H = 2400;
const EDGE_X = 1060;

/** The silhouette's lobes, top to bottom: radius + a sideways push. Irregular on purpose. */
const LOBES: ReadonlyArray<readonly [number, number]> = [
  [96, 24], [48, -18], [196, 34], [58, -26], [112, 16], [232, -36], [54, 22], [128, -14],
  [70, 28], [176, -28], [56, 18], [104, -30], [86, 26], [208, -16], [50, 20], [118, -28], [76, 16], [148, -22],
];

/** One continuous bumpy edge from above the top to below the bottom. */
function silhouette(): string {
  let x = EDGE_X;
  let y = -80;
  const parts = [`M 0 ${y}`, `L ${x} ${y}`];
  for (const [r, dx] of LOBES) {
    const dy = Math.round(r * 1.32);
    parts.push(`a ${r} ${r} 0 0 1 ${dx} ${dy}`);
    x += dx;
    y += dy;
  }
  parts.push(`L ${x} ${H + 80}`, `L 0 ${H + 80}`, "Z");
  return parts.join(" ");
}

/** The classic cloudlet: three arcs on a flat-bottomed base. */
function cloudlet(w: number): string {
  const h = w * 0.6;
  return [
    `M ${0.08 * w} ${0.78 * h}`,
    `A ${0.2 * w} ${0.2 * w} 0 0 1 ${0.3 * w} ${0.34 * h}`,
    `A ${0.26 * w} ${0.26 * w} 0 0 1 ${0.66 * w} ${0.3 * h}`,
    `A ${0.2 * w} ${0.2 * w} 0 0 1 ${0.92 * w} ${0.78 * h}`,
    `A ${0.08 * w} ${0.08 * w} 0 0 1 ${0.86 * w} ${0.92 * h}`,
    `L ${0.14 * w} ${0.92 * h}`,
    `A ${0.08 * w} ${0.08 * w} 0 0 1 ${0.08 * w} ${0.78 * h}`,
    "Z",
  ].join(" ");
}

const PATH = silhouette();
const PUFFS: ReadonlyArray<{ x: number; y: number; w: number; o: number }> = [
  { x: 1160, y: 340, w: 110, o: 0.96 },
  { x: 1146, y: 1110, w: 92, o: 0.88 },
  { x: 1130, y: 1870, w: 140, o: 0.93 },
];

export function CloudBank({ side }: { side: "l" | "r" }) {
  const id = `fm-cloud-${side}`;
  return (
    <div className={`scene__cloud scene__cloud--${side}`}>
      <div className="scene__cloud-edge">
        <svg className="scene__cloud-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMid slice" aria-hidden focusable="false">
          <defs>
            {/* One light across the whole bank: deep side faintly sky-tinted, the edge bright. */}
            <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f5f9ff" />
              <stop offset="0.4" stopColor="#ffffff" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
            <filter id={`${id}-soft`} x="-15%" y="-5%" width="130%" height="110%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>
          {/* a soft farther bank behind everything */}
          <path d={PATH} transform="translate(-34 0)" fill="#e7effb" opacity="0.75" filter={`url(#${id}-soft)`} />
          {/* the shade: the same silhouette peeking out under each lobe */}
          <path d={PATH} transform="translate(-22 20)" fill="#d8e4f6" opacity="0.85" />
          {/* the cloud itself */}
          <path d={PATH} fill={`url(#${id}-body)`} />
          {/* little travellers off the edge, flat-bottomed like every drawn cloud */}
          {PUFFS.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`} opacity={p.o}>
              <path d={cloudlet(p.w)} transform="translate(-4 5)" fill="#d8e4f6" opacity="0.8" />
              <path d={cloudlet(p.w)} fill="#ffffff" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
