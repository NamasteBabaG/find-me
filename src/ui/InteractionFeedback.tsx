"use client";

import { useEffect } from "react";

/** Keep a quick tap visible even when a request outlasts the native :active state. */
export function bindPressFeedback(root: HTMLElement): () => void {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const press = (event: Event) => {
    if (event instanceof KeyboardEvent && (event.repeat || !["Enter", " "].includes(event.key))) return;
    if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent && event.button !== 0) return;
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a[href], [role=button], summary, label[for]") : null;
    if (!element || !root.contains(element) || element.matches(":disabled, [aria-disabled=true]")) return;
    const previous = timers.get(element);
    if (previous) clearTimeout(previous);
    element.dataset.pressFeedback = "true";
    timers.set(element, setTimeout(() => { delete element.dataset.pressFeedback; timers.delete(element); }, 180));
  };
  for (const type of ["pointerdown", "keydown", "click"]) root.addEventListener(type, press, { capture: true, passive: true });
  return () => {
    for (const type of ["pointerdown", "keydown", "click"]) root.removeEventListener(type, press, true);
    for (const [element, timer] of timers) { clearTimeout(timer); delete element.dataset.pressFeedback; }
    timers.clear();
  };
}

export function InteractionFeedback() {
  useEffect(() => bindPressFeedback(document.body), []);
  return null;
}
