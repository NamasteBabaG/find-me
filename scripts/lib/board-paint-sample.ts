/** Owner-approved 2026-09-27: THREE image purchases, ONE attempt per authored
 * dragon hide. Separate immutable receipts; no original game/asset mutation.
 * The dollar ceiling is an additional local reservation guard, not an invoice. */
export const BOARD_PAINT_SAMPLE = Object.freeze({
  id: "bar-dragon-board-paint-v12-sample-20260927",
  slug: "magic-dragoncave-refresh-v3",
  storage: "storage/bar-dragon-board-paint-v12-sample-20260927",
  capMicroUsd: 600_000,
});

export function assertBoardPaintSample(input: {
  twoWorlds: boolean; slug?: string; phase: string; target?: string; attempt: number;
}) {
  const targets = [1, 2, 3].map(n => `${BOARD_PAINT_SAMPLE.slug}-${n}`);
  if (!input.twoWorlds || input.slug !== BOARD_PAINT_SAMPLE.slug || input.attempt !== 1
    || !(input.phase === "--dry-run" && !input.target || input.phase === "--render" && targets.includes(input.target ?? ""))) {
    throw Error("Board-paint sample allows only the three dragon hides, attempt 1, dry-run/render; no retries or other boards");
  }
}
