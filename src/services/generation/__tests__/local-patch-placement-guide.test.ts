import { expect, it } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { localPatchPlacementGuidePixels, localPatchPlacementGuideV2Pixels } from "../local-patch-placement-guide";
import { PLACEMENT_GUIDE_V2_VERSION, PLACEMENT_GUIDE_VERSION, placementGuideDirections, placementGuideEditableRect } from "../../../domain/generation/placement-guide";
import { LOCAL_PATCH_RETURN_FEATHER } from "../../../domain/scene/local-patch-return-region";
import { SEAM_LIMITS } from "../local-patch-seam";
import { poseMask } from "../local-patch-render";

const child = { left: 150, top: 180, width: 200, height: 400 }, returned = { left: 100, top: 100, width: 350, height: 550 };
const crop = { left: 400, top: 500, width: 512, height: 768 };
const block = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();

it("shows the original head above the input crop alongside a locally registered whole-body frame", async () => {
  const head = { left: 460, top: 250, width: 60, height: 70 };
  const sourcePng = await sharp({ create: { width: 1200, height: 1400, channels: 4, background: "#a0a0a0" } })
    .composite([{ input: await block(head.width, head.height, "#e80000"), left: head.left, top: head.top }]).png().toBuffer();
  const pixels = await localPatchPlacementGuidePixels({ sourcePng, crop, heads: [head], child, returned });
  const { data, info } = await sharp(pixels).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([1024, 768]);
  let redLocal = 0, redContext = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 3;
    if (data[i]! > 180 && data[i + 1]! < 30 && data[i + 2]! < 30) { if (x < 512) redLocal++; else redContext++; }
  }
  expect(redLocal).toBe(0); expect(redContext).toBeGreaterThan(100);
}, 30000);

it("keeps the persisted v1 two-panel directions byte for byte", () => {
  const text = placementGuideDirections(child, returned);
  expect(createHash("sha256").update(text).digest("hex")).toBe("0debedba7691e18f5a72327a26cc130025e68c36730106fe39891857436ee293");
  expect(placementGuideDirections(child, returned, PLACEMENT_GUIDE_VERSION)).toBe(text);
});

it("v2 guides one frame: the edited crop at its own scale, with no context beyond it", async () => {
  const outside = { left: 460, top: 250, width: 60, height: 70 }, inside = { left: 700, top: 560, width: 50, height: 60 };
  const sourcePng = await sharp({ create: { width: 1200, height: 1400, channels: 4, background: "#a0a0a0" } }).composite([
    { input: await block(outside.width, outside.height, "#e80000"), left: outside.left, top: outside.top },
    { input: await block(40, 40, "#20c040"), left: crop.left + 20, top: crop.top + 700 },
  ]).png().toBuffer();
  const pixels = await localPatchPlacementGuideV2Pixels({ sourcePng, crop, heads: [outside, inside], child, returned });
  const guide = await sharp(pixels).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = await sharp(sourcePng).extract(crop).removeAlpha().raw().toBuffer();
  expect([guide.info.width, guide.info.height]).toEqual([512, 768]);
  let red = 0, magenta = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 3, [r, g, b] = [guide.data[i]!, guide.data[i + 1]!, guide.data[i + 2]!];
    if (r > 180 && g < 30 && b < 30) red++;
    if (r > 200 && g < 100 && b > 140) magenta++;
  }
  // The head above the crop is not shown at all; the one inside is outlined at crop coordinates.
  expect(red).toBe(0); expect(magenta).toBeGreaterThan(300);
  const at = (data: Buffer, x: number, y: number) => [...data.subarray((y * 512 + x) * 3, (y * 512 + x) * 3 + 3)];
  expect(at(guide.data, inside.left - crop.left + 1, inside.top - crop.top + 20)[0]).toBeGreaterThan(200);
  // Unmarked pixels are the crop itself, same place, same scale (a wider frame would move the green block).
  for (const [x, y] of [[40, 720], [30, 710], [500, 10], [480, 760]]) expect(at(guide.data, x!, y!)).toEqual(at(source, x!, y!));
  expect(at(guide.data, 40, 720)).toEqual([0x20, 0xc0, 0x40]);
}, 30000);

it("v2 opens the return window minus exactly the band the seam check reads; v1 opened all of it", async () => {
  expect(SEAM_LIMITS.bandPx).toBe(LOCAL_PATCH_RETURN_FEATHER);
  const open = placementGuideEditableRect(child, returned);
  expect(open).toEqual({ left: 112, top: 112, width: 326, height: 526 });
  const editable = async (rect: typeof returned) => {
    const { data } = await sharp(await poseMask({ id: "synthetic", pose: "standing", mask: rect } as never)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let band = 0, bandOpen = 0, all = 0;
    for (let y = returned.top; y < returned.top + returned.height; y++) for (let x = returned.left; x < returned.left + returned.width; x++) {
      const isOpen = data[(y * 512 + x) * 4 + 3] === 0, edge = Math.min(x - returned.left, y - returned.top, returned.left + returned.width - 1 - x, returned.top + returned.height - 1 - y);
      if (edge < SEAM_LIMITS.bandPx) { band++; if (isOpen) bandOpen++; }
      if (isOpen) all++;
    }
    return { band, bandOpen, all };
  };
  const v2 = await editable(open), v1 = await editable(returned);
  expect(v2).toMatchObject({ bandOpen: 0, all: 326 * 526 });
  expect(v1.bandOpen).toBe(v1.band);
  expect(() => placementGuideEditableRect({ ...child, left: returned.left + 5 }, returned)).toThrow();
}, 30000);

it("v2 directions state one framing, the protected band and the opening; they never describe a second panel", () => {
  const text = placementGuideDirections(child, returned, PLACEMENT_GUIDE_V2_VERSION);
  expect(text).toContain(PLACEMENT_GUIDE_V2_VERSION);
  expect(text).toContain("SAME scale and framing");
  expect(text).toContain("never zoom out, widen, shift, mirror or recompose the scene");
  expect(text).toContain(JSON.stringify(placementGuideEditableRect(child, returned)));
  expect(text).toContain(`the ${LOCAL_PATCH_RETURN_FEATHER}-pixel band just inside orange and everything outside orange are protected original pixels`);
  expect(text).not.toMatch(/RIGHT|two panels|TWO panels|SOURCE CONTEXT/);
});
