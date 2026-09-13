"use client";

import { useEffect, useRef, useState } from "react";
import { GoldStar } from "./GoldStar";

interface Props {
  earned: number;
  total: number;
  /** Roll up from here on mount — the number before the board just finished. */
  from?: number;
  /** Wait this long before the first roll, so it follows the stars popping in rather than racing them. */
  delayMs?: number;
  /** What a screen reader hears: the digits are decoration. Absent when a labelled parent (a button) already says it. */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** How long the number takes to roll up to the new count. */
const ROLL_MS = 700;

/**
 * "12 / 27" with a gold star — the running count of a child's stars.
 *
 * The number does not jump to its new value; it rolls up to it, one star at a
 * time, and bumps when it arrives. Watching a count climb is most of why a
 * child wants the next one.
 */
export function StarCounter({ earned, total, from, delayMs = 0, label, size = "md", className }: Props) {
  const [shown, setShown] = useState(from ?? earned);
  const [bump, setBump] = useState(0);
  // What is on screen right now, for a roll to start from. Only the roll
  // itself moves it: an effect that is cut short (React runs mount effects
  // twice in development) leaves the number where it was, and the next run
  // rolls from there rather than believing the count already arrived.
  const onScreen = useRef(shown);
  const rolled = useRef(false);

  useEffect(() => {
    const start = onScreen.current;
    if (start === earned) return;
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      onScreen.current = earned;
      setShown(earned);
      return;
    }
    let frame = 0;
    const timer = setTimeout(() => {
      rolled.current = true;
      const began = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - began) / ROLL_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(start + (earned - start) * eased);
        onScreen.current = value;
        setShown(value);
        if (t < 1) frame = requestAnimationFrame(tick);
        else setBump((n) => n + 1);
      };
      frame = requestAnimationFrame(tick);
    }, rolled.current ? 0 : delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earned]);

  return (
    <span className={`starcount starcount--${size}${className ? ` ${className}` : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="starcount__star" aria-hidden>
        <GoldStar />
      </span>
      <span className="starcount__text" aria-hidden>
        <span key={bump} className={`starcount__n${bump ? " is-bumped" : ""}`}>{shown}</span>
        <span className="starcount__of">/{total}</span>
      </span>
    </span>
  );
}
