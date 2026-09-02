/**
 * Pure viewport math for SceneViewport. No DOM here so it is unit-testable.
 *
 * Coordinate spaces:
 *   normalized  — 0..1 scene units (what scene JSON uses)
 *   stage       — pixels of the un-transformed stage (art width × height)
 *   screen      — pixels inside the viewport element
 *
 * screen = stage * scale + (tx, ty)
 */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export type FitMode = "contain" | "cover";

export function fitScale(viewport: Size, stage: Size, mode: FitMode): number {
  const sx = viewport.width / stage.width;
  const sy = viewport.height / stage.height;
  return mode === "contain" ? Math.min(sx, sy) : Math.max(sx, sy);
}

/**
 * On a portrait phone a wide scene would be a thin strip; we "cover" the
 * height instead so the child pans a big scene (per spec §15).
 */
export function chooseFitMode(viewport: Size, stage: Size): FitMode {
  const viewportAspect = viewport.width / viewport.height;
  const stageAspect = stage.width / stage.height;
  return viewportAspect < stageAspect * 0.8 ? "cover" : "contain";
}

export function centeredTransform(viewport: Size, stage: Size, scale: number): ViewTransform {
  return {
    scale,
    tx: (viewport.width - stage.width * scale) / 2,
    ty: (viewport.height - stage.height * scale) / 2,
  };
}

/** Keep the stage covering the viewport (or centered when smaller) and the scale in range. */
export function clampTransform(t: ViewTransform, viewport: Size, stage: Size, minScale: number, maxScale: number): ViewTransform {
  const scale = Math.min(maxScale, Math.max(minScale, t.scale));
  const w = stage.width * scale;
  const h = stage.height * scale;
  let tx = t.tx;
  let ty = t.ty;
  if (w <= viewport.width) tx = (viewport.width - w) / 2;
  else tx = Math.min(0, Math.max(viewport.width - w, tx));
  if (h <= viewport.height) ty = (viewport.height - h) / 2;
  else ty = Math.min(0, Math.max(viewport.height - h, ty));
  return { scale, tx, ty };
}

/** Zoom by `factor` keeping the screen point (fx, fy) fixed. */
export function zoomAt(t: ViewTransform, fx: number, fy: number, factor: number): ViewTransform {
  const scale = t.scale * factor;
  const ratio = scale / t.scale;
  return {
    scale,
    tx: fx - (fx - t.tx) * ratio,
    ty: fy - (fy - t.ty) * ratio,
  };
}

export function screenToStage(t: ViewTransform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - t.tx) / t.scale, y: (sy - t.ty) / t.scale };
}

export function stageToScreen(t: ViewTransform, x: number, y: number): { x: number; y: number } {
  return { x: x * t.scale + t.tx, y: y * t.scale + t.ty };
}

/** Transform that centres a normalized scene point at a given zoom (relative to fit scale). */
export function centerOnNormalized(nx: number, ny: number, scale: number, viewport: Size, stage: Size): ViewTransform {
  return {
    scale,
    tx: viewport.width / 2 - nx * stage.width * scale,
    ty: viewport.height / 2 - ny * stage.height * scale,
  };
}

// ─── Hit testing ─────────────────────────────────────────────

export interface NormRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Bounding box of a sprite in normalized units. `scale` is the sprite height
 * as a fraction of the scene height; `aspect` is sprite width / height.
 */
export function spriteRect(anchor: { x: number; y: number; scale: number }, stage: Size, aspect: number): NormRect {
  const h = anchor.scale;
  const w = (anchor.scale * stage.height * aspect) / stage.width;
  return { x0: anchor.x - w / 2, y0: anchor.y - h / 2, x1: anchor.x + w / 2, y1: anchor.y + h / 2 };
}

export function expandRect(r: NormRect, padX: number, padY: number): NormRect {
  return { x0: r.x0 - padX, y0: r.y0 - padY, x1: r.x1 + padX, y1: r.y1 + padY };
}

export function rectContains(r: NormRect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/**
 * Hitboxes are a bit larger than the drawing (spec §24) and never smaller
 * than a comfortable finger (48 screen px) at the current zoom.
 */
export function hitPadding(rect: NormRect, stage: Size, scale: number, minScreenPx = 48): { padX: number; padY: number } {
  const w = (rect.x1 - rect.x0) * stage.width * scale;
  const h = (rect.y1 - rect.y0) * stage.height * scale;
  const extraW = Math.max(w * 0.35, (minScreenPx - w) / 2, 0);
  const extraH = Math.max(h * 0.25, (minScreenPx - h) / 2, 0);
  return { padX: extraW / (stage.width * scale), padY: extraH / (stage.height * scale) };
}

export interface HitCandidate<T> {
  id: T;
  rect: NormRect;
  zIndex: number;
}

/** Topmost candidate containing the point, or null. */
export function hitTest<T>(candidates: readonly HitCandidate<T>[], x: number, y: number): T | null {
  let best: HitCandidate<T> | null = null;
  for (const c of candidates) {
    if (rectContains(c.rect, x, y) && (!best || c.zIndex >= best.zIndex)) best = c;
  }
  return best ? best.id : null;
}

/** Tap vs drag: small movement within a short time is a tap. */
export function isTap(dx: number, dy: number, durationMs: number, slop = 8, maxMs = 350): boolean {
  return Math.hypot(dx, dy) <= slop && durationMs <= maxMs;
}
