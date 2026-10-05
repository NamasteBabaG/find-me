"use client";

import { useEffect, useState } from "react";

/** A tablet's short side is at least this wide (an iPad mini's is 744); a phone's is narrower (the largest is about 440). */
export const TABLET_SHORT_SIDE = 600;

/**
 * Whether to tell the player to stand the phone up, said once over a board (Guy, 2026-10-05). A phone is played
 * upright: on its side it cuts the cards and the map off. A tablet is never told which way to hold it, either way
 * is fine; neither is a phone held upright, a mouse, or a screen whose size is unknown.
 */
export function turnTipFor(view: { touch: boolean; screenShortSide: number; portrait: boolean }): boolean {
  if (!view.touch || !view.screenShortSide || view.screenShortSide >= TABLET_SHORT_SIDE) return false;
  return !view.portrait;
}

/** True while a phone is held sideways; false on the server and in a browser without matchMedia. */
export function useTurnTip(): boolean {
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const touch = window.matchMedia?.("(pointer: coarse)");
    const check = () => setTip(turnTipFor({ touch: !!touch?.matches, screenShortSide: Math.min(window.screen.width, window.screen.height), portrait: window.innerHeight > window.innerWidth }));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return tip;
}
