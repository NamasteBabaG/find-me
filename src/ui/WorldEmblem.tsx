import { cloudlet } from "./cloudlet";

/**
 * A world's emblem for the wizard's world cards: a small storybook window into the world, drawn instead of a board
 * painting (a board on the card gives its hiding places away). One grammar for all three: an arched window of the
 * world's sky over two hills of its ground, one of the product's cloudlets, the sun spark on the window's shoulder,
 * and the world's hero in ink outline. No people, no letters, no flags. Decorative only.
 *
 * Parts that CSS may move (transform/opacity only) carry stable classes and their own transform box:
 * `world-emblem__float` (the balloon, the dragon, the rocket), `world-emblem__cloud`, `world-emblem__spark`.
 */
const CLOUD = cloudlet(100);
const ARCH = "M14 102V56a46 46 0 0 1 92 0v46a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z";
const BASE = "V102a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z";
const LINE = { stroke: "var(--ink)", strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const THIN = { ...LINE, strokeWidth: 2.5 } as const;
const MOVE = { transformBox: "fill-box", transformOrigin: "50% 50%" } as const;
const v = (token: string) => `var(--${token})`;

/** The window's sky. */
function Sky({ fill }: { fill: string }) {
  return <path d={ARCH} fill={v(fill)} />;
}

/** A hill of the world's ground along the bottom of the window: `top` runs from x=14 to x=106. */
function Hill({ fill, top }: { fill: string; top: string }) {
  return <path d={top + BASE} fill={v(fill)} />;
}

/** The product's cloudlet (SkyClouds' body and shade), `w` units wide with its box's top-left at x, y. */
function Cloud({ x, y, w = 26, shade }: { x: number; y: number; w?: number; shade: string }) {
  return (
    <g className="world-emblem__cloud" style={MOVE}>
      <g transform={`translate(${x} ${y}) scale(${w / 100})`}>
        <path d={CLOUD} transform="translate(-3 4)" fill={v(shade)} />
        <path d={CLOUD} fill={v("white")} />
      </g>
    </g>
  );
}

/** The four-point sun spark of SearchLevelArt, the same in every emblem: just off the window's right shoulder. */
function Spark() {
  return <path className="world-emblem__spark" style={MOVE} d="M103 11l1.8 4.7 4.7 1.8-4.7 1.8-1.8 4.7-1.8-4.7-4.7-1.8 4.7-1.8z" fill={v("sun")} {...THIN} />;
}

/** A floating hero, drawn around 0,0 and placed at x, y; the outer group is the one CSS may move. */
function Float({ x, y, turn = 0, children }: { x: number; y: number; turn?: number; children: React.ReactNode }) {
  return (
    <g className="world-emblem__float" style={MOVE}>
      <g transform={`translate(${x} ${y})${turn ? ` rotate(${turn})` : ""}`}>{children}</g>
    </g>
  );
}

function Journey() {
  const envelope = "M0-20c9.4 0 17 7.2 17 16.5 0 8.5-6.6 14.2-10 21.5H-7C-10.4 10.7-17 5-17-3.5-17-12.8-9.4-20 0-20z";
  return (
    <>
      <Sky fill="sea-soft" />
      <Cloud x={26} y={24} w={24} shade="sea" />
      <Hill fill="sun-soft" top="M14 86c20 0 34-6 52-6s28 3 40 1" />
      <circle cx="44" cy="78" r="23" fill={v("sea")} />
      <path d="M28 71c3-6 10-8 15-5s3 9-2 11-8 4-11 1-4-4-2-7zM50 65c4-1 9 1 10 5s-2 6-6 6-6-2-6-5 0-5 2-6zM46 86c4-2 10-1 12 3s-1 6-5 6-8 0-8-4 0-4 1-5z" fill={v("leaf")} />
      <circle cx="44" cy="78" r="23" fill="none" {...LINE} />
      <path d="M29.5 73a15.5 15.5 0 0 1 7.5-9" fill="none" stroke={v("white")} strokeWidth="2.5" strokeLinecap="round" />
      <Hill fill="sand" top="M14 94c14-5 30-7 44-4s30 6 48 1" />
      <path d="M25 58C30 44 58 36 71 60" fill="none" {...THIN} strokeDasharray="0 6" />
      <Float x={80} y={40}>
        <path d="M-6 18l2 6M6 18l-2 6" fill="none" {...THIN} />
        <rect x="-5.5" y="23.5" width="11" height="8" rx="2" fill={v("sun-deep")} {...LINE} />
        <path d={envelope} fill={v("coral")} />
        <path d="M0-20c9.4 0 17 7.2 17 16.5 0 8.5-6.6 14.2-10 21.5H3C4.4 12 6.4 5 6.4-2.5 6.4-9 4.6-16 0-20z" fill={v("coral-deep")} />
        <path d="M0-20c4.6 4 6.4 11 6.4 17.5 0 7.5-2 14.5-3.4 20.5h-6c-1.4-6-3.4-13-3.4-20.5 0-6.5 1.8-13.5 6.4-17.5z" fill={v("sun")} />
        <path d="M-12.5-7a12 12 0 0 1 4-6.5" fill="none" stroke={v("white")} strokeWidth="2.5" strokeLinecap="round" />
        <path d={envelope} fill="none" {...LINE} />
      </Float>
    </>
  );
}

/** A cone roof in sun, its right half in shade (the light comes from the upper left, as on the globe and the balloon). */
function Roof({ d, shade }: { d: string; shade: string }) {
  return (
    <>
      <path d={d} fill={v("sun")} />
      <path d={shade} fill={v("sun-deep")} />
      <path d={d} fill="none" {...LINE} />
    </>
  );
}

function Kingdom() {
  return (
    <>
      <Sky fill="lavender-soft" />
      <Cloud x={76} y={24} w={22} shade="lavender" />
      <Hill fill="lavender" top="M14 84c14-4 26-4 38-1s34 2 54-6" />
      <path d="M48 72h40v22H48z" fill={v("white")} {...LINE} />
      <path d="M40 60h12v34H40zM84 60h12v34H84z" fill={v("white")} {...LINE} />
      <Roof d="M37.5 62 46 46l8.5 16zM81.5 62 90 46l8.5 16z" shade="M46 46l8.5 16H46zM90 46l8.5 16H90z" />
      <path d="M59 48h18v46H59z" fill={v("white")} {...LINE} />
      <Roof d="M56 50 68 30l12 20z" shade="M68 30l12 20H68z" />
      <path d="M68 30V19" fill="none" {...THIN} />
      <path d="M68 19l9 3.5-9 3.5z" fill={v("coral")} {...THIN} />
      <path d="M63 88v-8a5 5 0 0 1 10 0v8z" fill={v("grape")} {...LINE} />
      <path d="M46 68v4M90 68v4M68 57v4" fill="none" {...LINE} />
      <Hill fill="grape" top="M14 96c18-6 36-8 54-8s28 3 38 6" />
      <Float x={40} y={33} turn={-8}>
        <path d="M-6 4c-3 4-6 5.5-10 4" fill="none" {...LINE} strokeWidth={6.5} />
        <path d="M-6 4c-3 4-6 5.5-10 4" fill="none" stroke={v("leaf")} strokeWidth={3} strokeLinecap="round" />
        <path d="M-14.5 6-21 9.5l6 2.5z" fill={v("leaf")} {...THIN} />
        <path d="M-5-1C-6-6-5-10-2-13c4 1 8 4 9 9-2-.5-3.5.5-4 2-1-1.5-3-2-4.5-.5-1-1.5-2.5-1.5-3.5 1.5z" fill={v("leaf-deep")} {...THIN} />
        <ellipse cx="0" cy="3" rx="8.5" ry="6" fill={v("leaf")} {...LINE} />
        <ellipse cx="1" cy="5" rx="5" ry="2" fill={v("lime")} />
        <path d="M5.5-9 2.5-16.5 12-10z" fill={v("sun")} {...THIN} />
        <path d="M4-2c-1-5 2-8.5 6-8.5 3 0 5 1.5 6 4l4 1c2 .5 2 4 0 4.5l-8 1.5c-4 .8-7-.5-8-2.5z" fill={v("leaf")} {...LINE} />
        <circle cx="10.5" cy="-5" r="1.5" fill={v("ink")} />
      </Float>
    </>
  );
}

function TimeTravel() {
  const glass = "M32 40c0 14 10 16 10 24s-10 10-10 24h24c0-14-10-16-10-24s10-10 10-24z";
  return (
    <>
      <Sky fill="aqua-soft" />
      <Cloud x={34} y={16} w={22} shade="aqua" />
      <Hill fill="aqua" top="M14 88c18-6 36-6 50-3s30 0 42-5" />
      <path d="M70 98C69 86 66 76 64 68c-3-1-7-3-7-7 0-5 4-9 9-9s8 4 8 9c1 7 3 13 8 15 8-2 18 2 22 18z" fill={v("leaf")} {...LINE} />
      <circle cx="66.5" cy="58" r="1.5" fill={v("ink")} />
      <path d="M59.5 63c1.3.9 2.7.9 4 0" fill="none" {...THIN} strokeWidth={2} />
      <circle cx="88" cy="82" r="2.5" fill={v("lime")} />
      <circle cx="96" cy="86" r="2" fill={v("lime")} />
      <Hill fill="aqua-deep" top="M14 94c16-4 32-4 46-2s30 0 46-5" />
      <path d={glass} fill={v("white")} />
      <path d="M35 50h18c-2 6-7 8-7 14h-4c0-6-5-8-7-14zM33 88c1-8 6-12 11-12s10 4 11 12z" fill={v("sun")} />
      <path d="M44 64v12" fill="none" stroke={v("sun-deep")} strokeWidth="2" strokeLinecap="round" />
      <path d={glass} fill="none" {...LINE} />
      <path d="M27 37.5a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H30a3 3 0 0 1-3-3zM27 89.5a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H30a3 3 0 0 1-3-3z" fill={v("coral")} {...LINE} />
      <Float x={82} y={32} turn={40}>
        <path d="M-3.5 9c0 3 2 5 3.5 7 1.5-2 3.5-4 3.5-7z" fill={v("sun")} {...THIN} />
        <path d="M-6 2l-4 7h5zM6 2l4 7h-5z" fill={v("coral")} {...THIN} />
        <path d="M0-14c5 4 7 11 6 23H-6c-1-12 1-19 6-23z" fill={v("white")} {...LINE} />
        <path d="M0-14c3 2 4.6 5 5.4 8H-5.4c.8-3 2.4-6 5.4-8z" fill={v("coral")} {...THIN} />
        <circle cx="0" cy="0" r="3" fill={v("sea-soft")} {...THIN} />
      </Float>
    </>
  );
}

function Fallback() {
  return (
    <>
      <Sky fill="sun-soft" />
      <Cloud x={22} y={30} shade="sun" />
      <Hill fill="lime-soft" top="M14 86c20 0 34-6 52-6s28 3 40 1" />
      <Hill fill="leaf" top="M14 94c14-5 30-7 44-4s30 6 48 1" />
      <circle cx="62" cy="64" r="22" fill={v("white")} {...LINE} />
      <path d="M62 48l5.5 16H56.5z" fill={v("coral")} />
      <path d="M62 80l5.5-16H56.5z" fill={v("sea")} />
      <path d="M62 48l5.5 16-5.5 16-5.5-16z" fill="none" {...THIN} />
      <circle cx="62" cy="64" r="2.5" fill={v("ink")} />
    </>
  );
}

const SCENES: Record<string, typeof Journey> = { journey: Journey, kingdom: Kingdom, timetravel: TimeTravel };

export function WorldEmblem({ slug, className }: { slug: string; className?: string }) {
  const Scene = SCENES[slug] ?? Fallback;
  return (
    <svg className={`world-emblem world-emblem--${slug}${className ? " " + className : ""}`} viewBox="8 8 104 104" aria-hidden="true" focusable="false">
      <Scene />
      <Spark />
    </svg>
  );
}
