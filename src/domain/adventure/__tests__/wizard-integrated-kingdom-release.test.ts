import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import kingdom from "../../../../content/worlds/kingdom/world.json";
import presentations from "../../../../content/home/board-presentation.json";
import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "../../../../content/adventures/wizard-integrated-release";
import { REFRESHED_COLLECTION_BOARDS, REFRESHED_WIZARD_CATALOG } from "../../../../content/adventures/wizard-refresh-release";
import { TWO_WORLD_RELEASE_BOARDS, TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "../../../../content/adventures/two-worlds-release";
import { assertPlaceable, cropOf, maskOf } from "../../scene/local-patch-hides";
import { contains, overlaps } from "../content";

const routes = TWO_WORLD_RELEASE_ROUTES.filter(route => route.world === "kingdom");
const plans = INTEGRATED_WIZARD_CATALOG.boards.filter(plan => plan.worldSlug === "kingdom");
const boardFor = (route: string) => INTEGRATED_COLLECTION_BOARDS.find(board => board.board === route)!;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const approvedHashes: Record<string, string> = {
  castlegate: "822c8ae9a2d7fe325685feb97702349e29a74f56d73c6f45b8135aac8876b55a",
  fairyforest: "435e80bba3bcf03e12773f80c9202d6e2b2a6f026333ef7eaf03d0def086e741",
  dragoncave: "aedb4f928db9c89d85fa84b13c50f4b67388901c8abd78e626496d1c0bdbadcd",
  icepalace: "306022c253a4a48e378f16b1c5fa0b09c7814948656fd3c5eb34ed4e7a4ac755",
  underwater: "cdd49614fb9b44831b629acc75cd5e31d6c4e6f0ebf2672a01144c598766b9e5",
  cloudcity: "2ea78eb265a299e850479cc00c66b0f9f73ad620577ed3c2b3bf28321e15edef",
  sweetworkshop: "af85c124ca9dfab2ee2ca86d86a86a9b18cbc746468aba4f30084a6606b1710d",
  giantlibrary: "1d2b5586f7fcc59fd310904bd01c4f7ed06f10c9e47725fbfc8486a86068e415",
  nightcarnival: "90566075003b54df9b3d8de0b23a1ad9b3bd95e9a8f387ef6314b5a37ab37988",
};

describe("integrated kingdom release", () => {
  it("registers exactly the second world's nine routes, 27 hides and 54 discoveries", () => {
    const slugs = kingdom.nodes.map(node => node.boardSlug);
    expect(plans.map(plan => plan.boardSlug)).toEqual(slugs);
    expect(routes.map(route => route.route)).toEqual(slugs);
    expect(slugs.flatMap(slug => boardFor(slug).hides)).toHaveLength(27);
    expect(plans.flatMap(plan => plan.status === "ready" ? plan.discoveries : [])).toHaveLength(54);
    expect(INTEGRATED_COLLECTION_BOARDS).toHaveLength(18);
    expect(new Set(INTEGRATED_COLLECTION_BOARDS.map(board => board.board)).size).toBe(18);
    expect(INTEGRATED_WIZARD_CATALOG.boards.every(plan => ["journey", "kingdom"].includes(plan.worldSlug))).toBe(true);
    expect(INTEGRATED_WIZARD_CATALOG.releaseId).toBe("wizard-integrated-journey-v12");
  });

  it("keeps the historical journey contracts and the entire v11 catalog unchanged", () => {
    // Digests captured from the existing journey-only release before extension.
    expect(digest(INTEGRATED_COLLECTION_BOARDS.slice(0, 9))).toBe("14bcaa7d219ce66f93a188bbfc0edd59d2a29545d9d85c9bf9343b030a153aa7");
    expect(digest(INTEGRATED_WIZARD_CATALOG.boards.slice(0, 9))).toBe("0a89df099355eeb8fd1604c770cb4304f8041419b46190165167d9d186c04f97");
    expect(digest(REFRESHED_COLLECTION_BOARDS)).toBe("641d20c7970b5d80a4c6be3ee16f7bf90a9a4fd797bc66ebcc1de5e0edd385df");
    expect(digest(REFRESHED_WIZARD_CATALOG)).toBe("e03a15ea4664d675b369bd1a3dc9faaf2626688a937554c15d1ded9401fd7c88");
  });

  it("preserves every measured native crop, mask, pose, depth and target binding", () => {
    for (const route of routes) {
      const board = boardFor(route.route), source = TWO_WORLD_RELEASE_BOARDS.find(board => board.board === route.slug)!;
      expect(board.art).toBe(source.art);
      expect(board.sittable).toBe(source.sittable);
      expect(board.hides.map(hide => hide.id)).toEqual([1, 2, 3].map(n => `${route.route}-v12-${n}`));
      expect(board.hides.map(hide => hide.targetId)).toEqual(["hide-1", "hide-2", "hide-3"]);
      expect(() => assertPlaceable(board, { width: 3840, height: 2160 })).not.toThrow();
      board.hides.forEach((hide, index) => {
        const original = source.hides[index]!;
        expect(cropOf(hide)).toEqual(cropOf(original));
        expect(maskOf(hide)).toEqual(maskOf(original));
        expect(hide.pose).toBe(original.pose);
        expect(hide.hint).toEqual(original.hint);
        expect(hide.placement?.depth).toBe(original.placement?.depth);
        expect(hide.placement?.standingHeightPx).toBe(original.placement?.standingHeightPx);
        const mask = hide.mask!;
        expect(mask.left).toBeGreaterThanOrEqual(12);
        expect(mask.top).toBeGreaterThanOrEqual(12);
        expect(mask.left + mask.width).toBeLessThanOrEqual(500);
        expect(mask.top + mask.height).toBeLessThanOrEqual(756);
      });
    }
  });

  it("uses the actual child's identity and age with the v12 painted integration policy", () => {
    for (const route of routes) {
      const board = boardFor(route.route);
      expect(JSON.stringify(board)).not.toMatch(/\bBar\b|age[- ]five|five-year-old|preschool|brown (?:curls|hair)|\bcurls\b|curly hair|hair remain brown|hair black|does not wear glasses|canonical canonical/i);
      expect(board.wardrobe).toContain("canonical");
      for (const hide of board.hides) {
        expect(hide.placement?.comparators).toContain("parent-stated age");
        expect(hide.placement?.comparators).toContain("Match the original ink contours and economical matte painted shapes.");
        expect(hide.placement?.comparators).not.toContain("rich dimensional painted faces");
        expect(hide.placement?.lighting).not.toContain("FACE AND HAIR come ONLY");
      }
    }
    expect(boardFor("giantlibrary").hides[2]!.placement?.support).toContain("Use only eyewear present in the canonical child reference");
    // Source authoring remains historical; adapting a purchase never mutates it.
    expect(TWO_WORLD_RELEASE_BOARDS.find(board => board.board === "magic-giantlibrary")!.hides[2]!.placement?.support).toContain("Bar does not wear glasses");
  });

  it("binds the approved masters and all protected discovery/card geometry exactly", () => {
    for (const plan of plans) {
      if (plan.status !== "ready") throw Error("Unready kingdom board");
      const route = routes.find(route => route.route === plan.boardSlug)!;
      const source = TWO_WORLD_RELEASE_CATALOG.boards.find(source => source.boardSlug === route.slug)!;
      if (source.status !== "ready") throw Error("Unready source board");
      expect(plan.sceneVersion).toBe(12);
      expect(plan.plannedHides).toBe(3);
      expect(plan.collectionUi).toBe("guided-v1");
      expect(plan.art).toEqual(source.art);
      expect(plan.art.sha256).toBe(approvedHashes[plan.boardSlug]);
      expect(boardFor(plan.boardSlug).art).toBe(`public${plan.art.base}`);
      expect(plan.discoveries).toEqual(source.discoveries);
      expect(plan.postcard).toEqual(source.postcard);
      expect(plan.personalZones).toEqual(source.personalZones);
      expect(plan.personalZones).toEqual(boardFor(plan.boardSlug).hides.map(hide => {
        const crop = cropOf(hide);
        return { x: crop.left / 3840, y: crop.top / 2160, w: crop.width / 3840, h: crop.height / 2160 };
      }));
      for (const discovery of plan.discoveries) {
        expect(contains(discovery.visibleRect, discovery.hitRect)).toBe(true);
        expect(contains(discovery.cardCrop, discovery.visibleRect)).toBe(true);
        expect(plan.personalZones.some(zone => overlaps(zone, discovery.cardCrop))).toBe(false);
      }
    }
  });

  it("ships the pinned native master pixels and matching small prepared previews", async () => {
    for (const plan of plans) {
      if (plan.status !== "ready") throw Error("Unready kingdom board");
      const master = await readFile(`public${plan.art.base}`);
      expect(createHash("sha256").update(master).digest("hex")).toBe(approvedHashes[plan.boardSlug]);
      expect(await sharp(master).metadata()).toMatchObject({ width: 3840, height: 2160 });
      const presentation = presentations.find(item => item.route === plan.boardSlug)!;
      expect(presentation.base).toBe(plan.art.base);
      expect(presentation.sha256).toBe(plan.art.sha256);
      expect(presentation.discoveries.map(item => item.id)).toEqual(plan.discoveries.map(item => item.id));
      const preview = await readFile(`public${presentation.thumbnail}`);
      expect(createHash("sha256").update(preview).digest("hex")).toBe(presentation.thumbnailSha256);
      expect(await sharp(preview).metadata()).toMatchObject({ width: 960, height: 540 });
      expect(preview.byteLength).toBeLessThan(master.byteLength / 20);
    }
  });
});
