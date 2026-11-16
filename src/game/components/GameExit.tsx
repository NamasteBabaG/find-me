"use client";

import Link from "next/link";
import { ToolIcon } from "./ToolIcon";

/** Where the game's own way out leads: the parents' area of the signed-in owner (shared-link recipients get none). */
export interface GameExitTarget {
  href: string;
  label: string;
}

/**
 * The way out of the game, in the corner where a map's title starts (Guy, 2026-11-16: "there must never be a screen
 * with no way back, and not behind a hidden button"). It used to be a grey 14px link under the map, below the fold on
 * many phones. A house on a white button at the child's 64px size; the word shows where the bar has room and is
 * always the button's name.
 */
export function GameExit({ exit }: { exit: GameExitTarget }) {
  return (
    <Link href={exit.href} className="game-exit" aria-label={exit.label} title={exit.label}>
      <ToolIcon name="home" />
      <span className="game-exit__label" aria-hidden>{exit.label}</span>
    </Link>
  );
}
