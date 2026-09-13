import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import found from "../../../../content/home/hero-found.json";
import { buildDemoConfig } from "@/services/demo";
import { targetGeometry } from "@/game/engine/target-geometry";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const demo = buildDemoConfig("en", "beach");
const scene = demo.scenes[0]!;
const geometry = targetGeometry(scene, scene.targets.find((target) => target.id === "sandcastle")!, "A");
const patch = geometry.sprite;
if (patch.kind !== "image" || !patch.rect) throw new Error("The hero's live-demo target must have an image patch");
const rect = { x: Math.round(patch.rect.x * scene.art.width), y: Math.round(patch.rect.y * scene.art.height), w: Math.round(patch.rect.w * scene.art.width), h: Math.round(patch.rect.h * scene.art.height) };

/** The hero's crops are built from the beach art and the demo patch; if either changes, `npx tsx scripts/refresh-hero-found.ts --apply`. */
describe("hero board crops", () => {
  it("are cut from the current beach art and the demo patch the live demo shows", () => {
    expect(found.scene).toBe(scene.slug);
    expect(found.target).toBe("sandcastle");
    expect(found.variant).toBe("A");
    expect(found.board).toBe(scene.art.base);
    expect(found.sceneVersion).toBe(scene.version);
    expect(found.patch).toBe(patch.url);
    expect(found.face).toBe(demo.child.avatarUrl);
    expect(sha(readFileSync(`public${found.board}`))).toBe(found.boardSha256);
    expect(sha(readFileSync(`public${found.patch}`))).toBe(found.patchSha256);
    expect(sha(readFileSync(`public${found.face}`))).toBe(found.faceSha256);
    expect(found.rect).toEqual(rect);
    expect(found.anchorNorm).toEqual(geometry.head);
    expect(found.centerNorm).toEqual(geometry.center);
    expect(found.layer).toBe(geometry.slot.layer);
    // The effective beach demo deliberately omits the historical parasols.
    expect(scene.art.foreground).toBeUndefined();
    expect(found.foreground).toBeNull();
    expect(found.foregroundSha256).toBeNull();
  });
  it("renders the shipped crops from the live demo's actual child and foreground, with the same head geometry", async () => {
    const livePatch = await sharp(readFileSync(`public${patch.url}`)).resize({ width: rect.w, height: rect.h, fit: "fill" }).png().toBuffer();
    const board = await sharp(readFileSync(`public${scene.art.base}`)).composite([{ input: livePatch, left: rect.x, top: rect.y }]).png().toBuffer();
    for (const crop of Object.values(found.crops)) {
      const expected = await sharp(board).extract(crop.sourceRect).resize({ width: crop.width }).webp({ quality: 66, effort: 6 }).toBuffer();
      expect(readFileSync(`public${crop.assetPath}`).equals(expected)).toBe(true);
      const box = crop.sourceRect;
      expect(crop.head.x).toBeCloseTo((geometry.head.x * scene.art.width - box.left) / box.width, 4);
      expect(crop.head.y).toBeCloseTo((geometry.head.y * scene.art.height - box.top) / box.height, 4);
      expect(crop.child.x).toBeCloseTo((geometry.center.x * scene.art.width - box.left) / box.width, 4);
      expect(crop.child.y).toBeCloseTo((geometry.center.y * scene.art.height - box.top) / box.height, 4);
    }
  });
  it("match the shipped files byte for byte, with a cache-busting URL and the child inside every crop", () => {
    for (const crop of Object.values(found.crops)) {
      const actual = readFileSync(`public${crop.assetPath}`);
      expect(sha(actual)).toBe(crop.assetSha256);
      expect(actual.length).toBe(crop.bytes);
      expect(crop.src).toBe(`${crop.assetPath}?v=${crop.assetSha256.slice(0, 16)}`);
      for (const p of [crop.head, crop.child]) {
        expect(p.x).toBeGreaterThan(0.2);
        expect(p.x).toBeLessThan(0.8);
        expect(p.y).toBeGreaterThan(0.2);
        expect(p.y).toBeLessThan(0.8);
      }
      // The head sits above the middle of the child.
      expect(crop.head.y).toBeLessThan(crop.child.y);
    }
    // Every crop keeps the board's full height; the tablet's is the whole board.
    for (const crop of Object.values(found.crops)) expect(crop.sourceRect.height).toBe(scene.art.height);
    expect(found.crops.wide.sourceRect.width).toBe(scene.art.width);
    expect(found.crops.phone.width / found.crops.phone.height).toBeCloseTo(288 / 616, 1);
    expect(found.crops.card.width / found.crops.card.height).toBeCloseTo(2 / 3, 1);
  });
});
