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

const RISING: CelebrationKind[] = ["bubbles", "stars", "sparkles", "hearts"];

/**
 * World-specific particle burst. Pure CSS animation; 28 DOM nodes max.
 * `small` is used for a single found target; the full burst for scene completion.
 */
export function CelebrationOverlay({ kind, small = false, seed = 0 }: { kind: CelebrationKind; small?: boolean; seed?: number }) {
  const particles = useMemo(() => {
    const n = small ? 12 : 28;
    const glyphs = GLYPHS[kind];
    return Array.from({ length: n }, (_, i) => {
      const r = Math.abs(Math.sin(seed * 7 + i * 13.37));
      return {
        id: i,
        glyph: glyphs[i % glyphs.length] ?? "✨",
        left: `${(i / n) * 100 + (r - 0.5) * 8}%`,
        delay: `${(r * 600).toFixed(0)}ms`,
        dur: `${(1400 + r * 1200).toFixed(0)}ms`,
        dx: `${((r - 0.5) * 160).toFixed(0)}px`,
        size: `${(small ? 20 : 24) + r * 20}px`,
      };
    });
  }, [kind, small, seed]);

  const rising = RISING.includes(kind);
  return (
    <div className="celebration" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className={`celebration__p ${rising ? "celebration__p--rise" : "celebration__p--fall"}`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, fontSize: p.size, ["--dx" as string]: p.dx }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
