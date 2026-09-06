import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { beachDemoPatches } from "../../../content/demo/beach-patches";
import { planScenePlay, usableVariants } from "@/domain/game/replay";
import { targetGeometry } from "@/game/engine/target-geometry";
import { buildDemoConfig, demoPatchCoverage } from "../demo";
import { sceneBySlug } from "../scene-catalog.service";

const fixtures = [
  { id: "float", hash: "b7e71e6dd0b09d6c21ca962725c71c0f753cc6ac8088ecad31f077687816bd59", face: [94, 78, 20, 22], samples: 1373 },
  { id: "sandcastle", hash: "50211623632b36493c67e115f20620aa4f8aef7fd00f022eb94ab9cb62ae0479", face: [98, 64, 15, 18], samples: 839 },
  { id: "umbrella", hash: "cf7c63f15bd8e7ff4d80699b64be9d81de6c576410482787d7ebc5857cf7ac4a", face: [58, 37, 8, 9], samples: 223 },
] as const;

describe("versioned beach demo renders", () => {
  it("uses baked occlusion without the obsolete duplicated parasols, without mutating the catalog", () => {
    const authoredForeground = sceneBySlug("beach").art.foreground;
    expect(authoredForeground).toBeTruthy();
    expect(buildDemoConfig("en").scenes[0]!.art.foreground).toBeUndefined();
    expect(sceneBySlug("beach").art.foreground).toBe(authoredForeground);
  });
  it.each(fixtures)("ships the reviewed $id bytes, dimensions and opaque face interior", async ({ id, hash, face, samples }) => {
    const sprite = beachDemoPatches[id]!;
    if (sprite.kind !== "image") throw new Error("Expected a generated patch");
    const bytes = readFileSync(`public${sprite.url}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([sprite.width, sprite.height]);
    // Fixed manually inspected face interiors, NOT a general face detector.
    const [cx, cy, rx, ry] = face;
    let count = 0;
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      expect(data[(y * info.width + x) * 4 + 3]).toBe(255);
      count++;
    }
    expect(count).toBe(samples);
  });

  it("never restores old B hats on replay, including histories from the old demo", () => {
    const scene = buildDemoConfig("he").scenes[0]!;
    expect(scene.targets).toHaveLength(3);
    for (const target of scene.targets) {
      expect(usableVariants(target)).toEqual(["A"]);
      expect(target.sprite).toEqual(beachDemoPatches[target.id]);
      const { hitRect, head, hintZone, center } = targetGeometry(scene, target, "A");
      expect(head.x).toBeGreaterThanOrEqual(hitRect.x0);
      expect(head.x).toBeLessThanOrEqual(hitRect.x1);
      expect(hintZone.x).toBe(center.x);
      expect(hintZone.y).toBe(center.y);
    }
    for (let plays = 0; plays < 30; plays++) {
      const plan = planScenePlay(scene, { plays, lastVariants: { float: "B", sandcastle: "A", umbrella: "B" } }, "demo");
      expect(Object.values(plan.variants)).toEqual(["A", "A", "A"]);
      expect([...plan.order].sort()).toEqual(["float", "sandcastle", "umbrella"]);
    }
    // Three new A assets do not prove that the six authored slots were rendered.
    expect(demoPatchCoverage("beach", scene.targets)).toMatchObject({ ready: 3, total: 6, missing: ["float/B", "sandcastle/B", "umbrella/B"] });
  });
});
