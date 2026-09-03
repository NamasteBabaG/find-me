"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Wizard steps are separate routes reached via server actions + redirect, and
 * the browser keeps the previous scroll offset — so the new step's title would
 * land under the sticky header. Renders nothing; scrolls to top on each step.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
