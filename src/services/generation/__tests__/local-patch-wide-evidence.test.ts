import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareFullBoardBoundaryEvidence } from "../local-patch-integration-evidence";

describe("full-board native boundary evidence", () => {
  it("keeps the unchanged torso below a head erased at the shipping crop join visible to the reviewer", async () => {
    const crop = { left: 400, top: 400, width: 512, height: 768 };
    const torso = await sharp({ create: { width: 80, height: 250, channels: 3, background: "#0044cc" } }).png().toBuffer();
    const head = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#cc8800" } }).png().toBuffer();
    const base = await sharp({ create: { width: 1600, height: 1700, channels: 3, background: "white" } })
      .composite([{ input: torso, left: 600, top: 1168 }, { input: head, left: 600, top: 1088 }]).png().toBuffer();
    const erasedHead = await sharp({ create: { width: 80, height: 80, channels: 3, background: "white" } }).png().toBuffer();
    const after = await sharp(base).composite([{ input: erasedHead, left: 600, top: 1088 }]).png().toBuffer();
    const evidence = await prepareFullBoardBoundaryEvidence(base, after, crop, { left: 80, top: 80, width: 350, height: 688 });
    expect(evidence.context.top + evidence.context.height).toBe(1552);
    const bottom = evidence.boundaries.find(edge => edge.edge === "bottom")!;
    const meta = await sharp(bottom.png).metadata();
    expect(meta.height).toBe(768);
    const { data, info } = await sharp(bottom.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const panelWidth = (info.width - 16) / 2;
    const sample = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    const x = 620 - evidence.context.left;
    expect(sample(x, 330)).toEqual([204, 136, 0]);
    expect(sample(x + panelWidth + 16, 330)).toEqual([255, 255, 255]);
    expect(sample(x + panelWidth + 16, 584)).toEqual([0, 68, 204]);
  });

  it("clamps context at board edges and refuses mismatched before/after registration", async () => {
    const board = await sharp({ create: { width: 900, height: 1000, channels: 3, background: "white" } }).png().toBuffer();
    const e = await prepareFullBoardBoundaryEvidence(board, board, { left: 0, top: 0, width: 512, height: 768 }, { left: 0, top: 0, width: 512, height: 768 });
    expect(e.context).toEqual({ left: 0, top: 0, width: 896, height: 1000 });
    const wrong = await sharp(board).resize(800, 1000).png().toBuffer();
    await expect(prepareFullBoardBoundaryEvidence(board, wrong, { left: 0, top: 0, width: 512, height: 768 }, { left: 0, top: 0, width: 512, height: 768 })).rejects.toThrow("registered boards");
  });
});
