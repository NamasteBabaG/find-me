import { GameConfigSchema, type GameConfig } from "../../game/config";
import { AdventureCatalogSchema, type AdventureCatalog } from "../content";

/** Synthetic geometry and copy, NOT approved board art or a customer game. */
export function adventureFixture(count: 4 | 5 = 5): { config: GameConfig; catalog: AdventureCatalog } {
  const slot = { id: "slot", x: .2, y: .65, scale: .2, hintZone: { x: .2, y: .65, r: .15 }, hintText: "Synthetic hint" };
  const config = GameConfigSchema.parse({
    version: 1, gameId: "synthetic-album-game", locale: "en", child: { name: "Example", avatarUrl: "/api/assets/synthetic-avatar" },
    styleVersion: "synthetic", packageTier: "ONE_WORLD", composedAt: "2026-09-14T00:00:00.000Z",
    scenes: [{
      slug: "portrait-test", worldSlug: "pilot", version: 1, playMode: "find-any", appearancesPerBoard: count, findsRequiredToAdvance: 3,
      name: "Synthetic market", tagline: "Synthetic", artStatus: "final",
      art: { width: 600, height: 900, base: "/scenes/portrait-test/base.png", thumbnail: "/synthetic-thumb.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
      targets: Array.from({ length: count }, (_, i) => ({
        id: `hide-${i + 1}`, targetType: "synthetic", difficulty: 1, mission: "Find Example", item: "Example", success: ["Found"], animation: "peek", slots: [slot, slot],
        sprite: { kind: "image", url: `/api/assets/synthetic-${i}`, width: 60, height: 252,
          rect: { x: .08 + i * .1, y: .5, w: .1, h: .28 }, hitRect: { x: .1 + i * .1, y: .52, w: .06, h: .2 } },
      })),
      ambient: [], celebration: { kind: "stars", completeText: "Found Example" }, collectible: { id: "old-stamp", name: "Stamp", icon: "star" },
    }],
  });
  const t = (en: string, he = en) => ({ en, he });
  const catalog = AdventureCatalogSchema.parse({
    version: 1, releaseId: "synthetic-pilot-v1", boards: [{
      status: "ready", boardSlug: "portrait-test", worldSlug: "pilot", name: t("Market", "שוק"), plannedHides: 5,
      direction: { orientation: "portrait", perspective: "shallow", scaleTreatment: "similar-size-people", locationCues: [t("Tiles"), t("Lanterns")], microStories: [t("A cat"), t("A picnic")] },
      sceneVersion: 1, art: { base: "/scenes/portrait-test/base.png", width: 600, height: 900, sha256: "a".repeat(64) },
      personalZones: [{ x: .04, y: .45, w: .6, h: .4 }],
      discoveries: [{ id: "cat", name: t("Basket cat", "החתול של הסל"), hint: t("Look beside the basket", "חפשו לצד הסל"), category: "animal",
        description: { kind: "story", text: t("The cat is guarding a basket.", "החתול שומר על סל.") },
        visibleRect: { x: .72, y: .12, w: .1, h: .12 }, hitRect: { x: .73, y: .13, w: .08, h: .1 }, cardCrop: { x: .7, y: .1, w: .14, h: .16 },
      }],
      postcard: { id: "market-postcard", title: t("My market adventure", "ההרפתקה שלי בשוק"), targetId: "hide-1", crop: { x: .07, y: .49, w: .13, h: .3 } },
    }],
  });
  return { config, catalog };
}
