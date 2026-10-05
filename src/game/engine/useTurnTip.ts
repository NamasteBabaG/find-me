"use client";

import { useEffect, useState } from "react";

/** A tablet's short side is at least this wide (an iPad mini's is 744); a phone's is narrower (the largest is about 440). */
export const TABLET_SHORT_SIDE = 600;

export type TurnTip = "tablet" | "phone";

/**
 * Which way to hold the device, said once over a board (Guy, 2026-10-05). A tablet held upright hears that the
 * board is more fun sideways. A phone held sideways hears to stand it up, because on its side a phone cuts the
 * cards and the map off. A phone upright and a tablet sideways hear nothing, and neither does a mouse, or a
 * screen whose size is unknown.
 */
export function turnTipFor(view: { touch: boolean; screenShortSide: number; portrait: boolean }): TurnTip | null {
  if (!view.touch || !view.screenShortSide) return null;
  if (view.screenShortSide >= TABLET_SHORT_SIDE) return view.portrait ? "tablet" : null;
  return view.portrait ? null : "phone";
}

/** The tip for this device as it is held now; null on the server and in a browser without matchMedia. */
export function useTurnTip(): TurnTip | null {
  const [tip, setTip] = useState<TurnTip | null>(null);
  useEffect(() => {
    const touch = window.matchMedia?.("(pointer: coarse)");
    const check = () => setTip(turnTipFor({ touch: !!touch?.matches, screenShortSide: Math.min(window.screen.width, window.screen.height), portrait: window.innerHeight > window.innerWidth }));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return tip;
}
