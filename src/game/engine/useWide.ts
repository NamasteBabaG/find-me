"use client";

import { useEffect, useState } from "react";

/** Enough room for the board's side furniture (the sticker strip, an over-pan margin): not a phone. */
export const WIDE_SCREEN = "(min-width: 900px) and (min-height: 560px)";

/**
 * True on a wide screen, false on a phone, and false on the server and in a
 * browser without matchMedia. Re-evaluated when the window crosses the line.
 */
export function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_SCREEN);
    if (!mq) return;
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return wide;
}
