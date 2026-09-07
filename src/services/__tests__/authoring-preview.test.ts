import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { assertSameRun, chargeCents, parseDiffOptions, previewPath, slotOf, writePreview } from "../generation/authoring";
import type { PatchResult } from "../generation/patch";

/**
 * Two identities sampled on the same hiding spot used to point at one preview
 * file, and the second overwrote the first — the picture in the manifest was
 * not the picture that was judged. Every preview now goes where it is told.
 */

const dir = mkdtempSync(path.join(tmpdir(), "findme-preview-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** A tiny "patch": a coloured square with the geometry of a child near the slot. */
async function patchOf(colour: string, c: ReturnType<typeof slotOf>): Promise<PatchResult> {
  const size = 24;
  const webp = await sharp({ create: { width: size, height: size, channels: 4, background: colour } }).webp().toBuffer();
  const x = c.slot.x - size / 2 / c.art.width;
  const y = c.slot.y - size / 2 / c.art.height;
  const rect = { x, y, w: size / c.art.width, h: size / c.art.height };
  return {
    webp,
    width: size,
    height: size,
    geometry: { rect, hitRect: rect, anchor: { x: c.slot.x, y } },
    largest: size * size,
    painted: size * size,
    expected: size * size,
    basis: "diff",
    shape: { width: size, height: size, centerX: c.slot.x * c.art.width, centerY: c.slot.y * c.art.height, childPx: c.ctx.childPx, slotX: c.slot.x * c.art.width, slotY: c.slot.y * c.art.height },
  };
}

describe("previews", () => {
  it("land in the directory they are given, one per identity, and the first is not touched by the second", async () => {
    const c = slotOf("beach", "sandcastle", "A");
    const noa = await writePreview(c, await patchOf("#ff00e5", c), path.join(dir, "noa"));
    const before = sha(noa);
    const yuval = await writePreview(c, await patchOf("#00e5ff", c), path.join(dir, "yuval"));
    expect(noa).toBe(previewPath(c, path.join(dir, "noa")));
    expect(yuval).toBe(previewPath(c, path.join(dir, "yuval")));
    expect(noa).not.toBe(yuval);
    expect(existsSync(noa) && existsSync(yuval)).toBe(true);
    expect(sha(noa)).toBe(before);
    expect(sha(yuval)).not.toBe(before);
    // and both are the window, not the whole board
    const meta = await sharp(noa).metadata();
    expect(meta.width).toBe(c.ctx.rect.w);
    expect(meta.height).toBe(c.ctx.rect.h);
  }, 60_000);
});

describe("the extraction flags", () => {
  it("read the same for every command, and refuse a flag nobody honours", () => {
    const argv = ["node", "slot-patch.ts", "import", "beach", "sandcastle", "A", "x.png", "--threshold=24", "--keep=0.1", "--feather=2", "--inner=1.3", "--tone=false", "--out=work/x"];
    const options = parseDiffOptions(argv, ["out"]);
    expect(options).toEqual({ threshold: 24, keep: 0.1, feather: 2, inner: 1.3, tone: false });
    // the same argv through the other command's allow-list gives the same knobs
    expect(parseDiffOptions(argv, ["out", "pose"])).toEqual(options);
    expect(() => parseDiffOptions(["--feathr=2"])).toThrow(/unknown flag --feathr/);
    expect(() => parseDiffOptions(["--threshold=soft"])).toThrow(/needs a number/);
    expect(() => parseDiffOptions(["--tone=maybe"])).toThrow(/true or false/);
    expect(parseDiffOptions(["--out=x"], ["out"])).toEqual({});
    expect(parseDiffOptions(["--fillHoles=false"])).toEqual({fillHoles:false});
    expect(() => parseDiffOptions(["--fillHoles=maybe"])).toThrow(/true or false/);
  });
});

describe("resuming a sampling run", () => {
  it("is refused when the code or the configuration changed, and says which", () => {
    const run = { commit: "abc1234", configHash: "0123456789abcdef" };
    expect(() => assertSameRun(run, { ...run })).not.toThrow();
    expect(() => assertSameRun(run, { ...run, commit: "def5678" })).toThrow(/commit abc1234 → def5678/);
    expect(() => assertSameRun(run, { ...run, configHash: "fedcba9876543210" })).toThrow(/config 01234567 → fedcba98/);
  });
});

describe("what a call adds to the spend", () => {
  it("takes a reported cost as reported, and an unreported one as the whole reserve", () => {
    expect(chargeCents({ costCents: 2.421 }, 2.5)).toEqual({ cents: 2.421, unknown: false });
    // a successful answer without usage: unknown, charged as the reserve, never zero
    expect(chargeCents({ costCents: 0, costUnknown: true }, 2.5)).toEqual({ cents: 2.5, unknown: true });
    // and never less than what was actually reported
    expect(chargeCents({ costCents: 3.1, costUnknown: true }, 2.5)).toEqual({ cents: 3.1, unknown: true });
  });
});
