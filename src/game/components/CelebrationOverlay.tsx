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

/** Gold, gems and sweets ride along in every world — the dopamine set. */
const TREATS = ["⭐", "💎", "🍬", "✨", "🌟", "🍭"];
/** Confetti pieces in the brand palette. Tokens, so a theme change follows. */
const CONFETTI = ["var(--sun)", "var(--coral)", "var(--aqua)", "var(--lavender)", "var(--leaf)", "var(--sun-deep)"];

/**
 * Confetti rain, and only confetti rain. Two earlier versions tried ballistic
 * bursts out of the found child; Guy read both as a merry-go-round. The brief
 * that stuck: LOTS of pieces simply falling from above at different speeds,
 * feeling like paper confetti. So every piece gets three cheap layers —
 * a sway that flutters side to side (infinite, phase-shifted), a fall at its
 * own speed (mostly linear, the spread of speeds is the life), and a tumble —
 * and leaves past the bottom. Nothing fades mid-air. A found child gets a
 * shower; a finished scene gets a downpour.
 */
export function CelebrationOverlay({ kind, small = false, seed = 0 }: { kind: CelebrationKind; small?: boolean; seed?: number }) {
  const particles = useMemo(() => {
    // Enough to FILL the frame, and quick about it (Guy, final round): a piece
    // per ~1% of the width, falling its own way in under two seconds.
    const n = small ? 130 : 200;
    const pool = [...TREATS, ...GLYPHS[kind]];
    const rand = (i: number, salt: number) => Math.abs(Math.sin(seed * 7 + i * 13.37 + salt * 101.7));
    return Array.from({ length: n }, (_, i) => {
      const r1 = rand(i, 1);
      const r2 = rand(i, 2);
      const r3 = rand(i, 3);
      const confetti = rand(i, 4) < 0.62;
      return {
        id: i,
        confetti,
        glyph: confetti ? undefined : pool[Math.floor(r3 * pool.length) % pool.length],
        color: confetti ? CONFETTI[Math.floor(r3 * CONFETTI.length) % CONFETTI.length] : undefined,
        left: `${((i / n) * 100 + (r1 - 0.5) * 8).toFixed(1)}%`,
        fallDur: `${Math.round(800 + r2 * 1000)}ms`,
        fallDelay: `${Math.round(r3 * (small ? 400 : 600))}ms`,
        sway: `${Math.round(14 + r1 * 32)}px`,
        swayDur: `${Math.round(900 + r2 * 1000)}ms`,
        phase: `${-Math.round(r3 * 1500)}ms`,
        down: "calc(100vh + 240px)",
        rot: `${Math.round((r2 - 0.5) * (confetti ? 1080 : 540))}deg`,
        size: confetti ? undefined : `${Math.round(22 + r1 * 26)}px`,
        w: confetti ? `${Math.round(8 + r1 * 8)}px` : undefined,
        h: confetti ? `${Math.round(12 + r2 * 10)}px` : undefined,
      };
    });
  }, [kind, small, seed]);

  return (
    <div className="celebration" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="celebration__p"
          style={{ left: p.left, top: "-80px", fontSize: p.size, ["--sway" as string]: p.sway, ["--swayDur" as string]: p.swayDur, ["--phase" as string]: p.phase }}
        >
          <span className="celebration__y" style={{ animationDuration: p.fallDur, animationDelay: p.fallDelay, ["--down" as string]: p.down }}>
            <span className="celebration__r" style={{ ["--rot" as string]: p.rot }}>
              {p.confetti ? <span className="celebration__c" style={{ width: p.w, height: p.h, background: p.color }} /> : p.glyph}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
