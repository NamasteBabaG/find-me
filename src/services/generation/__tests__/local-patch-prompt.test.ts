import { describe, expect, it } from "vitest";
import { LOCAL_PATCH_POSE_WORDING, LOCAL_PATCH_PROMPT_VERSION, localPatchPrompt } from "../local-patch-prompt";
import { LocalPatchPose, POSE_MASK, WORLD_LOCAL_PATCH_HIDES, maskInCrop } from "../../../domain/scene/local-patch-hides";

describe("what the painter is told for one local patch", () => {
  it("names the pose it wants and how that body meets the ground", () => {
    const kneeling = localPatchPrompt({ ground: "beach sand", pose: "kneeling", ageYears: 8 });
    expect(kneeling).toMatch(/KNEELING on the ground/);
    expect(kneeling).toMatch(/her knees and shins on the ground/);
    // The shadow clause has to follow the pose, or a kneeling child gets a
    // shadow drawn under feet that are folded away underneath her.
    expect(kneeling).not.toMatch(/both feet on the ground/);

    const sitting = localPatchPrompt({ ground: "market sand", pose: "sitting-cross-legged" });
    expect(sitting).toMatch(/SITTING ON THE GROUND with her legs crossed/);
    expect(sitting).toMatch(/her crossed legs and seat on the ground/);
  });

  it("tells it not to resize her to fill whatever box it was given", () => {
    // The mask is shaped for the pose, so the two must not fight: a standing box
    // around a kneeling child is how she came back standing.
    expect(localPatchPrompt({ ground: "snow", pose: "crouching" }))
      .toMatch(/do not stand her up to fill a tall box, and do not shrink her to sit inside a short one/);
  });

  it("states the age the parent gave, and says who not to measure her against", () => {
    const eight = localPatchPrompt({ ground: "cobbles", pose: "standing", ageYears: 8 });
    expect(eight).toMatch(/8 years old/);
    expect(eight).toMatch(/never against the toddlers|not.*toddlers/i);

    // An age nobody supplied is never invented - the wording falls back to the
    // reference photograph rather than making everyone eight.
    const unknown = localPatchPrompt({ ground: "cobbles", pose: "standing" });
    expect(unknown).not.toMatch(/\d+ years old/);
    expect(unknown).toMatch(/age was not supplied/);
  });

  it("refuses an age that is not a real one rather than passing it to the painter", () => {
    expect(() => localPatchPrompt({ ground: "sand", pose: "standing", ageYears: 0 })).toThrow(/invalid child age/);
    expect(() => localPatchPrompt({ ground: "sand", pose: "standing", ageYears: 40 })).toThrow(/invalid child age/);
  });

  it("keeps the two ways of fitting her in, and forbids the half-erasure", () => {
    const prompt = localPatchPrompt({ ground: "market sand", pose: "peeking", ageYears: 6 });
    expect(prompt).toMatch(/BETWEEN or BEHIND the people and things already there/);
    expect(prompt).toMatch(/gone COMPLETELY/);
    expect(prompt).toMatch(/never a hand still closed around somebody who is no longer there/);
    expect(prompt).toMatch(/Do NOT add any other person or animal/);
  });

  it("has wording for every pose a board may author", () => {
    for (const pose of LocalPatchPose.options) {
      expect(LOCAL_PATCH_POSE_WORDING[pose].instruction.length).toBeGreaterThan(20);
      expect(LOCAL_PATCH_POSE_WORDING[pose].support.length).toBeGreaterThan(5);
      expect(POSE_MASK[pose].height).toBeGreaterThan(0);
    }
    expect(LOCAL_PATCH_PROMPT_VERSION).toMatch(/^local-patch-prompt\/v\d+$/);
  });

  it("gives a lower pose a shorter box that still sits on the same ground line", () => {
    // Every box has to end where a standing child's feet would have been, or she
    // is drawn at the wrong depth for the people beside her.
    const bottoms = LocalPatchPose.options.map(p => maskInCrop(p).top + maskInCrop(p).height);
    expect(new Set(bottoms).size).toBe(1);
    expect(maskInCrop("sitting-cross-legged").height).toBeLessThan(maskInCrop("standing").height);
    expect(maskInCrop("sitting-cross-legged").width).toBeGreaterThan(maskInCrop("standing").width);
  });

  it("the world actually uses more than one pose", () => {
    // The whole point of authoring a pose per hide: a world of twenty-seven
    // children standing and facing the reader is one picture, printed twenty-seven times.
    const poses = WORLD_LOCAL_PATCH_HIDES.flatMap(b => b.hides.map(h => h.pose));
    expect(new Set(poses).size).toBeGreaterThanOrEqual(4);
    expect(poses.filter(p => p === "standing").length).toBeLessThan(poses.length / 2);
    for (const board of WORLD_LOCAL_PATCH_HIDES) {
      expect(new Set(board.hides.map(h => h.pose)).size).toBe(board.hides.length);
    }
  });
});
