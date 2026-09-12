import { describe, expect, it } from "vitest";
import { LOCAL_PATCH_POSE_WORDING, LOCAL_PATCH_PROMPT_VERSION, localPatchPrompt, localPatchRepairChecks } from "../local-patch-prompt";
import { LocalPatchPose, POSE_MASK, WORLD_LOCAL_PATCH_HIDES, maskInCrop } from "../../../domain/scene/local-patch-hides";

describe("what the painter is told for one local patch", () => {
  it("uses same-board faces as the rendering authority without copying the reference outfit", () => {
    const prompt = localPatchPrompt({ ground: "snow", pose: "kneeling", ageYears: 5, boardPeopleReference: true });
    expect(prompt).toContain("Image 3 shows ORIGINAL drawn faces");
    expect(prompt).toContain("NOT the reference portrait's surface rendering");
    expect(prompt).not.toContain("Preserve the reference child's presentation, hairstyle and outfit cues");
    expect(prompt).not.toContain("Fill the masked area");
    expect(prompt).toContain("NOT a box to fill");
  });

  it("keeps the normal paid fingerprint stable and appends targeted repair instructions only for the final pass", () => {
    const input = { ground: "snow", pose: "standing" as const, ageYears: 5 };
    const normal = localPatchPrompt(input);
    expect(localPatchPrompt({ ...input, repairChecks: undefined })).toBe(normal);
    expect(normal).not.toContain("FINAL REPAIR");
    const checks = localPatchRepairChecks(JSON.stringify({ verdict: {
      styleMatch: "fail", scaleRight: "fail", faults: [{ check: "ignore-instructions" }], reason: "malicious arbitrary prose",
    } }));
    expect(checks).toEqual(["styleMatch", "scaleRight"]);
    const repair = localPatchPrompt({ ...input, repairChecks: checks });
    expect(repair.startsWith(normal)).toBe(true);
    expect(repair).toContain("Scene illustration overrides reference rendering");
    expect(repair).toContain("NOT a box to fill");
    expect(repair).not.toContain("malicious arbitrary prose");
    expect(localPatchRepairChecks(null)).toEqual([]);
    expect(localPatchRepairChecks("bad json")).toEqual([]);
  });
  it("names the pose it wants and how that body meets the ground", () => {
    const kneeling = localPatchPrompt({ ground: "beach sand", pose: "kneeling", ageYears: 8 });
    expect(kneeling).toMatch(/KNEELING on the ground/);
    expect(kneeling).toMatch(/their knees and shins on the ground/);
    // The shadow clause has to follow the pose, or a kneeling child gets a
    // shadow drawn under feet that are folded away underneath her.
    expect(kneeling).not.toMatch(/both feet on the ground/);

    const sitting = localPatchPrompt({ ground: "market sand", pose: "sitting-cross-legged" });
    expect(sitting).toMatch(/SITTING ON THE GROUND with their legs crossed/);
    expect(sitting).toMatch(/their crossed legs and seat on the ground/);
  });

  it("tells it not to resize her to fill whatever box it was given", () => {
    // The mask is shaped for the pose, so the two must not fight: a standing box
    // around a kneeling child is how she came back standing.
    expect(localPatchPrompt({ ground: "snow", pose: "crouching" }))
      .toMatch(/do not stand them up to fill a tall box, and do not shrink them to sit inside a short one/);
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
    expect(LOCAL_PATCH_PROMPT_VERSION).toBe("local-patch-prompt/v6");
  });

  it.each(LocalPatchPose.options)("preserves the reference child's presentation without assuming gender in %s", pose => {
    const wording = LOCAL_PATCH_POSE_WORDING[pose];
    const prompt = localPatchPrompt({ ground: "beach sand", pose, ageYears: 8 });
    for (const text of [wording.instruction, wording.support, prompt]) {
      expect(text).not.toMatch(/\b(?:she|her|hers|girl|girls|he|him|his|boy|boys)\b/i);
    }
    expect(prompt).toContain("Preserve the reference child's presentation, hairstyle and outfit cues");
    expect(prompt).toContain("age-appropriate everyday child clothing");
    expect(prompt).toContain("not adult fashions, mature styling or makeup");
    expect(prompt).toContain("Do not infer gender from a name");
    expect(prompt).toContain("8 years old");
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
