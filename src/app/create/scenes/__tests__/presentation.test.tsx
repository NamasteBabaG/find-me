import { describe, expect, it, vi } from "vitest";
import React from "react";
import { allWorlds } from "../../../../../content/worlds";
import { boardPresentation, presentationMatchesScene } from "../../../../../content/home/board-presentation";
import { findScene } from "../../../../../content/scenes";
import { boardSlugs } from "@/domain/world";
import { en } from "@/i18n/dictionaries/en";
import { PACKAGES } from "@/domain/package";
import CreateScenesPage from "../page";
import { ScenePicker } from "../ScenePicker";

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ worldsForDraft: async () => allWorlds(), sceneVersionForLevel: () => 10 }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: en, locale: "en" }) }));
vi.mock("@/lib/server/current-draft", () => ({ currentDraft: async () => ({ childProfile: {}, packageTier: Object.values(PACKAGES)[0]!.tier, scenes: [] }) }));

describe("creation world artwork", () => {
  it("uses only artwork bound to the purchased scene, otherwise the actual scene or map", async () => {
    vi.stubGlobal("React", React);
    try {
      const result = await CreateScenesPage();
      const picker = result.props.children;
      expect(picker.type).toBe(ScenePicker);
      for (const world of allWorlds()) {
        const slug = boardSlugs(world)[0]!;
        const scene = findScene(slug, 10);
        expect(picker.props.scenes.find((option: { slug: string }) => option.slug === world.slug).thumbnail)
          .toBe(presentationMatchesScene(slug, scene?.art) ? boardPresentation(slug)!.thumbnail : scene?.art.thumbnail ?? world.map.artPortrait ?? world.map.art);
      }
    } finally { vi.unstubAllGlobals(); }
  });
});
