"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  centerOnNormalized,
  centeredTransform,
  chooseFitMode,
  clampTransform,
  fitScale,
  isTap,
  screenToStage,
  zoomAt,
  type Size,
  type ViewTransform,
} from "./viewport-math";

/**
 * Pan / pinch / wheel / double-tap for the scene stage.
 * Pointer Events only (works for mouse, touch and pen). The container needs
 * `touch-action: none`.
 */
export interface ViewportApi {
  transform: ViewTransform;
  viewport: Size;
  fit: number;
  isDragging: boolean;
  bind: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
  };
  toNormalized: (clientX: number, clientY: number) => { x: number; y: number } | null;
  zoomBy: (factor: number) => void;
  reset: () => void;
  focusOn: (nx: number, ny: number, zoomFactor: number, durationMs?: number) => void;
  animateTo: (t: ViewTransform, durationMs: number) => void;
}

const MAX_ZOOM_FACTOR = 4;

export function useViewport(containerRef: React.RefObject<HTMLDivElement | null>, stage: Size, onTap: (nx: number, ny: number) => void, options: { wheelZoom?: boolean } = {}): ViewportApi {
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const [isDragging, setDragging] = useState(false);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const fit = useMemo(() => (viewport.width && viewport.height ? fitScale(viewport, stage, chooseFitMode(viewport, stage)) : 1), [viewport, stage]);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; startT: number; moved: boolean; lastX: number; lastY: number; pinchDist: number | null; lastTap: number }>({
    startX: 0,
    startY: 0,
    startT: 0,
    moved: false,
    lastX: 0,
    lastY: 0,
    pinchDist: null,
    lastTap: 0,
  });
  const raf = useRef<number | null>(null);

  const apply = useCallback(
    (t: ViewTransform) => {
      const vp = viewport;
      const f = fitRef.current;
      const next = vp.width ? clampTransform(t, vp, stage, f, f * MAX_ZOOM_FACTOR) : t;
      transformRef.current = next;
      setTransform(next);
    },
    [viewport, stage],
  );

  // Measure the container and fit on first layout / resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || !rect.width || !rect.height) return;
      const vp = { width: rect.width, height: rect.height };
      setViewport(vp);
      const f = fitScale(vp, stage, chooseFitMode(vp, stage));
      fitRef.current = f;
      if (first) {
        first = false;
        const t = centeredTransform(vp, stage, f);
        transformRef.current = t;
        setTransform(clampTransform(t, vp, stage, f, f * MAX_ZOOM_FACTOR));
      } else {
        setTransform((prev) => clampTransform(prev, vp, stage, f, f * MAX_ZOOM_FACTOR));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, stage]);

  const cancelAnim = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const animateTo = useCallback(
    (target: ViewTransform, durationMs: number) => {
      cancelAnim();
      const from = transformRef.current;
      const vp = viewport;
      const f = fitRef.current;
      const to = vp.width ? clampTransform(target, vp, stage, f, f * MAX_ZOOM_FACTOR) : target;
      if (durationMs <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        apply(to);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        const e = 1 - Math.pow(1 - p, 3);
        const t = { scale: from.scale + (to.scale - from.scale) * e, tx: from.tx + (to.tx - from.tx) * e, ty: from.ty + (to.ty - from.ty) * e };
        transformRef.current = t;
        setTransform(t);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else raf.current = null;
      };
      raf.current = requestAnimationFrame(step);
    },
    [apply, stage, viewport],
  );

  const local = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: clientX, y: clientY };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const toNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const p = local(clientX, clientY);
      const s = screenToStage(transformRef.current, p.x, p.y);
      const nx = s.x / stage.width;
      const ny = s.y / stage.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
      return { x: nx, y: ny };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    cancelAnim();
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.startT = performance.now();
      g.moved = false;
      g.pinchDist = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      g.pinchDist = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
      g.moved = true;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (g.pinchDist && g.pinchDist > 0) {
        const factor = dist / g.pinchDist;
        apply(zoomAt(transformRef.current, mid.x, mid.y, factor));
      }
      g.pinchDist = dist;
      return;
    }
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 8) {
      g.moved = true;
      setDragging(true);
    }
    if (g.moved) {
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      const t = transformRef.current;
      apply({ ...t, tx: t.tx + dx, ty: t.ty + dy });
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const had = pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!had) return;
    if (pointers.current.size === 0) {
      setDragging(false);
      const dur = performance.now() - g.startT;
      if (!cancelled && isTap(e.clientX - g.startX, e.clientY - g.startY, dur) && !g.moved) {
        const now = performance.now();
        if (now - g.lastTap < 320) {
          // double tap → zoom in around the point (or reset when already zoomed)
          g.lastTap = 0;
          const p = local(e.clientX, e.clientY);
          const t = transformRef.current;
          if (t.scale > fitRef.current * 2.2) animateTo(centeredTransform(viewport, stage, fitRef.current), 300);
          else animateTo(zoomAt(t, p.x, p.y, 2), 300);
        } else {
          g.lastTap = now;
          const n = toNormalized(e.clientX, e.clientY);
          if (n) onTap(n.x, n.y);
        }
      }
      g.pinchDist = null;
    } else if (pointers.current.size === 1) {
      const [rest] = Array.from(pointers.current.values());
      if (rest) {
        g.lastX = rest.x;
        g.lastY = rest.y;
      }
      g.pinchDist = null;
    }
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    const factor = Math.pow(1.0015, -e.deltaY);
    apply(zoomAt(transformRef.current, p.x, p.y, factor));
  };

  const zoomBy = useCallback(
    (factor: number) => {
      animateTo(zoomAt(transformRef.current, viewport.width / 2, viewport.height / 2, factor), 240);
    },
    [animateTo, viewport],
  );

  const reset = useCallback(() => {
    animateTo(centeredTransform(viewport, stage, fitRef.current), 320);
  }, [animateTo, viewport, stage]);

  const focusOn = useCallback(
    (nx: number, ny: number, zoomFactor: number, durationMs = 500) => {
      animateTo(centerOnNormalized(nx, ny, fitRef.current * zoomFactor, viewport, stage), durationMs);
    },
    [animateTo, viewport, stage],
  );

  return {
    transform,
    viewport,
    fit,
    isDragging,
    // Wheel zoom is opt-in: on the landing page the wheel must scroll the page, not the world.
    bind: { onPointerDown, onPointerMove, onPointerUp: (e) => endPointer(e, false), onPointerCancel: (e) => endPointer(e, true), ...(options.wheelZoom ? { onWheel } : {}) },
    toNormalized,
    zoomBy,
    reset,
    focusOn,
    animateTo,
  };
}
