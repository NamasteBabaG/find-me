import { describe, expect, it, vi } from "vitest";
import React from "react";
import { allWorlds } from "../../../../../content/worlds";
import { worldPresentation } from "../../../../../content/home/board-presentation";
import { en } from "@/i18n/dictionaries/en";
import { PACKAGES } from "@/domain/package";
import CreateScenesPage from "../page";
import { ScenePicker } from "../ScenePicker";

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ worldsForDraft: async () => allWorlds() }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: en, locale: "en" }) }));
vi.mock("../../actions", () => ({ currentDraft: async () => ({ childProfile: {}, packageTier: Object.values(PACKAGES)[0]!.tier, scenes: [] }) }));

describe("creation world artwork", () => {
  it("passes the shared approved covers to the actual picker, retaining unrefreshed map fallback", async () => {
    vi.stubGlobal("React", React);
    try {
      const result = await CreateScenesPage();
      const picker = result.props.children;
      expect(picker.type).toBe(ScenePicker);
      for (const world of allWorlds()) {
        expect(picker.props.scenes.find((option: { slug: string }) => option.slug === world.slug).thumbnail)
          .toBe(worldPresentation(world.slug)?.thumbnail ?? world.map.artPortrait ?? world.map.art);
      }
    } finally { vi.unstubAllGlobals(); }
  });
});
