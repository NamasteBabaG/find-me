import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LOCAL_PATCH_CROP, POSE_MASK, maskInCrop, type LocalPatchBoard, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_RESERVE, poseMask, renderLocalPatchHide, type LocalPatchRenderDeps } from "../local-patch-render";
import type { LocalPatchJudgeResult } from "../local-patch-judge";

const BOARD = { width: 3072, height: 2048 };
const board: LocalPatchBoard = {
  board: "sydney", art: "public/scenes/sydney/x.webp", ground: "beach sand", sittable: true,
  hides: [
    { id: "sydney-1", left: 960, top: 1256, pose: "standing" },
    { id: "sydney-2", left: 1600, top: 1256, pose: "kneeling" },
    { id: "sydney-3", left: 2176, top: 1128, pose: "sitting-cross-legged" },
  ],
};
const hide: LocalPatchHide = board.hides[1]!;

/** A board with visible structure, so a patch that lands is a change we can see. */
const boardPng = () => sharp({ create: { width: BOARD.width, height: BOARD.height, channels: 4, background: { r: 210, g: 190, b: 150, alpha: 255 } } }).png().toBuffer();
const patchPng = () => sharp({ create: { width: 768, height: 1152, channels: 4, background: { r: 40, g: 90, b: 160, alpha: 255 } } }).png().toBuffer();
const small = () => sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 160, b: 120, alpha: 255 } } }).png().toBuffer();

const passing: LocalPatchJudgeResult = {
  verdict: {
    childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
    scaleRight: "pass", groundContact: "pass", styleMatch: "pass",
    verdict: "pass", reason: "She kneels on the sand at the right height.", faults: [],
    downgraded: [], contradicted: [], unclassified: [], claimedVerdict: "pass", verdictOverridden: false,
  },
  raw: "{}", usage: { prompt_tokens: 900, completion_tokens: 120 }, requestId: "req-judge",
  model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false,
};

async function harness(over: Partial<LocalPatchRenderDeps> = {}, answer: LocalPatchJudgeResult = passing) {
  const spent: { kind: string; reserve: number; cents: number }[] = [];
  const retained: string[] = [];
  const order: string[] = [];
  const deps: LocalPatchRenderDeps = {
    render: async () => ({ png: await patchPng(), costCents: 4.88, costUnknown: false, providerRequestId: "req-render" }),
    spend: async (kind, reserve, run) => {
      order.push(`spend:${kind}`);
      const result = await run();
      spent.push({ kind, reserve, cents: result.costCents });
      return result;
    },
    retain: async name => { order.push(`retain:${name}`); retained.push(name); },
    judge: async () => answer,
    ...over,
  };
  const composedPng = await boardPng();
  const attempt = await renderLocalPatchHide(deps, {
    board, hide, composedPng, identityPng: await small(), judgeIdentityPng: await small(),
    ageYears: 8, attempt: 1, apiKey: "test-only",
  });
  return { attempt, spent, retained, order };
}

