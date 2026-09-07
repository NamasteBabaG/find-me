"use client";

import { useEffect, useState, type RefObject } from "react";

/** Preload the demo normally, but keep its entrance for the person watching it. */
export function useScrollReveal(ref: RefObject<HTMLElement | null>, enabled: boolean, ready: boolean) {
  const [visible, setVisible] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!enabled || opened) return;
    const element = ref.current;
    if (!element) return;
    // Older browsers should never leave an otherwise ready game under clouds.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.12));
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled, opened]);

  useEffect(() => {
    if (!enabled || opened || !ready || !visible) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setOpened(true), reduced ? 0 : 160);
    return () => clearTimeout(timer);
  }, [enabled, opened, ready, visible]);

  // Once revealed, scrolling away/back must not restart the mission or curtain.
  return ready && (!enabled || opened);
}
