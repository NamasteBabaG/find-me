import { describe, expect, it } from "vitest";
import { planScenePlay } from "../game/replay";
import type { SceneConfig } from "../game/config";

function slot(id: string, x: number, y: number) {
  return { id, x, y, scale: 0.05, rotation: 0, zIndex: 10, layer: "front" as const, flip: false, hintZone: { x, y, r: 0.1 }, hintText: "רמז" };
}

const scene: SceneConfig = {
  slug: "beach",
  version: 1,
  name: "חוף",
  tagline: "",
  artStatus: "placeholder",
  art: { width: 1600, height: 1000, base: "/b.svg", thumbnail: "/t.svg", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
  targets: [
    { id: "hard", targetType: "x", difficulty: 3, mission: "m", item: "i", success: ["a", "b"], animation: "peek", slots: [slot("h_a", 0.1, 0.1), slot("h_b", 0.9, 0.9)], sprite: { kind: "composed", faceUrl: "/f", bodyTemplate: "beach_float" } },
    { id: "easy", targetType: "x", difficulty: 1, mission: "m", item: "i", success: ["a"], animation: "bounce", slots: [slot("e_a", 0.2, 0.2), slot("e_b", 0.8, 0.8)], sprite: { kind: "composed", faceUrl: "/f", bodyTemplate: "beach_float" } },
    { id: "mid", targetType: "x", difficulty: 2, mission: "m", item: "i", success: ["a", "b", "c"], animation: "wave", slots: [slot("m_a", 0.3, 0.3), slot("m_b", 0.7, 0.7)], sprite: { kind: "composed", faceUrl: "/f", bodyTemplate: "beach_float" } },
  ],
  ambient: [],
  celebration: { kind: "bubbles", completeText: "done" },
  collectible: { id: "shell", name: "צדף", icon: "🐚" },
  sounds: {},
};

describe("planScenePlay", () => {
  it("first play is easy→hard with canonical A spots", () => {
    const plan = planScenePlay(scene, { plays: 0 }, "game_1");
    expect(plan.order).toEqual(["easy", "mid", "hard"]);
    expect(plan.variants).toEqual({ hard: "A", easy: "A", mid: "A" });
    expect(plan.successIndex).toEqual({ hard: 0, easy: 0, mid: 0 });
  });

  it("replay flips every spot away from the last play and rotates success lines", () => {
    const first = planScenePlay(scene, { plays: 0 }, "game_1");
    const second = planScenePlay(scene, { plays: 1, lastVariants: first.variants, lastOrder: first.order }, "game_1");
    expect(second.variants).toEqual({ hard: "B", easy: "B", mid: "B" });
    expect(second.order).not.toEqual(first.order);
    expect(second.successIndex.hard).toBe(1);
    expect(second.successIndex.easy).toBe(0); // only one line → always 0
    expect(second.successIndex.mid).toBe(1);

    const third = planScenePlay(scene, { plays: 2, lastVariants: second.variants, lastOrder: second.order }, "game_1");
    expect(third.variants).toEqual({ hard: "A", easy: "A", mid: "A" });
  });

  it("is deterministic for the same seed and play index", () => {
    const a = planScenePlay(scene, { plays: 4, lastVariants: { hard: "A" } }, "game_9");
    const b = planScenePlay(scene, { plays: 4, lastVariants: { hard: "A" } }, "game_9");
    expect(a).toEqual(b);
  });
});
