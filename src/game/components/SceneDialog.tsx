"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

function canFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.tabIndex < 0 || element.matches(":disabled, input[type=hidden]")
    || element.closest("[hidden], [inert], [aria-hidden=true]")) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

interface Props {
  className: string;
  labelledBy: string;
  ariaLabel?: string;
  /** Inline home demos leave the surrounding page interactive. */
  modal?: boolean;
  onEscape?: () => void;
  children: ReactNode;
}

/**
 * A card inside the game's existing absolute frame. Real games contain
 * focus; inline home demos remain nonmodal and never take parent-page focus.
 */
export function SceneDialog({ className, labelledBy, ariaLabel, modal = true, onEscape, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useLayoutEffect(() => {
    if (!modal) return;
    const element = dialog.current;
    if (!element) return;
    const document = element.ownerDocument;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scene = element.closest<HTMLElement>(".scene");
    const game = element.closest<HTMLElement>(".game");
    const background = new Map<HTMLElement, string | null>();
    const hideBackground = () => {
      // A real modal makes every ancestor's sibling unavailable, matching
      // aria-modal. Inline demos skip this entire lifecycle.
      let branch: HTMLElement = element;
      while (branch.parentElement) {
        const parent = branch.parentElement;
        for (const sibling of parent.children) {
          if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
          if (!background.has(sibling)) background.set(sibling, sibling.getAttribute("inert"));
          if (!sibling.hasAttribute("inert")) sibling.setAttribute("inert", "");
        }
        if (parent === document.body) break;
        branch = parent;
      }
    };
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(canFocus);
    const focusFirst = () => (controls()[0] ?? element).focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        escape.current?.();
      } else if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!first || !last) {
          event.preventDefault();
          element.focus({ preventScroll: true });
        } else if (!element.contains(document.activeElement) || document.activeElement === element) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) focusFirst();
    };

    hideBackground();
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus, true);
    // Newly mounted HUD/status branches must not become reachable behind an
    // open modal. Reassert inert if a background render changes its attributes.
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(hideBackground);
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert"] });
    focusFirst();
    return () => {
      observer?.disconnect();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus, true);
      for (const [sibling, value] of background) {
        if (value === null) sibling.removeAttribute("inert");
        else sibling.setAttribute("inert", value);
      }
      const restoreFocus = () => {
        const candidates = [
          previous,
          scene?.querySelector<HTMLElement>(".viewport"),
          game?.querySelector<HTMLElement>(".wmap__go, .hub__world[aria-current]"),
          ...Array.from(game?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
        ];
        const destination = candidates.find((candidate): candidate is HTMLElement => !!candidate && canFocus(candidate));
        destination?.focus({ preventScroll: true });
      };
      restoreFocus();
      // A map/next-board action can remove the old scene during this commit.
      // Finish restoration after its replacement is mounted, without stealing
      // focus from another dialog or a control the user already chose.
      queueMicrotask(() => {
        if (!document.activeElement || document.activeElement === document.body) restoreFocus();
      });
    };
  }, [modal]);

  return <div ref={dialog} className={className} role="dialog" aria-modal={modal ? true : undefined} aria-label={ariaLabel} aria-labelledby={labelledBy} tabIndex={-1}>
    {children}
  </div>;
}
