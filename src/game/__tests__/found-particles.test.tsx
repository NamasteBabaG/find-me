// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { planScenePlay } from "@/domain/game/replay";
import { createMissionState, missionReducer, type MissionCopy } from "@/domain/game/mission";
import { SceneViewport } from "../components/SceneViewport";
import { targetGeometry } from "../engine/target-geometry";
import { readFileSync } from "node:fs";

const viewport = vi.hoisted(() => ({ transform: { tx: 12, ty: -24, scale: 0.5 }, viewport: { width: 1024, height: 768 }, isDragging: false, bind: {} }));
vi.mock("../engine/useViewport", () => ({ useViewport: () => viewport }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("particle-only find feedback", () => {
  it.each(["front", "behindForeground"] as const)("does not move or lift a %s patch, and draws particles outside the stage", layer => {
    const scene = buildDemoConfig("en").scenes[0]!;
    const plan = planScenePlay(scene, { plays: 0 }, "test");
    const target = scene.targets.find(t => t.id === plan.order[0])!;
    target.slots = [{ ...target.slots[0], layer }, { ...target.slots[1], layer }];
    const copy: MissionCopy = { successByTarget: {}, itemByTarget: {}, wrongTarget: "", wrongTargetNoItem: "", bonus: "", fallbackSuccess: "Found!" };
    const searching = { ...missionReducer(createMissionState(scene.slug, plan), { type: "START", now: 1 }, copy), hintLevel: 2 as const };
    const props = { scene, hintLevel: 2 as const, bonusFound: false, onHit: vi.fn() };
    const view = render(<SceneViewport {...props} mission={searching} />);
    const drawing = view.container.querySelector(`[data-target="${target.id}"]`)!;
    const originalStyle = drawing.getAttribute("style");
    expect(view.container.querySelector(".stage__glow")).not.toBeNull();
    expect(view.container.querySelector(".found-particles")).toBeNull();
    const found = missionReducer(searching, { type: "TAP_TARGET", targetId: target.id, now: 2 }, copy);
    view.rerender(<SceneViewport {...props} mission={found} />);
    expect(drawing.getAttribute("style")).toBe(originalStyle);
    expect(drawing.getAttribute("data-found")).toBe("true");
    expect(drawing.classList.contains("stage__target--patch")).toBe(true);
    expect(view.container.querySelector(".stage__glow, .stage__halo, .stage__target--found")).toBeNull();
    expect(view.container.querySelector(".stage .found-particles")).toBeNull();
    const particles = view.container.querySelector(".viewport__particles .found-particles") as HTMLElement;
    expect(particles.querySelectorAll(".found-particles__spark")).toHaveLength(8);
    const center = targetGeometry(scene, target, "A").center;
    expect(parseFloat(particles.style.left)).toBeCloseTo(center.x * scene.art.width * 0.5 + 12);
    expect(view.container.querySelector(".viewport")?.lastElementChild?.className).toBe("viewport__particles");
    const cleared = missionReducer(found, { type: "CLEAR_FEEDBACK" }, copy);
    view.rerender(<SceneViewport {...props} mission={cleared} />);
    expect(view.container.querySelector(".found-particles")).toBeNull();
  });

  it("has no legacy found glow/ring CSS and respects reduced motion", () => {
    const css = readFileSync("src/game/game.css", "utf8");
    expect(css).not.toMatch(/tgt-shine|halo-bloom|stage__halo/);
    expect(css).toContain(".stage__target--patch .stage__sprite { filter: none; }");
    expect(css).toMatch(/prefers-reduced-motion: reduce[^}]+\.found-particles\s*\{ display: none;/);
    expect(css).toContain("translate(var(--spark-x), var(--spark-y))");
  });
});
