import { describe, expect, it } from "vitest";
import { createMissionState, currentTargetId, missionCanAdvance, missionReducer, visibleTargetId, type FoundRecord, type MissionCopy } from "../game/mission";
import type { ScenePlayPlan } from "../game/replay";

const ids = ["a", "b", "c", "d", "e"];
const plan: ScenePlayPlan = { playIndex: 0, order: ids, variants: Object.fromEntries(ids.map(id => [id, "A"])), successIndex: {}, bonusVariant: "A" };
const copy: MissionCopy = { successByTarget: {}, itemByTarget: {}, wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" };
const record: FoundRecord = { hintsUsed: 1, misses: 2, elapsedMs: 300 };

describe("the one visible appearance", () => {
  it.each(Array.from({ length: 32 }, (_, mask) => mask))("resumes saved subset %i and skips every already-found ID", mask => {
    const saved = Object.fromEntries(ids.filter((_, index) => mask & (1 << index)).map(id => [id, { ...record }]));
    const remaining = ids.filter(id => !saved[id]);
    let state = createMissionState("board", plan, { playMode: "find-any", findsRequiredToAdvance: 3, found: saved });
    expect(visibleTargetId(state)).toBe(remaining[0] ?? null);
    state = missionReducer(state, { type: "START", now: 1 }, copy);
    expect(visibleTargetId(state)).toBe(remaining[0] ?? null);
    for (const [index, id] of remaining.entries()) {
      expect(state.phase).toBe("searching");
      expect(currentTargetId(state)).toBe(id);
      expect(visibleTargetId(state)).toBe(id);
      expect(state.found[id]).toBeUndefined();
      state = missionReducer(state, { type: "TAP_TARGET", targetId: id, now: 10 }, copy);
      expect(state.phase).toBe("found");
      expect(visibleTargetId(state)).toBe(id);
      expect(Object.keys(state.found)).toHaveLength(Object.keys(saved).length + index + 1);
      expect(missionCanAdvance(state)).toBe(Object.keys(state.found).length >= 3);
      if (Object.keys(state.found).length === 5) expect(currentTargetId(state)).toBeNull();
      state = missionReducer(state, { type: "FOUND_DONE", now: 20 }, copy);
      expect(visibleTargetId(state)).toBe(remaining[index + 1] ?? null);
    }
    expect(state.phase).toBe("complete");
    expect(visibleTargetId(state)).toBeNull();
    expect(Object.keys(state.found)).toHaveLength(5);
    for (const [id, savedRecord] of Object.entries(saved)) expect(state.found[id]).toEqual(savedRecord);
  });

  it("retains the actual hit through feedback even when a compatibility caller found a non-current ID", () => {
    let state = missionReducer(createMissionState("board", plan, { playMode: "find-any", findsRequiredToAdvance: 3 }), { type: "START", now: 1 }, copy);
    state = missionReducer(state, { type: "TAP_TARGET", targetId: "e", now: 2 }, copy);
    expect(currentTargetId(state)).toBe("a");
    expect(visibleTargetId(state)).toBe("e");
    state = missionReducer(state, { type: "FOUND_DONE", now: 3 }, copy);
    expect(visibleTargetId(state)).toBe("a");
    expect(state.found.e).toBeDefined();
  });

  it("preserves legacy serial visibility and hides all appearances at completion", () => {
    const legacy = { ...plan, order: ids.slice(0, 3) };
    let state = missionReducer(createMissionState("board", legacy), { type: "START", now: 1 }, copy);
    for (const [index, id] of legacy.order.entries()) {
      expect(visibleTargetId(state)).toBe(currentTargetId(state));
      expect(visibleTargetId(state)).toBe(id);
      state = missionReducer(state, { type: "TAP_TARGET", targetId: id, now: 2 }, copy);
      expect(visibleTargetId(state)).toBe(id);
      state = missionReducer(state, { type: "FOUND_DONE", now: 3 }, copy);
      expect(visibleTargetId(state)).toBe(legacy.order[index + 1] ?? null);
    }
    expect(state.phase).toBe("complete");
    expect(visibleTargetId({ ...state, lastFeedback: { kind: "hit", targetId: "c", bubble: "Found" } })).toBeNull();
  });
});