describe("one paid attempt at one hide", () => {
  it("cuts the mask the pose asks for, not a standing-height box", async () => {
    const mask = await poseMask(hide);
    const meta = await sharp(mask).metadata();
    expect(meta.width).toBe(LOCAL_PATCH_CROP.width);
    expect(meta.height).toBe(LOCAL_PATCH_CROP.height);
    // The hole is the transparent part: a kneeling child's box, on the ground line.
    const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i]! === 0) clear++;
    expect(clear).toBe(POSE_MASK.kneeling.width * POSE_MASK.kneeling.height);
    const box = maskInCrop("kneeling");
    expect(box.top + box.height).toBe(maskInCrop("standing").top + maskInCrop("standing").height);
  });

  it("puts the judgement through the same budget as the render", async () => {
    // The scripts bought the render inside a budget and the judgement outside
    // it, so a ledger read 29.60c for a round that had cost 38.85c. A judgement
    // is a purchase, and an unbudgeted purchase is a ceiling that does not hold.
    const { spent, attempt } = await harness();
    expect(spent.map(s => s.kind.split(":")[0])).toEqual(["render", "judge"]);
    expect(spent[0]!.reserve).toBe(LOCAL_PATCH_RESERVE.render);
    expect(spent[1]!.reserve).toBe(LOCAL_PATCH_RESERVE.judge);
    expect(spent[1]!.cents).toBeGreaterThan(0);
    expect(attempt.renderCents).toBe(4.88);
    expect(attempt.judgeCents).toBeGreaterThan(0);
  });

  it("keeps the bytes it paid for before anything judges them", async () => {
    // Four refused renders could not be looked at afterwards, so nobody could
    // check whether the judge had been right - the only calibration there is.
    const { retained, order } = await harness();
    expect(retained.some(n => n.endsWith("-render.png"))).toBe(true);
    expect(order.indexOf("retain:sydney-2:kneeling:1-render.png")).toBeLessThan(order.indexOf("spend:judge:sydney-2:kneeling:1"));
  });

  it("keeps the refused attempt's picture too, and says the judge refused it", async () => {
    const refused: LocalPatchJudgeResult = { ...passing, verdict: { ...passing.verdict!, pictureWhole: "fail", verdict: "fail" } };
    const { attempt, retained } = await harness({}, refused);
    expect(attempt.accepted).toBe(false);
    expect(attempt.refusedBecause).toBe("judge");
    expect(attempt.composedPng).toBeNull();
    // The patch survives even when the hide does not: it is what a person looks at.
    expect(attempt.patchPng).not.toBeNull();
    expect(retained).toHaveLength(2);
  });

  it("never accepts a picture on the strength of a reply it could not trust", async () => {
    // A verdict of pass beside a wire fault is not an approval: the reply came
    // from somewhere we did not ask, or arrived half-written.
    const untrusted: LocalPatchJudgeResult = { ...passing, wireFault: "wrong-model", verdict: passing.verdict };
    const { attempt } = await harness({}, untrusted);
    expect(attempt.accepted).toBe(false);
    expect(attempt.refusedBecause).toBe("wire");
  });

  it("carries an unknown charge outward instead of calling it zero", async () => {
    const noReceipt: LocalPatchJudgeResult = { ...passing, usage: null, costUnknown: true };
    const { attempt } = await harness({}, noReceipt);
    expect(attempt.costUnknown).toBe(true);

    const unknownRender = await harness({
      render: async () => ({ png: await patchPng(), costCents: 0, costUnknown: true, providerRequestId: null }),
    });
    expect(unknownRender.attempt.costUnknown).toBe(true);
  });

  it("changes the board only inside the rectangle it declared", async () => {
    // The painter redraws whatever it is given, so preservation is by
    // construction: only the crop comes back, and everything outside it is the
    // board's own untouched paint.
    const { attempt } = await harness();
    expect(attempt.accepted).toBe(true);
    const before = await boardPng();
    const after = attempt.composedPng!;
    const a = await sharp(before).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(after).raw().toBuffer({ resolveWithObject: true });
    const w = a.info.width, channels = a.info.channels;
    let outside = 0;
    for (let y = 0; y < a.info.height; y += 8) for (let x = 0; x < w; x += 8) {
      const inCrop = x >= hide.left && x < hide.left + LOCAL_PATCH_CROP.width
        && y >= hide.top && y < hide.top + LOCAL_PATCH_CROP.height;
      if (inCrop) continue;
      const i = (y * w + x) * channels;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) outside++;
    }
    expect(outside).toBe(0);
  });

  it("makes a retry a different purchase, not the same one bought twice", async () => {
    const keys: string[] = [];
    const deps: Partial<LocalPatchRenderDeps> = {
      render: async ({ requestKey }) => { keys.push(requestKey); return { png: await patchPng(), costCents: 4.88, costUnknown: false, providerRequestId: "r" }; },
    };
    await harness(deps);
    const composedPng = await boardPng();
    await renderLocalPatchHide({
      render: deps.render!, spend: async (_k, _r, run) => run(), retain: async () => {}, judge: async () => passing,
    }, { board, hide, composedPng, identityPng: await small(), judgeIdentityPng: await small(), ageYears: 8, attempt: 2, apiKey: "test-only" });
    expect(keys).toEqual(["sydney-2:kneeling:1", "sydney-2:kneeling:2"]);
  });
});
