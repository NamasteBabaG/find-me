/**
 * The product's one small cloud: three arcs on a flat-bottomed base, the way a
 * picture book draws a cloud. The game's cloud curtain sends these off the edge
 * of its banks and the site lets them drift across its sky, so the page and the
 * game share one sky (Guy, 2026-11-16: more life, the same world).
 */
export function cloudlet(w: number): string {
  const h = w * 0.6;
  return [
    `M ${0.08 * w} ${0.78 * h}`,
    `A ${0.2 * w} ${0.2 * w} 0 0 1 ${0.3 * w} ${0.34 * h}`,
    `A ${0.26 * w} ${0.26 * w} 0 0 1 ${0.66 * w} ${0.3 * h}`,
    `A ${0.2 * w} ${0.2 * w} 0 0 1 ${0.92 * w} ${0.78 * h}`,
    `A ${0.08 * w} ${0.08 * w} 0 0 1 ${0.86 * w} ${0.92 * h}`,
    `L ${0.14 * w} ${0.92 * h}`,
    `A ${0.08 * w} ${0.08 * w} 0 0 1 ${0.08 * w} ${0.78 * h}`,
    "Z",
  ].join(" ");
}
