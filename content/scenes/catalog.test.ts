import { describe, expect, it } from "vitest";
import { allWorlds } from "../worlds";
import { boardSlugs } from "@/domain/world";
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

  it("has every board of every world active, and no active board outside one", () => {
    // Naming three slugs pinned the MVP's boards, and went stale the moment
    // world 1 became nine real destinations. The invariant is the one that
    // actually matters: a board a world sends a child to has to be playable,
    // and an active board nobody can reach is a board nobody is looking after.
    const active = new Set(SCENE_CATALOG.filter((e) => e.scene.active).map((e) => e.scene.slug));
    const inWorlds = new Set(allWorlds().flatMap((w) => boardSlugs(w)));
    expect([...inWorlds].filter((slug) => !active.has(slug))).toEqual([]);
    expect([...active].filter((slug) => !inWorlds.has(slug))).toEqual([]);
  });

  it("prints authoring warnings (non-blocking)", () => {
    for (const { scene, warnings } of SCENE_CATALOG) {
      for (const w of warnings) console.info(`[scene:${scene.slug}] ${w}`);
    }
    expect(true).toBe(true);
  });
});
