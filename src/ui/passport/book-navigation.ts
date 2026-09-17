/** Horizontal gestures follow the book's physical reading direction. */
export function swipePage(dx: number, dy: number, elapsed: number, dir: "ltr" | "rtl"): -1 | 0 | 1 {
  if (elapsed > 1100 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return (dir === "rtl" ? dx > 0 : dx < 0) ? 1 : -1;
}

export function arrowPage(key: string, dir: "ltr" | "rtl"): -1 | 0 | 1 {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return 0;
  return (dir === "rtl" ? key === "ArrowLeft" : key === "ArrowRight") ? 1 : -1;
}
