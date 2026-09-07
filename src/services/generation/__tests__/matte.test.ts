import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { childProblem, matteHint, matteToPatch, type SlotContext } from "../patch";
import { extractChild } from "../extract";

/**
 * Pass two hands back the model's own matte: the child opaque, the rest
 * transparent. These pin what the pipeline does with it — the model's edge is
 * kept as it is, and what is not the child (a speck, a bystander kept by
 * mistake) does not reach the tap contract.
 */
const W = 384;
const ART = { width: W, height: W };
const CHILD_PX = 100;
const SLOT = { x: 0.5, y: 0.5, scale: CHILD_PX / W };
const CTX: SlotContext = { rect: { x: 0, y: 0, w: W, h: W }, childPx: CHILD_PX, windowFactor: 4 };
/** The child: a 60x110 body centred on the slot, with a two-pixel soft rim. */
const BODY = { x0: 162, y0: 137, x1: 221, y1: 246 };

async function syntheticMatte(extras: Array<{ x0: number; y0: number; x1: number; y1: number; alpha: number }> = []): Promise<Buffer> {
  const rgba = Buffer.alloc(W * W * 4);
  const put = (x: number, y: number, a: number, r = 200, g = 120, b = 90) => { const i = (y * W + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a; };
  for (let y = BODY.y0 - 2; y <= BODY.y1 + 2; y++) for (let x = BODY.x0 - 2; x <= BODY.x1 + 2; x++) {
    const inside = x >= BODY.x0 && x <= BODY.x1 && y >= BODY.y0 && y <= BODY.y1;
    put(x, y, inside ? 255 : 100);
  }
  for (const e of extras) for (let y = e.y0; y <= e.y1; y++) for (let x = e.x0; x <= e.x1; x++) put(x, y, e.alpha, 20, 200, 20);
  return sharp(rgba, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
}

const flat = () => sharp({ create: { width: W, height: W, channels: 3, background: "#8899aa" } }).png().toBuffer();

describe("matteToPatch", () => {
  it("keeps the model's alpha as it is: the body opaque, the rim soft, and the tap box on the body", async () => {
    const patch = await matteToPatch({ originalCrop: await flat(), mattePng: await syntheticMatte(), ctx: CTX, art: ART, slot: SLOT });
    expect(childProblem(patch)).toBeNull();
    const alpha = await sharp(patch.webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => alpha.data[(y - patch.geometry.rect.y * W) * alpha.info.width + (x - patch.geometry.rect.x * W)]!;
    expect(at(190, 190)).toBe(255);
    // The rim is neither solidified to opaque nor cut away.
    const rim = at(BODY.x0 - 1, 190);
    expect(rim).toBeGreaterThan(60);
    expect(rim).toBeLessThan(140);
    // The tap box is the body (art fractions), within a pixel of the rim.
    expect(patch.geometry.hitRect.x * W).toBeGreaterThanOrEqual(BODY.x0 - 2);
    expect((patch.geometry.hitRect.x + patch.geometry.hitRect.w) * W).toBeLessThanOrEqual(BODY.x1 + 3);
    expect(patch.geometry.hitRect.y * W).toBeGreaterThanOrEqual(BODY.y0 - 2);
    expect((patch.geometry.hitRect.y + patch.geometry.hitRect.h) * W).toBeLessThanOrEqual(BODY.y1 + 3);
    // The bubble points at the head, over the body.
    expect(patch.geometry.anchor.x * W).toBeGreaterThan(BODY.x0);
    expect(patch.geometry.anchor.x * W).toBeLessThan(BODY.x1);
  });

  it("drops a speck and a bystander the model kept: they are not near the child", async () => {
    const matte = await syntheticMatte([
      { x0: 8, y0: 8, x1: 9, y1: 9, alpha: 220 },
      // A second figure of nearly the child's size, far from her.
      { x0: 330, y0: 20, x1: 369, y1: 99, alpha: 255 },
    ]);
    const patch = await matteToPatch({ originalCrop: await flat(), mattePng: matte, ctx: CTX, art: ART, slot: SLOT });
    expect(childProblem(patch)).toBeNull();
    expect((patch.geometry.hitRect.x + patch.geometry.hitRect.w) * W).toBeLessThanOrEqual(BODY.x1 + 3);
    expect(patch.geometry.hitRect.y * W).toBeGreaterThanOrEqual(BODY.y0 - 2);
  });

  it("an empty matte is an ordinary rejection, not an exception", async () => {
    const empty = await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const patch = await matteToPatch({ originalCrop: await flat(), mattePng: empty, ctx: CTX, art: ART, slot: SLOT });
    expect(patch.largest).toBe(0);
    expect(childProblem(patch)).toMatch(/painted nothing/);
  });
});

describe("extractChild", () => {
  const edited = async () => {
    // The render: the crop with a painted body where the child goes.
    const raw = Buffer.alloc(W * W * 3);
    for (let i = 0; i < W * W; i++) { raw[i * 3] = 0x88; raw[i * 3 + 1] = 0x99; raw[i * 3 + 2] = 0xaa; }
    for (let y = BODY.y0; y <= BODY.y1; y++) for (let x = BODY.x0; x <= BODY.x1; x++) { const i = (y * W + x) * 3; raw[i] = 200; raw[i + 1] = 120; raw[i + 2] = 90; }
    return sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
  };
  const base = async () => ({ originalCrop: await flat(), editedCrop: await edited(), ctx: CTX, art: ART, slot: SLOT, hint: "The child is standing.", label: "t/x/A" });

  it("asks the provider for the matte and uses it, with the hint", async () => {
    const calls: string[] = [];
    const provider = { matteSlotCrop: async (r: { hint: string; label: string }) => { calls.push(`${r.label}|${r.hint}`); return { png: await syntheticMatte(), costCents: 2.5, model: "gpt-image-2", providerRequestId: "req_m", durationMs: 1, attempts: 1 }; } };
    const out = await extractChild({ ...(await base()), provider });
    expect(out.method).toBe("matte");
    expect(out.version).toMatch(/^matte-/);
    expect(calls).toEqual(["t/x/A|The child is standing."]);
    expect(out.matte?.costCents).toBe(2.5);
    expect(out.diff.largest).toBeGreaterThan(0);
    expect(childProblem(out.patch)).toBeNull();
  });

  it("falls back to the difference for a provider without a matte", async () => {
    const out = await extractChild({ ...(await base()), provider: {} });
    expect(out.method).toBe("diff");
    expect(out.matte).toBeUndefined();
    expect(childProblem(out.patch)).toBeNull();
  });

  it("does not spend on pass two when the render changed nothing", async () => {
    let called = 0;
    const provider = { matteSlotCrop: async () => { called++; return { png: await syntheticMatte(), costCents: 2.5, model: "gpt-image-2", durationMs: 1, attempts: 1 }; } };
    const crop = await flat();
    const out = await extractChild({ ...(await base()), originalCrop: crop, editedCrop: crop, provider });
    expect(called).toBe(0);
    expect(out.method).toBe("diff");
    expect(childProblem(out.patch)).toMatch(/painted nothing/);
  });
});

describe("matteHint", () => {
  it("tells pass two which figure is the child from the placement recipe, and nothing without one", () => {
    expect(matteHint({})).toBe("");
    expect(matteHint({ placement: { pose: "peeking", support: "s", occlusion: "The barrel hides the child from the chest down.", instructions: "i" } })).toBe("The child is peeking. The barrel hides the child from the chest down.");
  });
});
