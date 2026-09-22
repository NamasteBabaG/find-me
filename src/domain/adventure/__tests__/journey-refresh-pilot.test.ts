import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOURNEY_REFRESH_CATALOG, JOURNEY_REFRESH_PATCH_BOARDS, JOURNEY_REFRESH_IDENTITY_LOCK } from "../../../../content/adventures/journey-refresh-pilot";
import { overlaps } from "../content";
import { assertPlaceable, cropOf, maskForHide } from "../../scene/local-patch-hides";
import { localPatchPrompt } from "../../../services/generation/local-patch-prompt";
import { COLLECTION_PATCH_BOARDS } from "../../../../content/adventures/wizard-release";
import { threeBoardConfig } from "../../../../scripts/lib/adventure-three-config";
import { attachAdventureBook } from "../compose";
import { emptyAdventureProgress, recordAdventureEvent, adventureAlbum, readAdventureProgress } from "../progress";
import { projectPassport } from "../../passport/passport";

describe("staged Amazon refresh keeps identity, geometry and active games separate", () => {
  const board = JOURNEY_REFRESH_PATCH_BOARDS[0]!;
  const plan = JOURNEY_REFRESH_CATALOG.boards[0]!;
  it("pins the approved source and uses exactly three new non-colliding hides", () => {
    if (plan.status !== "ready") throw Error("Expected measured art");
    expect(createHash("sha256").update(readFileSync(board.art)).digest("hex")).toBe(plan.art.sha256);
    expect(board.hides).toHaveLength(3);
    expect(plan.plannedHides).toBe(3);
    expect(() => assertPlaceable(board, { width: 3840, height: 2160 })).not.toThrow();
    expect(new Set(board.hides.map(h => h.pose)).size).toBe(3);
    expect(COLLECTION_PATCH_BOARDS.some(b => b.board === board.board)).toBe(false);
  });
  it("protects all six measured discoveries and card crops from every full return window", () => {
    if (plan.status !== "ready") throw Error("Expected measured art");
    expect(plan.discoveries).toHaveLength(6);
    expect(plan.discoveries.map(d => d.rarity).sort()).toEqual(["common", "common", "common", "epic", "rare", "rare"]);
    for (const h of board.hides) {
      const c = cropOf(h), m = maskForHide(h);
      expect(Math.min(m.left, m.top, 512 - m.left - m.width, 768 - m.top - m.height)).toBeGreaterThanOrEqual(12);
      for (const d of plan.discoveries) {
        expect(overlaps({ x: c.left / 3840, y: c.top / 2160, w: c.width / 3840, h: c.height / 2160 }, d.cardCrop)).toBe(false);
        expect(d.cardCrop.x).toBeGreaterThan(0.15);
        expect(d.cardCrop.x + d.cardCrop.w).toBeLessThan(0.83);
        expect(d.cardCrop.y).toBeGreaterThan(0.23);
        expect(d.cardCrop.y + d.cardCrop.h).toBeLessThan(0.76);
      }
    }
  });
  it.each(board.hides)("$id makes the portrait the exclusive face/hair authority in the actual product prompt", hide => {
    const prompt = localPatchPrompt({ contentVersion: 10, ground: board.ground, wardrobe: board.wardrobe,
      pose: hide.pose, placement: hide.placement, mask: hide.mask, ageYears: 5 });
    expect(prompt).toContain("FACE AND HAIR AUTHORITY: Image 2 only");
    expect(prompt).toContain("There are only two images");
    expect(prompt).not.toMatch(/Image [34]/);
    expect(prompt).toContain(JOURNEY_REFRESH_IDENTITY_LOCK);
    expect(prompt).toContain("PARENT-CONFIRMED TARGET AGE: 5 years old");
    expect(prompt).toContain("never from the replaced child or surrounding people");
    expect(prompt).toContain("do not turn brown hair black");
    expect(prompt).toMatch(/in front/i);
  });
  const fixtureInput = () => ({ gameId: "journey-refresh-test", childName: "TEST", avatarUrl: "/api/assets/test-avatar",
    patchUrls: Object.fromEntries(board.hides.map(h => [h.id, `/api/assets/${h.id}`])),
    composedAt: "2026-09-19T12:00:00.000Z", fixture: true, boards: JOURNEY_REFRESH_PATCH_BOARDS,
    catalog: JOURNEY_REFRESH_CATALOG,
    world: { slug: "journey-refresh-pilot", name: "מסביב לעולם — אמזונס", mapArt: "/worlds/journey/map.webp" },
  });
  it("connects three personal finds, six unique discoveries and the completed passport memory", () => {
    const c = attachAdventureBook(threeBoardConfig(fixtureInput()), JOURNEY_REFRESH_CATALOG, [board.board]);
    expect(c.scenes).toHaveLength(1);
    expect(c.scenes[0]).toMatchObject({ appearancesPerBoard: 3, findsRequiredToAdvance: 3 });
    const book = c.adventure!, adventureBoard = book.boards[0]!;
    let p = emptyAdventureProgress(c.gameId, book);
    for (const targetId of adventureBoard.targetIds) {
      const event = { kind: "target-found" as const, boardSlug: board.board, targetId, variant: "A" as const };
      p = recordAdventureEvent(p, c.gameId, book, event).progress;
      expect(recordAdventureEvent(p, c.gameId, book, event).changed).toBe(false);
    }
    for (const discovery of adventureBoard.discoveries) {
      const event = { kind: "discovery-found" as const, boardSlug: board.board, discoveryId: discovery.id };
      p = recordAdventureEvent(p, c.gameId, book, event).progress;
      expect(recordAdventureEvent(p, c.gameId, book, event).changed).toBe(false);
    }
    p = readAdventureProgress(JSON.parse(JSON.stringify(p)), c.gameId, book);
    expect(adventureAlbum(p)).toMatchObject({ stars: { found: 3, total: 3 }, discoveries: { collected: 6, total: 6 }, postcards: { collected: 1 } });
    const passport = projectPassport(c, p, {}, (slug, _kind, id) => `/${slug}/${id}`);
    expect(passport).toHaveLength(1);
    expect(passport[0]!.pages).toHaveLength(1);
    expect(passport[0]!.pages[0]).toMatchObject({ state: "complete" });
    expect(passport[0]!.pages[0]!.photoUrl).toContain("hide-3");
  });
  it("cannot assemble real play from placement boxes before actual child geometry is reviewed", () => {
    expect(() => threeBoardConfig({ ...fixtureInput(), fixture: false })).toThrow("Actual child geometry");
    expect(() => threeBoardConfig({ ...fixtureInput(), world: undefined })).toThrow("Pilot world must match");
  });
});
