import { describe, expect, it } from "vitest";
import { createMissionState, currentTargetId, missionReducer, sceneSummary, type MissionCopy } from "../game/mission";
import type { ScenePlayPlan } from "../game/replay";

const plan: ScenePlayPlan = {
  playIndex: 0,
  order: ["float", "sandcastle", "umbrella"],
  variants: { float: "A", sandcastle: "A", umbrella: "A" },
  successIndex: { float: 0, sandcastle: 0, umbrella: 0 },
  bonusVariant: "A",
};

const copy: MissionCopy = {
  successByTarget: { float: ["מצאתם אותי!"], sandcastle: ["כמעט!"], umbrella: ["עיני נץ!"] },
  itemByTarget: { float: "גלגל ים", sandcastle: "ארמון חול", umbrella: "שמשייה" },
  wrongTarget: "זה אני! אבל עכשיו מחפשים אותי עם {item}…",
  wrongTargetNoItem: "זה אני! אבל עכשיו מחפשים גרסה אחרת שלי…",
  bonus: "מצאתם גם אותי! זזזז…",
  fallbackSuccess: "מצאתם אותי!",
};

describe("missionReducer", () => {
  it("does not evaluate taps before START", () => {
    const s0 = createMissionState("beach", plan);
    const s1 = missionReducer(s0, { type: "TAP_TARGET", targetId: "float", now: 10 }, copy);
    expect(s1).toBe(s0);
  });

  it("walks through all three missions in plan order", () => {
    let s = missionReducer(createMissionState("beach", plan), { type: "START", now: 0 }, copy);
    expect(currentTargetId(s)).toBe("float");

    s = missionReducer(s, { type: "TAP_MISS", x: 0.1, y: 0.1 }, copy);
    expect(s.misses).toBe(1);
    expect(s.lastFeedback?.kind).toBe("miss");

    s = missionReducer(s, { type: "TAP_TARGET", targetId: "float", now: 1500 }, copy);
    expect(s.phase).toBe("found");
    expect(s.lastFeedback).toEqual({ kind: "hit", targetId: "float", bubble: "מצאתם אותי!" });
    expect(s.found.float).toEqual({ hintsUsed: 0, misses: 1, elapsedMs: 1500 });

    s = missionReducer(s, { type: "FOUND_DONE", now: 2000 }, copy);
    expect(s.phase).toBe("searching");
    expect(currentTargetId(s)).toBe("sandcastle");
    expect(s.misses).toBe(0);
    expect(s.hintLevel).toBe(0);

    s = missionReducer(s, { type: "TAP_TARGET", targetId: "sandcastle", now: 2500 }, copy);
    s = missionReducer(s, { type: "FOUND_DONE", now: 2600 }, copy);
    s = missionReducer(s, { type: "TAP_TARGET", targetId: "umbrella", now: 3000 }, copy);
    s = missionReducer(s, { type: "FOUND_DONE", now: 3100 }, copy);
    expect(s.phase).toBe("complete");
    expect(currentTargetId(s)).toBeNull();
  });

  it("treats tapping a non-current version as a friendly nudge (counts as a miss, never fails)", () => {
    let s = missionReducer(createMissionState("beach", plan), { type: "START", now: 0 }, copy);
    s = missionReducer(s, { type: "TAP_TARGET", targetId: "umbrella", now: 100 }, copy);
    expect(s.phase).toBe("searching");
    expect(s.misses).toBe(1);
    expect(s.lastFeedback?.kind).toBe("wrongTarget");
    if (s.lastFeedback?.kind === "wrongTarget") expect(s.lastFeedback.bubble).toContain("גלגל ים");
  });

  it("escalates hints to level 3 and counts them", () => {
    let s = missionReducer(createMissionState("beach", plan), { type: "START", now: 0 }, copy);
    s = missionReducer(s, { type: "REQUEST_HINT" }, copy);
    s = missionReducer(s, { type: "REQUEST_HINT" }, copy);
    s = missionReducer(s, { type: "REQUEST_HINT" }, copy);
    s = missionReducer(s, { type: "REQUEST_HINT" }, copy);
    expect(s.hintLevel).toBe(3);
    expect(s.hintsUsedTotal).toBe(3);
    s = missionReducer(s, { type: "TAP_TARGET", targetId: "float", now: 100 }, copy);
    expect(s.found.float?.hintsUsed).toBe(3);
    expect(sceneSummary(s).noHints).toBe(false);
  });

  it("finds the bonus character at most once", () => {
    let s = missionReducer(createMissionState("beach", plan), { type: "START", now: 0 }, copy);
    s = missionReducer(s, { type: "TAP_BONUS" }, copy);
    expect(s.bonusFound).toBe(true);
    const again = missionReducer(s, { type: "TAP_BONUS" }, copy);
    expect(again).toBe(s);
  });
});
