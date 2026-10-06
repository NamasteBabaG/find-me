"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CelebrationKind } from "@/domain/scene/schema";

/**
 * Confetti a particle designer would sign, not an emoji shower.
 *
 * What made the previous versions read as "AI": pasted emoji at poster sizes,
 * one sine formula pretending to be randomness (its streams correlate, so
 * pieces came out in visible twins), and every piece doing the same flat
 * pendulum. This one drops all of it:
 *
 * - PAPER ONLY. Four shapes — rectangles, thin ribbons, round sequins and a
 *   few punched stars — in the brand palette plus white. No emoji anywhere.
 * - REAL RANDOMNESS. A mulberry32 stream per burst: sizes, colours, timing
 *   and spin axes stop echoing each other.
 * - REAL TUMBLE. Every piece spins in 3D around its own random axis
 *   (perspective + rotate3d), so it thins to a line and flashes back — the
 *   thing actual falling paper does and circles never do.
 * - Fewer pieces, each earning its place: a found child gets 60, a finished
 *   scene 110, falling at their own speeds and leaving past the bottom.
 *   Nothing fades mid-air.
 *
 * The motion is set with the Web Animations API, in concrete values: every
 * animation starts in the same frame and none ends before the overlay is gone.
 * React listens for animation events at its root, and with a listener present
 * a browser wakes the main thread at every start, iteration and end of every
 * animation. Seventy pieces, each with its own durations as CSS animations,
 * did that on almost every frame: a slow tablet's main thread was full for the
 * three seconds after each find, during the cloud turn (measured 2026-10-06).
 * The pieces move exactly as they did: the same keyframes, timings and curves,
 * with each piece's delay held inside its own keyframes.
 */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ["var(--sun)", "var(--sun-deep)", "var(--coral)", "var(--aqua)", "var(--lavender)", "var(--leaf)", "var(--white)"];
/** After the slowest piece's fall ends, a beat before the overlay unmounts. */
const FALL_MARGIN_MS = 200;
/** The fall itself: near-linear, the variety lives in each piece's own duration. */
const FALL_EASING = "cubic-bezier(0.25, 0.1, 0.6, 0.92)";
/** A piece starts this far above the top edge and leaves this far past the bottom. */
const FALL_PAST_BOTTOM_PX = 160;
const STAR = "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";

type Shape = "rect" | "strip" | "dot" | "star";

