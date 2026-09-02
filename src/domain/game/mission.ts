import type { HintLevel } from "./hints";
import { nextHintLevel } from "./hints";
import type { ScenePlayPlan } from "./replay";

/**
 * Mission reducer — the heart of one scene play. Pure and fully testable.
 *
 * Phases:
 *   intro      → establishing pan, mission card slides in
 *   searching  → taps are evaluated
 *   found      → the found animation + bubble are playing
 *   complete   → all three found; celebration & scene-complete card
 */
export type MissionPhase = "intro" | "searching" | "found" | "complete";

export interface FoundRecord {
  hintsUsed: number;
  misses: number;
  elapsedMs: number;
}

export interface MissionState {
  sceneSlug: string;
  plan: ScenePlayPlan;
  phase: MissionPhase;
  currentIndex: number;
  /** Wrong taps for the current mission. */
  misses: number;
  hintLevel: HintLevel;
  hintsUsedTotal: number;
  found: Record<string, FoundRecord>;
  bonusFound: boolean;
  /** ms timestamp when the current mission started (0 until START). */
  missionStartedAt: number;
  /** Feedback for the renderer; consumed by the UI once shown. */
  lastFeedback: Feedback | null;
}

export type Feedback =
  | { kind: "hit"; targetId: string; bubble: string }
  | { kind: "miss"; x: number; y: number }
  | { kind: "wrongTarget"; targetId: string; bubble: string }
  | { kind: "bonus"; bubble: string }
  | { kind: "hint"; level: HintLevel }
  | { kind: "ambient"; ambientId: string };

export type MissionAction =
  | { type: "START"; now: number }
  | { type: "TAP_TARGET"; targetId: string; now: number }
  | { type: "TAP_MISS"; x: number; y: number }
  | { type: "TAP_BONUS" }
  | { type: "TAP_AMBIENT"; ambientId: string }
  | { type: "REQUEST_HINT" }
  | { type: "FOUND_DONE"; now: number }
  | { type: "CLEAR_FEEDBACK" };

export interface MissionCopy {
  /** Success lines per target, already personalised. */
  successByTarget: Record<string, string[]>;
  /** Item names per target, e.g. "גלגל ים". */
  itemByTarget: Record<string, string>;
}

export function createMissionState(sceneSlug: string, plan: ScenePlayPlan): MissionState {
  return {
    sceneSlug,
    plan,
    phase: "intro",
    currentIndex: 0,
    misses: 0,
    hintLevel: 0,
    hintsUsedTotal: 0,
    found: {},
    bonusFound: false,
    missionStartedAt: 0,
    lastFeedback: null,
  };
}

export function currentTargetId(state: MissionState): string | null {
  return state.plan.order[state.currentIndex] ?? null;
}

export function isFound(state: MissionState, targetId: string): boolean {
  return targetId in state.found;
}

export function missionNumber(state: MissionState): number {
  return Math.min(state.currentIndex + 1, state.plan.order.length);
}

export function missionReducer(state: MissionState, action: MissionAction, copy: MissionCopy): MissionState {
  switch (action.type) {
    case "START": {
      if (state.phase !== "intro") return state;
      return { ...state, phase: "searching", missionStartedAt: action.now, lastFeedback: null };
    }

    case "TAP_TARGET": {
      if (state.phase !== "searching") return state;
      const current = currentTargetId(state);
      if (!current) return state;

      if (action.targetId !== current) {
        // Tapping one of the other versions of the child is a friendly nudge, not a failure.
        if (isFound(state, action.targetId)) return state; // already found — ignore
        const item = copy.itemByTarget[current] ?? "";
        const bubble = item ? `זה אני! אבל עכשיו מחפשים אותי עם ${item}…` : "זה אני! אבל עכשיו מחפשים גרסה אחרת שלי…";
        return { ...state, misses: state.misses + 1, lastFeedback: { kind: "wrongTarget", targetId: action.targetId, bubble } };
      }

      const lines = copy.successByTarget[current] ?? ["מצאתם אותי!"];
      const idx = state.plan.successIndex[current] ?? 0;
      const bubble = lines[idx % lines.length] ?? "מצאתם אותי!";
      const elapsedMs = Math.max(0, action.now - state.missionStartedAt);
      return {
        ...state,
        phase: "found",
        found: {
          ...state.found,
          [current]: { hintsUsed: state.hintLevel, misses: state.misses, elapsedMs },
        },
        lastFeedback: { kind: "hit", targetId: current, bubble },
      };
    }

    case "TAP_MISS": {
      if (state.phase !== "searching") return state;
      return { ...state, misses: state.misses + 1, lastFeedback: { kind: "miss", x: action.x, y: action.y } };
    }

    case "TAP_BONUS": {
      if (state.bonusFound || state.phase === "intro") return state;
      return { ...state, bonusFound: true, lastFeedback: { kind: "bonus", bubble: "מצאתם גם אותי! זזזז…" } };
    }

    case "TAP_AMBIENT": {
      if (state.phase === "intro") return state;
      return { ...state, lastFeedback: { kind: "ambient", ambientId: action.ambientId } };
    }

    case "REQUEST_HINT": {
      if (state.phase !== "searching") return state;
      const level = nextHintLevel(state.hintLevel);
      if (level === state.hintLevel) return { ...state, lastFeedback: { kind: "hint", level } };
      return { ...state, hintLevel: level, hintsUsedTotal: state.hintsUsedTotal + 1, lastFeedback: { kind: "hint", level } };
    }

    case "FOUND_DONE": {
      if (state.phase !== "found") return state;
      const nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.plan.order.length) {
        return { ...state, phase: "complete", currentIndex: nextIndex, lastFeedback: null };
      }
      return {
        ...state,
        phase: "searching",
        currentIndex: nextIndex,
        misses: 0,
        hintLevel: 0,
        missionStartedAt: action.now,
        lastFeedback: null,
      };
    }

    case "CLEAR_FEEDBACK":
      return state.lastFeedback ? { ...state, lastFeedback: null } : state;

    default:
      return state;
  }
}

export function sceneSummary(state: MissionState): { hintsUsed: number; misses: number; noHints: boolean; bonusFound: boolean } {
  const records = Object.values(state.found);
  const hintsUsed = records.reduce((n, r) => n + r.hintsUsed, 0);
  const misses = records.reduce((n, r) => n + r.misses, 0);
  return { hintsUsed, misses, noHints: hintsUsed === 0, bonusFound: state.bonusFound };
}
