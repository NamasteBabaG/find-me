import { TWO_WORLD_RELEASE_BOARDS, TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "./two-worlds-release";
import { LocalPatchBoardSchema, assertPlaceable, cropOf } from "../../src/domain/scene/local-patch-hides";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { REFRESHED_COLLECTION_VERSION } from "../../src/domain/scene/local-patch-versions";

// Reuse the same approved masters shown in the storefront, with their measured
// placements and discoveries. Remove the pilot child's personal age/hair brief.
const neutral = (s: string): string => s.replace(/\bBar\b/g, "the supplied child")
  .replace(/(?:parent-confirmed )?age[- ]five/gi, "parent-stated age")
  .replace(/five-year-old|preschool-sized|preschool/gi, "age-appropriate")
  .replace(/(?:dark )?brown (?:curls|hair)/gi, "canonical hair")
  .replace(/canonical curls|curl pattern|curls/gi, "canonical hair pattern")
  .replace(/curly hair/gi, "canonical hair");
const routes = TWO_WORLD_RELEASE_ROUTES.filter(r => r.world === "journey");
export const REFRESHED_COLLECTION_BOARDS = routes.map(route => {
  const source = TWO_WORLD_RELEASE_BOARDS.find(b => b.board === route.slug)!;
  const board = LocalPatchBoardSchema.parse({ ...source, board: route.route, wardrobe: neutral(source.wardrobe!),
    hides: source.hides.map((hide, i) => ({ ...hide, id: `${route.route}-v11-${i + 1}`,
      placement: hide.placement && Object.fromEntries(Object.entries(hide.placement).map(([k, v]) => [k, typeof v === "string" ? neutral(v) : v])),
    })),
  });
  assertPlaceable(board, { width: 3840, height: 2160 });
  return board;
});
export const REFRESHED_WIZARD_CATALOG = AdventureCatalogSchema.parse({ version: 1, releaseId: "wizard-refreshed-journey-v11",
  boards: routes.map(route => {
    const plan = TWO_WORLD_RELEASE_CATALOG.boards.find(b => b.boardSlug === route.slug)!;
    if (plan.status !== "ready") throw Error(`Missing refreshed board ${route.route}`);
    return { ...plan, boardSlug: route.route, sceneVersion: REFRESHED_COLLECTION_VERSION,
      personalZones: REFRESHED_COLLECTION_BOARDS.find(b => b.board === route.route)!.hides.map(h => {
        const c = cropOf(h); return { x: c.left / 3840, y: c.top / 2160, w: c.width / 3840, h: c.height / 2160 };
      }),
    };
  }),
});
