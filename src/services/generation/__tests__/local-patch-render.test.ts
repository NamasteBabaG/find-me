import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LOCAL_PATCH_CROP, POSE_MASK, maskInCrop, type LocalPatchBoard, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_RESERVE, poseMask, renderLocalPatchHide, type LocalPatchRenderDeps } from "../local-patch-render";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import type { PurchaseLedger, RetainedPurchase, RetainedPurchaseStore } from "../paid-operation";
import { WorldBudgetError } from "../world-budget";
import type { WorldBudgetRequest, WorldChargeEvidence } from "../world-budget";

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

const boardPng = () => sharp({ create: { width: BOARD.width, height: BOARD.height, channels: 4, background: { r: 210, g: 190, b: 150, alpha: 255 } } }).png().toBuffer();
const patchPng = () => sharp({ create: { width: 768, height: 1152, channels: 4, background: { r: 40, g: 90, b: 160, alpha: 255 } } }).png().toBuffer();
const small = () => sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 160, b: 120, alpha: 255 } } }).png().toBuffer();

/** A complete receipt. No cast: a fixture missing a required field tests nothing. */
const evidence = (id: string, micro = 48_800): WorldChargeEvidence => ({
  providerNamespace: "openai:find-me-existing", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { total: 1 }, model: "gpt-image-2", amountMicroUsd: micro, costBasis: "provider-billed",
});

const answer = (over: Record<string, unknown> = {}) => ({
  childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass",
  verdict: "pass", reason: "She kneels on the sand at the right height.", faults: [], ...over,
});

const reply = (body: Record<string, unknown> = answer()): LocalPatchJudgeResult => ({
  verdict: null, raw: JSON.stringify(body), usage: { prompt_tokens: 900, completion_tokens: 120 },
  requestId: "req-judge", model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false,
});

/** Durable state across "processes": the maps are the disk. */
function world() {
  const rows = new Map<string, WorldBudgetRequest>();
  const retained = new Map<string, RetainedPurchase>();
  const at = (w: string, k: string) => `${w} ${k}`;

  const process = (over: Partial<LocalPatchRenderDeps> = {}, judged: LocalPatchJudgeResult = reply()) => {
    const dispatched: string[] = [];
    const ledger: PurchaseLedger = {
      readRequest: async (w, k) => rows.get(at(w, k)) ?? null,
      reserve: async (w, i) => {
        if (rows.has(at(w, i.requestKey))) return { acquired: false };
        rows.set(at(w, i.requestKey), { ...i, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [] } as unknown as WorldBudgetRequest);
        return { acquired: true };
      },
      settle: async (w, k, ev) => {
        // Refuses what the real ledger refuses. A permissive fake is why every
        // judge receipt went out without a cost basis and the tests stayed green
        // while the real ledger would have stopped the hide dead.
        if (ev.costBasis !== "provider-billed" && ev.costBasis !== "conservative-upper-estimate") {
          throw new WorldBudgetError("invalid_input", "An explicit cost basis is required");
        }
        rows.set(at(w, k), { ...rows.get(at(w, k))!, state: "settled", evidence: ev } as WorldBudgetRequest);
      },
      markUnknown: async (w, k, reason) => {
        const existing = rows.get(at(w, k));
        if (existing) rows.set(at(w, k), { ...existing, state: "unknown", unknownReasons: [reason] } as WorldBudgetRequest);
      },
    };
    const store: RetainedPurchaseStore = {
      put: async (w, k, v) => { retained.set(at(w, k), v); },
      get: async (w, k) => retained.get(at(w, k)) ?? null,
    };
    const deps: LocalPatchRenderDeps = {
      ledger, store, renderPolicySha256: "p".repeat(64),
      render: async ({ requestKey }) => { dispatched.push(requestKey); return { png: await patchPng(), evidence: evidence("req-render") }; },
      judge: async () => { dispatched.push("judge"); return judged; },
      ...over,
    };
    return { deps, dispatched };
  };
  return { process, rows, retained, at };
}

async function attempt(deps: LocalPatchRenderDeps, over: Record<string, unknown> = {}) {
  return renderLocalPatchHide(deps, {
    worldId: "game-1:local-patch", board, hide, composedPng: await boardPng(),
    identityPng: await small(), judgeIdentityPng: await small(),
    ageYears: 8, attempt: 1, apiKey: "test-only", ...over,
  });
}

