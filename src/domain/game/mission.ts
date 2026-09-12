import type { HintLevel } from "./hints";
import { nextHintLevel } from "./hints";
import type { ScenePlayPlan } from "./replay";

/**
 * Mission reducer — the heart of one scene play. Pure, language-agnostic
 * and fully testable: every string it emits comes in via MissionCopy.
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
  playMode?: "find-any";
  findsRequiredToAdvance?: number;
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
  /** Item names per target, e.g. "a float ring". */
  itemByTarget: Record<string, string>;
  /** "It's me! But right now you're looking for me with {item}…" */
  wrongTarget: string;
  wrongTargetNoItem: string;
  bonus: string;
  fallbackSuccess: string;
}

export function createMissionState(sceneSlug: string, plan: ScenePlayPlan, options: { playMode?: "find-any"; findsRequiredToAdvance?: number; found?: Record<string, FoundRecord> } = {}): MissionState {
  const found = Object.fromEntries(Object.entries(options.found ?? {}).filter(([id]) => plan.order.includes(id)));
  return {
    playMode: options.playMode,
    findsRequiredToAdvance: options.findsRequiredToAdvance,
    sceneSlug,
    plan,
    phase: "intro",
    currentIndex: Math.max(0, plan.order.findIndex(id => !found[id])),
    misses: 0,
    hintLevel: 0,
    hintsUsedTotal: 0,
    found,
    bonusFound: false,
    missionStartedAt: 0,
    lastFeedback: null,
  };
}

export function currentTargetId(state: MissionState): string | null {
  if (state.playMode === "find-any" && Object.keys(state.found).length >= state.plan.order.length) return null;
  return state.plan.order[state.currentIndex] ?? null;
}

export function missionCanAdvance(state: MissionState): boolean {
  return Object.keys(state.found).length >= (state.findsRequiredToAdvance ?? state.plan.order.length);
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
      return { ...state, phase: Object.keys(state.found).length >= state.plan.order.length ? "complete" : "searching", missionStartedAt: action.now, lastFeedback: null };
    }

    case "TAP_TARGET": {
      if (state.phase !== "searching") return state;
      const current = currentTargetId(state);
      if (!current) return state;
      if (!state.plan.order.includes(action.targetId) || isFound(state, action.targetId)) return state;

      if (state.playMode !== "find-any" && action.targetId !== current) {
        // Tapping one of the other versions of the child is a friendly nudge, not a failure.
        if (isFound(state, action.targetId)) return state; // already found — ignore
        const item = copy.itemByTarget[current] ?? "";
        const bubble = item ? copy.wrongTarget.replace("{item}", item) : copy.wrongTargetNoItem;
        return { ...state, misses: state.misses + 1, lastFeedback: { kind: "wrongTarget", targetId: action.targetId, bubble } };
      }

      const foundId = action.targetId;
      const lines = copy.successByTarget[foundId] ?? [copy.fallbackSuccess];
      const idx = state.plan.successIndex[foundId] ?? 0;
      const bubble = lines[idx % lines.length] ?? copy.fallbackSuccess;
      const elapsedMs = Math.max(0, action.now - state.missionStartedAt);
      return {
        ...state,
        phase: "found",
        found: {
          ...state.found,
          [foundId]: { hintsUsed: foundId === current ? state.hintLevel : 0, misses: state.misses, elapsedMs },
        },
        lastFeedback: { kind: "hit", targetId: foundId, bubble },
      };
    }

    case "TAP_MISS": {
      if (state.phase !== "searching") return state;
      return { ...state, misses: state.misses + 1, lastFeedback: { kind: "miss", x: action.x, y: action.y } };
    }

    case "TAP_BONUS": {
      // Only while searching: a tap during the found celebration used to change
      // the feedback under the choreography that ends the mission, and the board
      // never moved on.
      if (state.bonusFound || state.phase !== "searching") return state;
      return { ...state, bonusFound: true, lastFeedback: { kind: "bonus", bubble: copy.bonus } };
    }

    case "TAP_AMBIENT": {
      if (state.phase !== "searching") return state;
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
      const nextIndex = state.playMode === "find-any"
        ? (isFound(state, state.plan.order[state.currentIndex] ?? "") ? state.plan.order.findIndex(id => !isFound(state, id)) : state.currentIndex)
        : state.currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= state.plan.order.length || Object.keys(state.found).length >= state.plan.order.length) {
        return { ...state, phase: "complete", currentIndex: nextIndex, lastFeedback: null };
      }
      return {
        ...state,
        phase: "searching",
        currentIndex: nextIndex,
        misses: 0,
        hintLevel: state.playMode === "find-any" && nextIndex === state.currentIndex ? state.hintLevel : 0,
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
