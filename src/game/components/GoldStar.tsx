"use client";

import { useId } from "react";

/**
 * The gold star, drawn once and used everywhere a star shows: the mission
 * tray, the star in flight, the finish card, the map, the adventure bag.
 *
 * Vector, not an emoji: an emoji star is a different picture on every phone,
 * and none of them is gold. This one is a real five-point star with a rim
 * light, a metallic fall-off and a burnt edge, so it reads as a coin a child
 * would want, at 12px on the map and at 96px on the finish card alike.
 *
 * `empty` is the slot a star has not landed in yet: the same shape, dashed and
 * pale, so a child can count what is still out there.
 */
const STAR_PATH = "M32 3 L39.6 21.5 L60.5 22.7 L44.4 36 L49.6 56.3 L32 45 L14.4 56.3 L19.6 36 L3.5 22.7 L24.4 21.5 Z";

export function GoldStar({ empty = false, className }: { empty?: boolean; className?: string }) {
  // A gradient is referenced by id, and the page may hold thirty stars at once.
  const gradient = `gold-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className={`star${empty ? " star--empty" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 64 64" aria-hidden focusable="false">
      {empty ? null : (
        <defs>
          <linearGradient id={gradient} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" style={{ stopColor: "var(--gold-light)" }} />
            <stop offset="0.45" style={{ stopColor: "var(--gold)" }} />
            <stop offset="1" style={{ stopColor: "var(--gold-deep)" }} />
          </linearGradient>
        </defs>
      )}
      <path className="star__body" d={STAR_PATH} style={empty ? undefined : { fill: `url(#${gradient})` }} />
      {empty ? null : <path className="star__shine" d="M21 23c3-5 7.5-8.5 13-9.5" />}
    </svg>
  );
}