export function CelebrationOverlay({ kind, small = false, seed = 0 }: { kind: CelebrationKind; small?: boolean; seed?: number }) {
  // The paper system is deliberately universal — the world's flavour is the
  // board itself. `kind` stays in the contract for a future accent pass.
  void kind;
  const pieces = useMemo(() => {
    const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const n = small ? 70 : 120;
    return Array.from({ length: n }, (_, i) => {
      const sr = rnd();
      const shape: Shape = sr < 0.42 ? "rect" : sr < 0.62 ? "strip" : sr < 0.85 ? "dot" : "star";
      // Cycle the palette with a small jitter: neighbours differ, colours stay balanced.
      const color = PALETTE[(i + Math.floor(rnd() * 3)) % PALETTE.length]!;
      // A natural size crowd (Guy): everything a touch bigger, then a skewed
      // spread — most pieces stay near their base size, some grow a little,
      // a few grow a lot. Squaring the roll is what skews it.
      const grow = 1.15 + Math.pow(rnd(), 2.2) * 1.85;
      const w = (shape === "rect" ? 9 + rnd() * 8 : shape === "strip" ? 5 + rnd() * 3 : shape === "dot" ? 7 + rnd() * 5 : 16 + rnd() * 10) * grow;
      const h = (shape === "rect" ? 14 + rnd() * 10 : shape === "strip" ? 20 + rnd() * 14 : 0) * grow || w;
      return {
        id: i,
        shape,
        color,
        left: `${(rnd() * 100).toFixed(2)}%`,
        opacity: 0.9 + rnd() * 0.1,
        fallDur: Math.round(1400 + rnd() * (small ? 1200 : 1400)),
        fallDelay: Math.round(rnd() * (small ? 450 : 800)),
        sway: Math.round(10 + rnd() * 30),
        swayDur: Math.round(700 + rnd() * 800),
        /** Where in its flutter the piece starts (a negative delay). */
        phase: -Math.round(rnd() * 1600),
        spinDur: Math.round(shape === "strip" ? 700 + rnd() * 500 : 380 + rnd() * 420),
        rx: (0.35 + rnd() * 0.65).toFixed(2),
        ry: ((rnd() - 0.5) * 0.9).toFixed(2),
        w: `${Math.round(w)}px`,
        h: `${Math.round(h)}px`,
      };
    });
  }, [small, seed]);
  /** The burst's whole life: until the last piece has fallen past the bottom, and a beat. */
  const life = useMemo(() => Math.max(...pieces.map((p) => p.fallDelay + p.fallDur)) + FALL_MARGIN_MS, [pieces]);
  /** Per piece: the flutter, the fall and the paper. */
  const layers = useRef<(HTMLSpanElement | null)[][]>([]);
  const animations = useRef<Animation[]>([]);

  useEffect(() => {
    // Reduced motion: the overlay is hidden in CSS, so there is nothing to move.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ease = getComputedStyle(document.documentElement).getPropertyValue("--ease-in-out").trim() || "ease-in-out";
    const down = Math.max(window.innerHeight, document.documentElement.clientHeight) + FALL_PAST_BOTTOM_PX;
    const running: Animation[] = [];
    animations.current = running;
    pieces.forEach((p, i) => {
      const [outer, fall, paper] = layers.current[i] ?? [];
      if (!outer || !fall || !paper || typeof outer.animate !== "function") return;
      // Side to side, one swing per swayDur, each swing on the ease-in-out curve, entered at the piece's phase.
      const swings = Math.ceil((life - p.phase) / p.swayDur) + 1;
      running.push(outer.animate(
        Array.from({ length: swings + 1 }, (_, k) => ({ offset: k / swings, transform: `translateX(${k % 2 ? p.sway : -p.sway}px)`, easing: ease })),
        { duration: swings * p.swayDur, delay: p.phase, fill: "both" },
      ));
      // Waits above the top edge for its own delay, falls for its own duration, then stays below the bottom.
      running.push(fall.animate([
        { offset: 0, transform: "translateY(0px)" },
        { offset: p.fallDelay / life, transform: "translateY(0px)", easing: FALL_EASING },
        { offset: (p.fallDelay + p.fallDur) / life, transform: `translateY(${down}px)` },
        { offset: 1, transform: `translateY(${down}px)` },
      ], { duration: life, fill: "both" }));
      // One full turn per spinDur around the piece's own axis.
      const turns = Math.ceil(life / p.spinDur) + 1;
      running.push(paper.animate([
        { transform: `perspective(480px) rotate3d(${p.rx}, ${p.ry}, 0.15, 0turn)` },
        { transform: `perspective(480px) rotate3d(${p.rx}, ${p.ry}, 0.15, ${turns}turn)` },
      ], { duration: turns * p.spinDur, fill: "both" }));
    });
    return () => { for (const animation of running) animation.cancel(); };
  }, [pieces, life]);

  // Gone once the last piece has fallen past the bottom: left mounted, seventy pieces nobody could see kept a slow
  // tablet's main thread full for the rest of the board (2026-10-06 measurement).
  const [fallen, setFallen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      // Stopped now rather than left to end on their own after the pieces are gone: an end is an event too.
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
      setFallen(true);
    }, life);
    return () => clearTimeout(timer);
  }, [life]);
  if (fallen) return null;

  const keep = (i: number, layer: number) => (el: HTMLSpanElement | null) => { (layers.current[i] ??= [])[layer] = el; };
  return (
    <div className="celebration" aria-hidden>
      {pieces.map((p, i) => (
        <span key={p.id} ref={keep(i, 0)} className="celebration__p" style={{ left: p.left, top: "-40px", opacity: p.opacity }}>
          <span ref={keep(i, 1)} className="celebration__y">
            <span
              ref={keep(i, 2)}
              className="celebration__s"
              style={{
                width: p.w,
                height: p.h,
                background: p.color,
                borderRadius: p.shape === "dot" ? "50%" : p.shape === "star" ? undefined : "1.5px",
                clipPath: p.shape === "star" ? STAR : undefined,
              }}
            />
          </span>
        </span>
      ))}
    </div>
  );
}