describe("one paid attempt at one hide", () => {
  it("cuts the mask the pose asks for, in the place the pose asks for", async () => {
    // The right number of clear pixels in the wrong place is a mask pointing the
    // painter somewhere else entirely, so every pixel is checked against the box.
    for (const pose of Object.keys(POSE_MASK) as (keyof typeof POSE_MASK)[]) {
      const mask = await poseMask({ ...hide, pose });
      const box = maskInCrop(pose);
      const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let misplaced = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const clear = data[(y * info.width + x) * info.channels + 3]! === 0;
        const inside = x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
        if (inside !== clear) misplaced++;
      }
      expect(misplaced, pose).toBe(0);
      expect(box.top + box.height).toBe(maskInCrop("standing").top + maskInCrop("standing").height);
    }
  }, 30_000);

  it("hands the painter that exact mask, not one built somewhere else", async () => {
    const w = world();
    let sent: Buffer | null = null;
    const p = w.process({ render: async ({ maskPng }) => { sent = maskPng; return { png: await patchPng(), evidence: evidence("r") }; } });
    await attempt(p.deps);
    expect(Buffer.compare(sent!, await poseMask(hide))).toBe(0);
  });

  it("buys the render and the judgement through the same ledger", async () => {
    // The scripts budgeted the render and left the judgement outside, so a
    // ledger read 29.60c for a round that had cost 38.85c. Both are purchases.
    const w = world();
    const result = await attempt(w.process().deps);
    expect(result.accepted).toBe(true);
    const keys = [...w.rows.keys()].map(k => k.split(" ")[1]);
    expect(keys).toEqual(["sydney-2:kneeling:render:1", "sydney-2:kneeling:judge:1"]);
    expect([...w.rows.values()].every(r => r.state === "settled")).toBe(true);
    expect(w.rows.get(w.at("game-1:local-patch", "sydney-2:kneeling:judge:1")))
      .toMatchObject({ scope: "judge", reserveMicroUsd: LOCAL_PATCH_RESERVE.judgeMicroUsd });
    expect(result.renderCents).toBeCloseTo(4.88);
    expect(result.judgeCents).toBeGreaterThan(0);
  });

  it("keeps the bytes of both purchases, refusals included", async () => {
    const w = world();
    const refused = reply(answer({ pictureWhole: "fail", verdict: "fail", faults: [{ check: "pictureWhole", where: "a hard edge down the sand" }] }));
    const result = await attempt(w.process({}, refused).deps);
    expect(result).toMatchObject({ accepted: false, refusedBecause: "judge" });
    expect(result.composedPng).toBeNull();
    expect([...w.retained.keys()].map(k => k.split(" ")[1]))
      .toEqual(["sydney-2:kneeling:render:1", "sydney-2:kneeling:judge:1"]);
  });

  it("re-derives a replayed judgement instead of trusting a stored verdict", async () => {
    // The rules have been corrected more than once. Re-deriving is how those
    // corrections reach answers that were already paid for, without paying again.
    const w = world();
    const first = await attempt(w.process().deps);
    expect(first.accepted).toBe(true);

    const second = w.process();
    const replayed = await attempt(second.deps);
    expect(second.dispatched).toEqual([]);
    expect(replayed.replayed).toBe(true);
    expect(replayed.accepted).toBe(true);
    expect(replayed.judgedSha256).toBe(first.judgedSha256);
  });

  it("stops rather than guessing when a purchase cannot go ahead", async () => {
    // A reservation under this key that belongs to different inputs is not a
    // statement about the picture, and must not be answered with one.
    const w = world();
    w.rows.set(w.at("game-1:local-patch", "sydney-2:kneeling:render:1"), {
      requestKey: "sydney-2:kneeling:render:1", scope: "image", operationFingerprint: "z".repeat(64),
      reserveMicroUsd: 1, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [],
    } as unknown as WorldBudgetRequest);
    const p = w.process();
    const result = await attempt(p.deps);
    expect(p.dispatched).toEqual([]);
    expect(result).toMatchObject({ accepted: false, refusedBecause: "stopped" });
    expect(result.stoppedReason).toMatch(/different operation/);
  });

  it("settles the judgement with a bill the real ledger will accept", async () => {
    // Every judge receipt used to go out with no cost basis, hidden behind an
    // `as unknown as` cast. The real ledger refuses that, so the hide stopped
    // dead after both providers had already answered - and the tests missed it
    // because their fake ledger accepted anything.
    const w = world();
    const result = await attempt(w.process().deps);
    expect(result.accepted).toBe(true);
    const judgeRow = w.rows.get(w.at("game-1:local-patch", "sydney-2:kneeling:judge:1")) as Extract<WorldBudgetRequest, { state: "settled" }>;
    expect(judgeRow.state).toBe("settled");
    // Computed from a rate card, so it is recorded as an estimate rather than
    // presented as the provider's own invoice.
    expect(judgeRow.evidence.costBasis).toBe("conservative-upper-estimate");
    expect(judgeRow.evidence.providerRequestId).toBe("req-judge");
  });

  it("keeps a judgement whose charge cannot be stated, and does not call it free", async () => {
    // No usage, an unpriced model, or no receipt: the answer was paid for and
    // the amount is unknown. Settling a computed zero would read as free.
    for (const [name, over] of [
      ["no usage", { usage: null }],
      ["a model with no rate", { model: "gpt-5.6-sol-experimental" }],
      ["no receipt", { requestId: null }],
    ] as const) {
      const w = world();
      const result = await attempt(w.process({}, { ...reply(), ...over }).deps);
      expect(result.refusedBecause, name).toBe("stopped");
      expect(result.costUnknown, name).toBe(true);
      const row = w.rows.get(w.at("game-1:local-patch", "sydney-2:kneeling:judge:1"));
      expect(row?.state, name).toBe("unknown");
      // The reply is kept: it was paid for, and somebody has to be able to look.
      expect(w.retained.has(w.at("game-1:local-patch", "sydney-2:kneeling:judge:1")), name).toBe(true);
      // And a restart does not buy it again.
      const again = w.process();
      const second = await attempt(again.deps);
      expect(again.dispatched, name).toEqual([]);
      expect(second.refusedBecause, name).toBe("stopped");
    }
  }, 30_000);

  it("will not replay an answer bought under different instructions", async () => {
    // Changing what the judge is ASKED is not the same as correcting how its
    // answer is read. The second stays free; the first is a new purchase.
    const w = world();
    await attempt(w.process().deps);
    const before = w.rows.get(w.at("game-1:local-patch", "sydney-2:kneeling:judge:1"))!.operationFingerprint;

    const other = await attempt(w.process().deps, { ageYears: 4 });
    expect(other.refusedBecause).toBe("stopped");
    expect(other.stoppedReason).toMatch(/different operation/);
    expect(before).toBeTruthy();
  });

  it("makes different image settings a different purchase", async () => {
    const w = world();
    await attempt(w.process().deps);
    const other = w.process({ renderPolicySha256: "q".repeat(64) });
    const result = await attempt(other.deps);
    expect(other.dispatched).toEqual([]);
    expect(result.stoppedReason).toMatch(/different operation/);
  });

  it("never accepts a picture on the strength of a reply it could not trust", async () => {
    const w = world();
    const result = await attempt(w.process({}, { ...reply(), wireFault: "wrong-model" }).deps);
    expect(result).toMatchObject({ accepted: false, refusedBecause: "wire", wireFault: "wrong-model" });
  });

  it("says the judge charge is unknown when there are no tokens to price it with", async () => {
    const w = world();
    const result = await attempt(w.process({}, { ...reply(), usage: null }).deps);
    expect(result.costUnknown).toBe(true);
    expect(result.judgeCents).toBe(0);
  });

  it("binds the verdict to the crop that would ship", async () => {
    const w = world();
    const result = await attempt(w.process().deps);
    const shipped = await sharp(result.composedPng!, { limitInputPixels: 8_294_400 })
      .extract({ left: hide.left, top: hide.top, ...LOCAL_PATCH_CROP }).png().toBuffer();
    expect(createHash("sha256").update(shipped).digest("hex")).toBe(result.judgedSha256);
  });

  it("changes the board only inside the rectangle it declared", async () => {
    const w = world();
    const result = await attempt(w.process().deps);
    const before = await boardPng(), after = result.composedPng!;
    const a = await sharp(before).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(after).raw().toBuffer({ resolveWithObject: true });
    let outside = 0;
    for (let y = 0; y < a.info.height; y += 8) for (let x = 0; x < a.info.width; x += 8) {
      if (x >= hide.left && x < hide.left + LOCAL_PATCH_CROP.width && y >= hide.top && y < hide.top + LOCAL_PATCH_CROP.height) continue;
      const i = (y * a.info.width + x) * a.info.channels;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) outside++;
    }
    expect(outside).toBe(0);
  });

  it("makes a retry a different purchase, not the same one bought twice", async () => {
    const w = world();
    await attempt(w.process().deps);
    const retry = w.process();
    await attempt(retry.deps, { attempt: 2 });
    expect(retry.dispatched).toEqual(["sydney-2:kneeling:render:2", "judge"]);
    expect([...w.rows.keys()].map(k => k.split(" ")[1])).toContain("sydney-2:kneeling:render:2");
  });
});
