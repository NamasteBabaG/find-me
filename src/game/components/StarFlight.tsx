"use client";

import type { CSSProperties } from "react";
import { GoldStar } from "./GoldStar";

export interface Point {
  x: number;
  y: number;
}

/** Where a star sets off from and where it lands, in the scene's own pixels. */
export interface FlightPath {
  from: Point;
  to: Point;
}

/** How long a star is in the air. The tray lights when it lands. */
export const FLIGHT_MS = 850;

/**
 * How high the star rises above the straight line before dropping into the
 * tray: a third of the way, but always a visible hop and never a rocket.
 */
export function flightLift(path: FlightPath): number {
  const dx = path.to.x - path.from.x;
  const dy = path.to.y - path.from.y;
  const distance = Math.hypot(dx, dy);
  return Math.round(Math.min(160, Math.max(48, distance / 3)));
}

/**
 * A gold star flying from the child who was just found into the star tray.
 *
 * Three nested moves make the arc: the outer element travels the straight
 * line from the child to the tray, the middle one lifts and drops (so the
 * path bows upward, like something tossed), and the inner one spins and
 * grows on take-off, then shrinks to the tray's size on landing. A little
 * gold dust trails behind on the same path, a few frames late.
 *
 * Purely visual. It is the parent's timer, not this animation's end, that
 * lights the tray — so a browser that shows no motion still gets its star.
 */
export function StarFlight({ path }: { path: FlightPath }) {
  const style = {
    "--x0": `${Math.round(path.from.x)}px`,
    "--y0": `${Math.round(path.from.y)}px`,
    "--x1": `${Math.round(path.to.x)}px`,
    "--y1": `${Math.round(path.to.y)}px`,
    "--lift": `${-flightLift(path)}px`,
    "--fly-ms": `${FLIGHT_MS}ms`,
  } as CSSProperties;
  return (
    <div className="starfly" style={style} aria-hidden>
      {[1, 2, 3].map((n) => (
        <div key={n} className="starfly__path starfly__path--dust" style={{ "--d": `${n * 55}ms` } as CSSProperties}>
          <div className="starfly__arc">
            <span className="starfly__dust" />
          </div>
        </div>
      ))}
      <div className="starfly__path">
        <div className="starfly__arc">
          <div className="starfly__spin">
            <GoldStar />
          </div>
        </div>
      </div>
    </div>
  );
}
