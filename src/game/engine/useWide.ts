"use client";

import { useEffect, useState, type RefObject } from "react";

/** Enough room for the board's sticker strip: not a phone or small embedded frame. */
export const WIDE_SCREEN = "(min-width: 900px) and (min-height: 560px)";

/**
 * True on a wide screen, false on a phone, and false on the server and in a
 * browser without matchMedia. Re-evaluated when the window crosses the line.
 */
export function useWide(container?: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const frame = container?.current?.closest(".scene");
    if (frame && typeof ResizeObserver !== "undefined") {
      const measure = () => {
        const size = frame.getBoundingClientRect();
        setWide(size.width >= 900 && size.height >= 560);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }
    const mq = window.matchMedia?.(WIDE_SCREEN);
    if (!mq) return;
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [container]);
  return wide;
}
