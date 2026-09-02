/**
 * Hint rules. There is no penalty for hints; they exist so a child is
 * never stuck. Escalation:
 *   1 — verbal nudge (slot.hintText)
 *   2 — a soft glow over the hint zone
 *   3 — a magnifying glass drifts to the exact spot
 */
export const MAX_HINT_LEVEL = 3 as const;
export type HintLevel = 0 | 1 | 2 | 3;

/** After this many wrong taps the hint button starts to pulse. */
export const HINT_PULSE_AFTER_MISSES = 3;
/** …or after this much idle searching time. */
export const HINT_PULSE_AFTER_MS = 20_000;

export function nextHintLevel(current: HintLevel): HintLevel {
  return current >= MAX_HINT_LEVEL ? MAX_HINT_LEVEL : ((current + 1) as HintLevel);
}

export function shouldPulseHint(input: { misses: number; elapsedMs: number; hintLevel: HintLevel }): boolean {
  if (input.hintLevel >= MAX_HINT_LEVEL) return false;
  return input.misses >= HINT_PULSE_AFTER_MISSES || input.elapsedMs >= HINT_PULSE_AFTER_MS;
}

/** A "no-hints" clear earns a small bonus medal — never the centre of the game. */
export function earnedEagleEye(hintsUsed: number): boolean {
  return hintsUsed === 0;
}
