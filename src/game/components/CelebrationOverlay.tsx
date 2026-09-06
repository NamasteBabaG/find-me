"use client";

import { useMemo } from "react";
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
        fallDur: `${Math.round(1400 + rnd() * (small ? 1200 : 1400))}ms`,
        fallDelay: `${Math.round(rnd() * (small ? 450 : 800))}ms`,
        sway: `${Math.round(10 + rnd() * 30)}px`,
        swayDur: `${Math.round(700 + rnd() * 800)}ms`,
        phase: `${-Math.round(rnd() * 1600)}ms`,
        spinDur: `${Math.round(shape === "strip" ? 700 + rnd() * 500 : 380 + rnd() * 420)}ms`,
        rx: (0.35 + rnd() * 0.65).toFixed(2),
        ry: ((rnd() - 0.5) * 0.9).toFixed(2),
        w: `${Math.round(w)}px`,
        h: `${Math.round(h)}px`,
      };
    });
  }, [small, seed]);

  return (
    <div className="celebration" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="celebration__p"
          style={{ left: p.left, top: "-40px", opacity: p.opacity, ["--sway" as string]: p.sway, ["--swayDur" as string]: p.swayDur, ["--phase" as string]: p.phase }}
        >
          <span className="celebration__y" style={{ animationDuration: p.fallDur, animationDelay: p.fallDelay, ["--down" as string]: "calc(100vh + 160px)" }}>
            <span
              className="celebration__s"
              style={{
                width: p.w,
                height: p.h,
                background: p.color,
                borderRadius: p.shape === "dot" ? "50%" : p.shape === "star" ? undefined : "1.5px",
                clipPath: p.shape === "star" ? STAR : undefined,
                animationDuration: p.spinDur,
                ["--rx" as string]: p.rx,
                ["--ry" as string]: p.ry,
              }}
            />
          </span>
        </span>
      ))}
    </div>
  );
}
