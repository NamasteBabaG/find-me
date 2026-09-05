import type { GameStatus } from "./order-state";

/**
 * What the parent sees while the game is being made — computed from what has
 * actually happened, never from a clock.
 *
 * The old screen showed four labels and a spinner that moved when the status
 * changed. It changed three times in twenty minutes, and for the whole of the
 * long middle stretch — twenty-seven hiding spots at a minute each — it sat on
 * "hiding Noa in the places" with nothing moving. This turns the pipeline's
 * own bookkeeping into a percentage: the character exists or it does not, and
 * a hiding spot is painted or it is not.
 */
export const CREATION_MILESTONES = ["photo", "character", "hiding", "assemble", "check"] as const;
export type CreationMilestone = (typeof CREATION_MILESTONES)[number];
export type MilestoneState = "done" | "active" | "todo";
/**
 * What the parent should be told, and what they can do about it. One word per
 * situation, so the page, the API and the mail cannot each read the status
 * differently: working (nothing to do), retrying (a snag, handled), awaiting
 * review (a person checks), needs a new photo (the parent acts), ready, failed.
 */
export type CreationState = "working" | "retrying" | "awaiting_review" | "needs_new_photo" | "ready" | "failed";

export interface CreationSignals {
  status: GameStatus;
  /** The child's illustrated character exists — the identity sheet was drawn. */
  characterReady: boolean;
  /** Hiding spots painted so far, and how many the game has in all. */
  spotsDone: number;
  spotsTotal: number;
}

export interface CreationProgress {
  /** 0–100. Moves forward through a healthy run; a regeneration may pull it back. */
  percent: number;
  state: CreationState;
  milestones: Record<CreationMilestone, MilestoneState>;
  /** The milestone being worked on, or null once the game is done or has failed. */
  current: CreationMilestone | null;
  done: boolean;
  failed: boolean;
}

/**
 * How much of the bar each stage owns. Painting the hiding spots is most of
 * the wait, so it is most of the bar; the bar must not sit at 40% for fifteen
 * minutes and then sprint.
 */
const AT = { photo: 4, drawing: 8, character: 20, hidingEnd: 84, assemble: 90, check: 96, done: 100 } as const;

// Dead ends only. GENERATION_FAILED is retried by the next tick, so it is a snag, not a failure.
const FAILED: ReadonlySet<GameStatus> = new Set(["REFUNDED", "CANCELLED", "DELETED"]);

/** 0 = paid, 1 = drawing the character, 2 = painting spots, 3 = composing, 4 = checking, 5 = ready. */
function stageOf(status: GameStatus): number {
  switch (status) {
    case "PAID":
      return 0;
    case "AVATAR_GENERATING":
    case "NEEDS_NEW_PHOTO":
      return 1;
    case "TARGETS_GENERATING":
    case "NEEDS_REGENERATION":
    case "GENERATION_FAILED":
      return 2;
    case "SCENES_COMPOSING":
      return 3;
    case "QA_PENDING":
    case "MANUAL_REVIEW":
    case "APPROVED":
      return 4;
    case "READY":
    case "DELIVERED":
      return 5;
    default:
      return 0;
  }
}

export function creationProgress(s: CreationSignals): CreationProgress {
  const stage = stageOf(s.status);
  const done = stage === 5;
  const failed = FAILED.has(s.status);
  const state: CreationState = done ? "ready" : failed ? "failed" : s.status === "NEEDS_NEW_PHOTO" ? "needs_new_photo" : s.status === "GENERATION_FAILED" ? "retrying" : stage === 4 ? "awaiting_review" : "working";
  // The counters can be ahead of the status (a spot lands before the status
  // row is touched) and the status can be ahead of the counters (a regenerated
  // game re-enters painting with its old spots still counted). Either one is
  // allowed to say "done".
  const characterDone = s.characterReady || stage >= 2;
  const hidingDone = stage >= 3 || (s.spotsTotal > 0 && s.spotsDone >= s.spotsTotal && stage >= 2);
  const assembleDone = stage >= 4;
  const checkDone = stage >= 5;

  const flags: Record<CreationMilestone, boolean> = { photo: true, character: characterDone, hiding: hidingDone, assemble: assembleDone, check: checkDone };
  const current = done || failed ? null : (CREATION_MILESTONES.find((m) => !flags[m]) ?? null);
  const milestones = Object.fromEntries(CREATION_MILESTONES.map((m) => [m, flags[m] ? "done" : m === current ? "active" : "todo"])) as Record<CreationMilestone, MilestoneState>;

  let percent: number;
  if (done) percent = AT.done;
  else if (stage >= 4) percent = AT.check;
  else if (stage === 3) percent = AT.assemble;
  else if (characterDone) {
    const ratio = s.spotsTotal > 0 ? Math.min(1, Math.max(0, s.spotsDone / s.spotsTotal)) : 0;
    percent = Math.round(AT.character + (AT.hidingEnd - AT.character) * ratio);
  } else percent = stage >= 1 ? AT.drawing : AT.photo;

  return { percent, milestones, current, done, failed, state };
}
