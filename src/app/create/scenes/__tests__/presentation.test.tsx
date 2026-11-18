import { describe, expect, it, vi } from "vitest";
import React from "react";
import { allWorlds } from "../../../../../content/worlds";
import { en } from "@/i18n/dictionaries/en";
import CreateScenesPage from "../page";
import { ScenePicker } from "../ScenePicker";

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ worldsForDraft: async () => allWorlds(), sceneVersionForLevel: () => 10,
  searchLevelTerms: async () => ({ asked: false, required: false, stale: false, openPayment: false, detectives: false }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: en, locale: "en" }) }));
const draft = vi.hoisted(() => ({ current: { id: "draft", childProfile: { originalPhotoAssetId: "photo" }, packageTier: null as string | null, scenes: [] } }));
vi.mock("@/lib/server/current-draft", () => ({ currentDraft: async () => draft.current }));

describe("choosing a world", () => {
  it("offers every world by name and emblem, never a board, and one world when the draft has no package", async () => {
    vi.stubGlobal("React", React);
    try {
      const result = await CreateScenesPage({ searchParams: Promise.resolve({}) });
      const picker = result.props.children;
      expect(picker.type).toBe(ScenePicker);
      expect(picker.props.want).toBe(1);
      expect(picker.props.scenes.map((o: { slug: string }) => o.slug)).toEqual(allWorlds().map(w => w.slug));
      for (const option of picker.props.scenes) expect(Object.keys(option).sort()).toEqual(["name", "slug", "tagline"]);
    } finally { vi.unstubAllGlobals(); }
  });
});
