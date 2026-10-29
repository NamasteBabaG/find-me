import { expect, it } from "vitest";
import sharp from "sharp";
import { localPatchPlacementGuidePixels } from "../local-patch-placement-guide";

it("shows the original head above the input crop alongside a locally registered whole-body frame", async () => {
  const head = { left: 460, top: 250, width: 60, height: 70 }, crop = { left: 400, top: 500, width: 512, height: 768 };
  const red = await sharp({ create: { width: head.width, height: head.height, channels: 4, background: "#e80000" } }).png().toBuffer();
  const sourcePng = await sharp({ create: { width: 1200, height: 1400, channels: 4, background: "#a0a0a0" } })
    .composite([{ input: red, left: head.left, top: head.top }]).png().toBuffer();
  const pixels = await localPatchPlacementGuidePixels({ sourcePng, crop, heads: [head],
    child: { left: 150, top: 180, width: 200, height: 400 }, returned: { left: 100, top: 100, width: 350, height: 550 } });
  const { data, info } = await sharp(pixels).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([1024, 768]);
  let redLocal = 0, redContext = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 3;
    if (data[i]! > 180 && data[i + 1]! < 30 && data[i + 2]! < 30) { if (x < 512) redLocal++; else redContext++; }
  }
  expect(redLocal).toBe(0); expect(redContext).toBeGreaterThan(100);
}, 30000);
