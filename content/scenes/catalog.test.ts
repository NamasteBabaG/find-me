import { describe, expect, it } from "vitest";
import { SCENE_CATALOG } from "./index";
import { BODY_TEMPLATES } from "../body-templates";

describe("scene catalog", () => {
  it("loads every scene definition without errors", () => {
    expect(SCENE_CATALOG.length).toBeGreaterThanOrEqual(3);
  });

  it("references only known body templates", () => {
    for (const { scene } of SCENE_CATALOG) {
      for (const t of scene.targets) {
        expect(BODY_TEMPLATES[t.bodyTemplate], `${scene.slug}/${t.id} → ${t.bodyTemplate}`).toBeDefined();
      }
    }
  });

  it("has three active worlds for the MVP package", () => {
    const active = SCENE_CATALOG.filter((e) => e.scene.active).map((e) => e.scene.slug);
    expect(active).toEqual(expect.arrayContaining(["beach", "jungle", "space"]));
  });

  it("prints authoring warnings (non-blocking)", () => {
    for (const { scene, warnings } of SCENE_CATALOG) {
      for (const w of warnings) console.info(`[scene:${scene.slug}] ${w}`);
    }
    expect(true).toBe(true);
  });
});
