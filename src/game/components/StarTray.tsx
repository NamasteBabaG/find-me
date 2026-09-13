"use client";

import { forwardRef, useRef, type CSSProperties } from "react";
import { GoldStar } from "./GoldStar";

interface Props {
  /** Stars that have landed. */
  lit: number;
  /** Slots, lit or not. */
  total: number;
  size?: "xs" | "sm" | "md" | "lg";
  /**
   * Pop every lit star in, one after another, as the tray appears — the
   * finish card, or the map node a child has just come back from. Without it
   * a tray that mounts already full is simply full: the adventure bag does
   * not re-celebrate nine boards every time it is opened.
   */
  celebrate?: boolean;
  /** What a screen reader hears; the stars themselves are decoration. */
  label?: string;
  className?: string;
}

/**
 * A row of star slots. A star that lands after mount pops in with a ring of
 * light; the ones already there stay still.
 *
 * The pop is a CSS animation on a class the slot keeps, so the frequent
 * re-renders of the board (the hint clock ticks every second) never restart
 * or cut it short. A slot is "new" if it is lit and was not lit when the tray
 * mounted — that never changes back, so once a star has landed it stays.
 */
export const StarTray = forwardRef<HTMLSpanElement, Props>(function StarTray({ lit, total, size = "md", celebrate = false, label, className }, ref) {
  const litAtMount = useRef(celebrate ? 0 : lit);
  const slots = Array.from({ length: total }, (_, i) => i);
  return (
    <span ref={ref} className={`stars stars--${size}${celebrate ? " stars--celebrate" : ""}${className ? ` ${className}` : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {slots.map((i) => {
        const on = i < lit;
        const fresh = on && i >= litAtMount.current;
        return (
          <span key={i} className={`stars__slot${on ? " is-lit" : ""}${fresh ? " is-new" : ""}`} style={{ "--i": i } as CSSProperties} data-lit={on}>
            <GoldStar empty={!on} />
          </span>
        );
      })}
    </span>
  );
});
