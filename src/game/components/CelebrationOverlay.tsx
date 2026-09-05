"use client";

import { useMemo } from "react";
import type { CelebrationKind } from "@/domain/scene/schema";

const GLYPHS: Record<CelebrationKind, string[]> = {
  bubbles: ["🫧", "🫧", "💧", "🐚"],
  stars: ["⭐", "✨", "🌟", "🪐"],
  leaves: ["🍃", "🍃", "🌿", "🦋"],
  confetti: ["🎉", "🎊", "✨", "🎈"],
  crowd: ["🎉", "⚽", "📣", "🎊"],
  fruit: ["🍊", "🍉", "🍇", "🍋"],
  sparkles: ["✨", "💎", "🌟", "✨"],
  hearts: ["💛", "💙", "💗", "💚"],
  snow: ["❄️", "❄️", "☃️", "✨"],
};

/** Worlds whose particles naturally go up (bubbles, sparks) rather than down (leaves, snow). */
const RISING: CelebrationKind[] = ["bubbles", "stars", "sparkles", "hearts"];

/**
 * How the particles move. A world's natural direction is one of them; the
 * other two are guests, so three finds on one board do not play the same
 * animation three times.
 */
type Motion = "rise" | "fall" | "burst";

function motionFor(kind: CelebrationKind, seed: number): Motion {
  const natural: Motion = RISING.includes(kind) ? "rise" : "fall";
  const roll = Math.abs(Math.sin(seed * 3.7)) * 3;
  if (roll < 1.4) return natural;
  if (roll < 2.2) return "burst";
  return natural === "rise" ? "fall" : "rise";
}

/**
 * World-specific particle burst. Pure CSS animation; 28 DOM nodes max.
 * `small` is used for a single found target; the full burst for scene completion.
 * `seed` picks the motion and scatters the particles, so no two are alike.
 */
export function CelebrationOverlay({ kind, small = false, seed = 0 }: { kind: CelebrationKind; small?: boolean; seed?: number }) {
  const motion = motionFor(kind, seed);
  const particles = useMemo(() => {
    const n = small ? 12 : 28;
    const glyphs = GLYPHS[kind];
    // A different glyph order per burst, not always the same first four.
    const shift = Math.floor(Math.abs(Math.sin(seed * 1.3)) * glyphs.length);
    return Array.from({ length: n }, (_, i) => {
      const r = Math.abs(Math.sin(seed * 7 + i * 13.37));
      const angle = (i / n) * Math.PI * 2 + r * 0.6;
      const reach = (small ? 120 : 220) + r * (small ? 120 : 260);
      return {
        id: i,
        glyph: glyphs[(i + shift) % glyphs.length] ?? "✨",
        left: motion === "burst" ? "50%" : `${(i / n) * 100 + (r - 0.5) * 8}%`,
        delay: `${(motion === "burst" ? r * 180 : r * 600).toFixed(0)}ms`,
        dur: `${(motion === "burst" ? 900 + r * 500 : 1400 + r * 1200).toFixed(0)}ms`,
        dx: motion === "burst" ? `${(Math.cos(angle) * reach).toFixed(0)}px` : `${((r - 0.5) * 160).toFixed(0)}px`,
        dy: `${(Math.sin(angle) * reach * 0.8).toFixed(0)}px`,
        size: `${(small ? 20 : 24) + r * 20}px`,
      };
    });
  }, [kind, small, seed, motion]);

  return (
    <div className="celebration" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className={`celebration__p celebration__p--${motion}`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, fontSize: p.size, ["--dx" as string]: p.dx, ["--dy" as string]: p.dy }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
