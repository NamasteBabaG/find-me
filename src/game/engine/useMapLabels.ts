import { useEffect, useRef, useState } from "react";
import { fitMapLabels, mapLabelsMinHeight, type MapLabelPosition } from "./map-labels";

/** Measure translated names as well as screen size. Only presentation is adjusted. */
export function useMapLabels(nodes: readonly { boardSlug: string; x: number; y: number }[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ positions: Record<string, MapLabelPosition>; minHeight: number }>({ positions: {}, minHeight: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let live = true;
    const fit = () => {
      if (!live || !element.clientWidth || !element.clientHeight) return;
      const buttons = new Map(Array.from(element.querySelectorAll<HTMLButtonElement>(".wmap__place")).map(button => [button.dataset.board, button]));
      const labels = nodes.map(node => {
        const button = buttons.get(node.boardSlug);
        // One extra pixel covers the browser's fractional width rounding.
        return { id: node.boardSlug, x: node.x, y: node.y, width: Math.max(64, (button?.offsetWidth ?? 48) + 17), height: Math.max(64, (button?.offsetHeight ?? 48) + 1) };
      });
      const minHeight = mapLabelsMinHeight(labels);
      const next = { positions: fitMapLabels(labels, element.clientWidth, Math.max(element.clientHeight, minHeight)), minHeight };
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(element);
    for (const button of element.querySelectorAll(".wmap__place")) observer?.observe(button);
    // Older browsers still remeasure translated names and progress text.
    const mutations = !observer && typeof MutationObserver !== "undefined" ? new MutationObserver(fit) : null;
    mutations?.observe(element, { childList: true, characterData: true, subtree: true });
    window.addEventListener("resize", fit);
    void document.fonts?.ready.then(fit);
    return () => { live = false; observer?.disconnect(); mutations?.disconnect(); window.removeEventListener("resize", fit); };
  }, [nodes]);
  return { ref, ...layout };
}
