import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { LOCAL_PATCH_CROP, type LocalPatchBoard, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { renderLocalPatchHide, type LocalPatchRenderDeps } from "../local-patch-render";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import type { RetainedPurchase, RetainedPurchaseStore } from "../paid-operation";
import { WorldBudget, auditWorldBudget, type WorldChargeEvidence } from "../world-budget";

/**
 * One hide, end to end, against the REAL ledger.
 *
 * Everything above this has been proved against fakes, and a permissive fake is
 * exactly what hid a deterministic blocker for two commits: every judge receipt
 * went out without a cost basis, the real ledger refuses that, and the unit
 * tests stayed green because their ledger accepted anything.
 *
 * So this one uses `WorldBudget` over a real SQLite database. The providers are
 * synthetic and no network is touched; what is real is the accounting, the
 * reservation rules and the settlement contract.
 */

const BOARD = { width: 3072, height: 2048 };
const WORLD = "gam_integration:local-patch";

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

const renderEvidence = (id: string): WorldChargeEvidence => ({
  providerNamespace: "openai:find-me-existing", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { input_tokens: 10, output_tokens: 100 }, model: "gpt-image-2",
  amountMicroUsd: 48_800, costBasis: "provider-billed",
});

const goodAnswer = {
  childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass",
  verdict: "pass", reason: "She kneels on the sand at the right height.", faults: [],
};
const reply = (over: Partial<LocalPatchJudgeResult> = {}): LocalPatchJudgeResult => ({
  verdict: null, raw: JSON.stringify(goodAnswer), usage: { prompt_tokens: 900, completion_tokens: 120 },
  requestId: "req-judge", model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false, ...over,
});

let directory: string;
let db: PrismaClient;

beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(tmpdir(), "findme-local-patch-integration-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "world.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
}, 120_000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

/** Retained purchases, kept outside the ledger exactly as a real store would be. */
const retained = new Map<string, RetainedPurchase>();
const at = (worldId: string, key: string) => `${worldId} ${key}`;
beforeEach(async () => {
  retained.clear();
  await db.worldBudgetLedger.deleteMany({});
});
afterEach(async () => { await db.worldBudgetLedger.deleteMany({}); });

async function ledgerFor() {
  const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
  return budget;
}

/** A fresh set of adapters, as a new process would build them. */
function process(options: { answer?: LocalPatchJudgeResult; failStoreAt?: string } = {}) {
  const dispatched: string[] = [];
  const store: RetainedPurchaseStore = {
    put: async (w, k, value) => {
      if (options.failStoreAt === k) throw new Error("process died before the bytes were kept");
      retained.set(at(w, k), value);
    },
    get: async (w, k) => retained.get(at(w, k)) ?? null,
  };
  return { dispatched, store, answer: options.answer ?? reply() };
}

async function runHide(p: ReturnType<typeof process>) {
  const budget = await ledgerFor();
  const deps: LocalPatchRenderDeps = {
    ledger: budget, store: p.store, renderPolicySha256: "p".repeat(64),
    render: async ({ requestKey }) => { p.dispatched.push(requestKey); return { png: await patchPng(), evidence: renderEvidence("req-render") }; },
    judge: async () => { p.dispatched.push("judge"); return p.answer; },
  };
  return renderLocalPatchHide(deps, {
    worldId: WORLD, board, hide, composedPng: await boardPng(),
    identityPng: await small(), judgeIdentityPng: await small(),
    ageYears: 8, attempt: 1, apiKey: "test-only",
  });
}

const rows = async () => {
  const budget = await ledgerFor();
  return {
    render: await budget.readRequest(WORLD, "sydney-2:kneeling:render:1"),
    judge: await budget.readRequest(WORLD, "sydney-2:kneeling:judge:1"),
    audit: await budget.audit(WORLD),
  };
};

describe("one hide against the real ledger", () => {
  it("settles both purchases, and a restart buys neither again", async () => {
    const first = process();
    const result = await runHide(first);
    expect(result.accepted).toBe(true);
    expect(first.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);

    const after = await rows();
    expect(after.render?.state).toBe("settled");
    expect(after.judge?.state).toBe("settled");
    // The judge's amount is computed from a rate card, so it is recorded as an
    // estimate rather than presented as the provider's own invoice.
    expect((after.judge as { evidence: WorldChargeEvidence }).evidence.costBasis).toBe("conservative-upper-estimate");
    // Both charges are in ONE world's accounting. The scripts left the judgement
    // outside, so a ledger read 29.60c for a round that had cost 38.85c.
    expect(after.audit.settledMicroUsd).toBeGreaterThan(48_800);

    const second = process();
    const replayed = await runHide(second);
    expect(second.dispatched).toEqual([]);
    expect(replayed.accepted).toBe(true);
    expect(replayed.replayed).toBe(true);
    expect(replayed.judgedSha256).toBe(result.judgedSha256);
  }, 120_000);

  it("holds the world when the charge cannot be stated, and never dispatches twice", async () => {
    // Each of these is a charge that happened and cannot be described. Settling
    // a computed zero would read as free; the ledger holds instead.
    for (const [name, over] of [
      ["no usage", { usage: null }],
      ["a model with no rate", { model: "gpt-5.6-sol-experimental" }],
      ["no receipt", { requestId: null }],
      ["a reply that timed out", { wireFault: "timeout" as const, raw: null, usage: null, requestId: null }],
    ] as const) {
      await db.worldBudgetLedger.deleteMany({});
      retained.clear();

      const first = process({ answer: reply(over) });
      const result = await runHide(first);
      expect(result.refusedBecause, name).toBe("stopped");
      expect(result.costUnknown, name).toBe(true);

      const after = await rows();
      expect(after.judge?.state, name).toBe("unknown");
      // The world is held: nothing else may be authorised until a person looks.
      expect(after.audit.held, name).toBe(true);
      // And the answer is kept, because it was paid for.
      expect(retained.has(at(WORLD, "sydney-2:kneeling:judge:1")), name).toBe(true);

      const second = process({ answer: reply(over) });
      const again = await runHide(second);
      expect(second.dispatched, name).toEqual([]);
      expect(again.refusedBecause, name).toBe("stopped");
    }
  }, 180_000);

  it("keeps the render when the process dies before its bytes are kept, and refuses to buy it again", async () => {
    // Interrupted between paying and writing: the reservation is all that
    // remains, and from a later process a lost dispatch and a call still in
    // flight look identical. It dispatches nothing and says so.
    const crashed = process({ failStoreAt: "sydney-2:kneeling:render:1" });
    await expect(runHide(crashed)).rejects.toThrow(/before the bytes/);
    expect(crashed.dispatched).toEqual(["sydney-2:kneeling:render:1"]);

    const restarted = process();
    const result = await runHide(restarted);
    expect(restarted.dispatched).toEqual([]);
    expect(result.refusedBecause).toBe("stopped");
    expect(result.stoppedReason).toMatch(/still in flight, or a dispatch that was lost/);
    expect((await rows()).render?.state).toBe("pending");
  }, 120_000);

  it("changes the board only inside the rectangle it declared", async () => {
    const result = await runHide(process());
    const before = await boardPng();
    const a = await sharp(before).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(result.composedPng!).raw().toBuffer({ resolveWithObject: true });
    let outside = 0;
    for (let y = 0; y < a.info.height; y += 8) for (let x = 0; x < a.info.width; x += 8) {
      if (x >= hide.left && x < hide.left + LOCAL_PATCH_CROP.width && y >= hide.top && y < hide.top + LOCAL_PATCH_CROP.height) continue;
      const i = (y * a.info.width + x) * a.info.channels;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) outside++;
    }
    expect(outside).toBe(0);
  }, 120_000);

  it("keeps one world's spending out of another's", async () => {
    // The ledger is keyed on the world and the retained store used not to be,
    // so two worlds sharing a hide id shared a slot.
    await runHide(process());
    const budget = await ledgerFor();
    const other = await budget.audit("gam_someone_else:local-patch");
    expect(other.settledMicroUsd).toBe(0);
    expect(auditWorldBudget).toBeTypeOf("function");
  }, 120_000);
});
