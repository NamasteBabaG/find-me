// React is imported, not assumed: the scenes below are built when the module loads (like PlaceEmblem.tsx).
import React, { type ReactNode } from "react";

// The four stops of "how it works", drawn in the place emblems' own hand (PlaceEmblem.tsx): rounded ink, the
// same muted gouache, a soft blob behind each, a sun dot and a small spark. Scenes, not icon tiles (Guy,
// 2026-11-26): the icon chips belong to "what's inside" below, and the steps read as a little story.
const sun = "var(--sun, #f6c848)";
const sea = "#86bec5";
const leaf = "#9dc9b0";
const coral = "#e8a18b";
const violet = "#b9abd3";
const paper = "#fffaf0";
const ink = "var(--ink, #29253b)";

/** A child's face in the house style: the same small portrait in the photo, the painting and the lens. */
const face = (x: number, y: number, r: number) => <>
  <circle cx={x} cy={y} r={r} fill={paper} />
  {/* Hair: the top of the head, and a fringe that curves back up across the forehead. */}
  <path d={`M${x - r} ${y - 1}A${r} ${r} 0 0 1 ${x + r} ${y - 1}Q${x} ${y - r * 0.55} ${x - r} ${y - 1}z`} fill={sun} />
  <path d={`M${x - r * 0.38} ${y + 1}v1M${x + r * 0.38} ${y + 1}v1M${x - r * 0.3} ${y + r * 0.5}q${r * 0.3} ${r * 0.22} ${r * 0.6} 0`} />
</>;

const scenes: readonly ReactNode[] = [
  // 1 · Meet who's hiding: the child's photo, and it goes up.
  <>
    <g transform="rotate(-6 80 70)">
      <rect x="50" y="30" width="60" height="76" rx="5" fill={paper} />
      <rect x="57" y="37" width="46" height="46" rx="3" fill={sea} />
      <path d="M62 83q2-13 18-13t18 13z" fill={coral} />
      {face(80, 58, 10)}
      <path d="M60 94h22" />
    </g>
    <circle cx="113" cy="98" r="11" fill={leaf} />
    <path d="M113 103V93m-4 4 4-4 4 4" />
  </>,
  // 2 · Choose where to go: a folded map, a dotted route and the pin at its end.
  <>
    <path d="M36 46l28-8v62l-28 8z" fill={sea} />
    <path d="M64 38l32 8v62l-32-8z" fill={leaf} />
    <path d="M96 46l28-8v62l-28 8z" fill={paper} />
    <path d="M47 94q13-20 29-10t30-20" strokeDasharray="1 6" strokeWidth="2.5" />
    <circle cx="46" cy="95" r="3.5" fill={sun} />
    <path d="M108 70q-12-13-12-21a12 12 0 0 1 24 0q0 8-12 21z" fill={coral} />
    <circle cx="108" cy="49" r="4" fill={paper} />
  </>,
  // 3 · We make it and check it: the child painted into a little world, and it passes.
  <>
    <path d="M58 82l-10 28m50-28 10 28M78 82v24" />
    <rect x="44" y="30" width="68" height="54" rx="4" fill={paper} />
    <path d="M48 80q15-18 30-6t30-8v14z" fill={leaf} />
    <circle cx="99" cy="43" r="6" fill={sun} />
    <path d="M63 80q8-16 16 0z" fill={coral} />
    {face(71, 58, 8)}
    <path d="M124 36l-18 26" strokeWidth="4" />
    <path d="M106 62l-6 9 9-3z" fill={sun} />
    <circle cx="115" cy="98" r="11" fill={leaf} />
    <path d="M110 98l3.5 3.5 6.5-7" />
  </>,
  // 4 · Open and search: a crowd, a magnifier, and in its lens the one they were looking for.
  <>
    <circle cx="38" cy="100" r="7" fill={violet} />
    <circle cx="54" cy="107" r="7" fill={sea} />
    <circle cx="126" cy="104" r="7" fill={violet} />
    <circle cx="128" cy="86" r="6" fill={sea} />
    <path d="M92 80l17 17" strokeWidth="7" />
    <path d="M100 88l9 9" strokeWidth="7" stroke={coral} />
    <circle cx="74" cy="62" r="25" fill={paper} />
    <circle cx="74" cy="62" r="19" fill={sea} opacity=".35" stroke="none" />
    {face(74, 63, 11)}
    <path d="M104 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={sun} />
  </>,
];

const blobs = ["var(--sun-soft, #fff0c2)", "var(--aqua-soft, #d3f7f2)", "var(--lavender-soft, #ece6ff)", "var(--coral-soft, #ffdcdc)"] as const;

export function StepArt({ step }: { step: number }) {
  return <svg className="step__art" viewBox="0 0 160 140" fill="none" aria-hidden="true" focusable="false">
    <path d="M27 74c-4-32 17-53 53-53 34-2 60 23 55 57-1 28-23 49-54 47-34 2-55-20-54-51z" fill={blobs[step % blobs.length]} />
    <circle cx="80" cy="75" r="57" stroke={ink} opacity=".09" strokeDasharray="2 5" />
    <path d="M17 59h16M14 66h17m100 35h15m-12 7h16" stroke={ink} strokeWidth="1.5" strokeLinecap="round" opacity=".16" />
    <g stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{scenes[step]}</g>
    <circle cx="24" cy="101" r="3" fill={sun} />
    <path d="M137 57v8m-4-4h8" stroke={sun} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
