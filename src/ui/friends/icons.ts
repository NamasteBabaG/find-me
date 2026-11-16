import type { IconName } from "../Icon";

/** A friend's reaction, drawn in the product's icon family (no emoji, Guy 2026-11-16). Nicknames are words alone. */
export const REACTION_ICONS = { wow: "sparkle", loved: "heart", again: "replay" } as const satisfies Record<string, IconName>;
