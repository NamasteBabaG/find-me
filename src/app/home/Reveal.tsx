"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal. Server-rendered content stays visible without JS; once
 * mounted we hide-then-reveal on intersection. Respects reduced motion via CSS.
 */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("rv");
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      requestAnimationFrame(() => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Component = Tag as "div";
  return (
    <Component ref={ref as React.RefObject<HTMLDivElement>} className={className} style={delay ? ({ ["--rv-delay" as string]: `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Component>
  );
}
