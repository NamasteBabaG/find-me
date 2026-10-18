import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { BackgroundReviewRefused, type BackgroundReviewState, type BackgroundReviewTransport } from "../../../infra/generation/types";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { askContinuityInBackground, advanceContinuityInBackground } from "../continuity-background";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { prepareVisualReview } from "../visual-review";
import { seedApprovedGame } from "./local-patch-fixtures";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, GENERATION_PROVIDER: "openai" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: [] }), flag: () => false, adminEmails: () => [] }));

let directory: string, db: PrismaClient, base: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-sol-background-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  base = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-background", analytics: { track: vi.fn() } } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden"); }));
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-sol-background-")) rmSync(directory, { recursive: true });
});

/** A fake provider whose create and polls answer exactly as scripted. */
function transport(create: () => Promise<{ responseId: string }>, polls: (() => Promise<BackgroundReviewState>)[] = []) {
  const calls = { create: 0, retrieve: 0, cancel: 0 };
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing",
    create: async () => { calls.create++; return create(); },
    retrieve: async () => { calls.retrieve++; const next = polls.shift(); if (!next) throw Error("no scripted poll"); return next(); },
    cancel: async () => { calls.cancel++; } };
  return { fake, calls };
}
async function setup(gameId: string, fake: BackgroundReviewTransport, prompt = "Synthetic continuity question") {
  await seedApprovedGame(base, db, { gameId, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING" });
  const c = { ...base, backgroundReview: fake } as Container;
  const question = prepareVisualReview({ role: "head-continuity", effort: "high", transport: "responses-background", images: [Buffer.from("synthetic-png")],
    labels: ["CASE newyork-v12-1:people"], prompt: `${prompt}\nImmutable candidate binding: {"hideId":"newyork-v12-1"}. Evidence attempt: 1.` });
  const worldId = boardWizardWorldId(gameId), requestKey = `self-repair:board:newyork:${question.fingerprint}`;
  const ask = { gameId, worldId, requestKey, question, reserveMicroUsd: 66_000, fence: async () => {},
    binding: { hideId: "newyork-v12-1", variantId: "tva-synthetic", imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64) } };
  const budget = boardWizardBudgetOf(c), store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  /** The dual review's own replay: it must never dispatch for a background key. */
  const replay = () => purchaseOnce({ ledger: budget, store }, { worldId, requestKey, scope: "judge", operationFingerprint: question.fingerprint,
    reserveMicroUsd: 66_000, buy: async () => { throw Error("a background question was bought synchronously"); } });
  return { c, ask, budget, store, worldId, requestKey, replay };
}
const completed = (raw: string | null, usage: Record<string, unknown> | null = { input_tokens: 2000, output_tokens: 500 }): BackgroundReviewState =>
  ({ status: "completed", reading: { responseId: "resp_synthetic", raw, usage, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: "default" } });

describe("Sol continuity in the background: one create, polled by id, every charge kept", () => {
  it("polls an existing response even when no review picker selects its hide; it never creates from a sweep", async () => {
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [
      async () => ({ status: "in_progress" }), async () => completed("{\"cases\":[]}")]);
    const { c, ask, budget, worldId, requestKey } = await setup("bg-sweep", fake);
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting" });
    expect(await advanceContinuityInBackground(c, ask.gameId)).toBe(1);
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: { providerRequestId: "resp_synthetic" } });
    expect(await advanceContinuityInBackground(c, ask.gameId)).toBe(0);
    expect(calls).toEqual({ create: 1, retrieve: 2, cancel: 0 });
  });
  it("keeps the round across failed polls and settles the genuine bill once the response is complete", async () => {
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [
      async () => { throw Error("read timed out"); }, async () => ({ status: "in_progress" }), async () => completed("{\"cases\":[]}")]);
    const { c, ask, budget, worldId, requestKey, replay } = await setup("bg-poll", fake);
    // Created, its id recorded, and its first read failed: a failed GET is not a failed review.
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", reason: expect.stringContaining("read again later") });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending", reserveMicroUsd: 66_000 });
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", reason: expect.stringContaining("in_progress") });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending" });
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(calls).toEqual({ create: 1, retrieve: 3, cancel: 0 });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: { providerRequestId: "resp_synthetic", amountMicroUsd: 10_000 } });
    const bought = await replay();
    expect(bought).toMatchObject({ kind: "bought", replayed: true });
    if (bought.kind === "bought") expect(JSON.parse(bought.bytes.toString())).toMatchObject({ raw: "{\"cases\":[]}", wireFault: null, costUnknown: false,
      requestId: "resp_synthetic", model: "gpt-6.1-sol", finishReason: "stop", policy: ask.question.policy, fingerprint: ask.question.fingerprint });
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(calls.create).toBe(1);
  });
  it("holds a lost create as a full unknown charge in the exact no-response shape, and never sends it again", async () => {
    const { fake, calls } = transport(async () => { throw Error("socket hang up"); });
    const { c, ask, budget, store, worldId, requestKey, replay } = await setup("bg-lost", fake);
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 66_000 });
    const kept = await store.get(worldId, requestKey);
    expect(kept).toMatchObject({ evidence: null, unknownReason: "Grouped review charge could not be verified" });
    expect(JSON.parse(kept!.bytes.toString())).toMatchObject({ raw: null, usage: null, requestId: null, model: null, finishReason: null,
      wireFault: "timeout", costUnknown: true, backgroundState: "lost" });
    expect(await replay()).toMatchObject({ kind: "unresolved" });
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(calls.create).toBe(1);
    expect((await budget.audit(worldId)).held).toBe(true);
  });
  it("holds a refusal (quota, credentials, policy) at zero and never asks again", async () => {
    const { fake, calls } = transport(async () => { throw new BackgroundReviewRefused(429, "insufficient_quota"); });
    const { c, ask, budget, worldId, requestKey, replay } = await setup("bg-refused", fake);
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "held" });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0, providerRequestId: expect.stringMatching(/^unsent\//) } });
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "held" });
    expect(calls.create).toBe(1);
    const bought = await replay();
    if (bought.kind === "bought") expect(JSON.parse(bought.bytes.toString())).toMatchObject({ wireFault: "http", raw: null });
  });
  it("records an expired response as unknown and held; an unpriced answer is never free", async () => {
    const missing = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "missing" })]);
    const lost = await setup("bg-missing", missing.fake);
    expect(await askContinuityInBackground(lost.c, lost.ask)).toEqual({ kind: "proceed" });
    expect(await lost.budget.readRequest(lost.worldId, lost.requestKey)).toMatchObject({ state: "unknown" });
    // A known response id is not the no-response shape: the interruption recovery will not continue it.
    expect(JSON.parse((await lost.store.get(lost.worldId, lost.requestKey))!.bytes.toString())).toMatchObject({ requestId: "resp_synthetic", backgroundState: "missing" });
    const unpriced = transport(async () => ({ responseId: "resp_synthetic" }), [async () => completed("{\"cases\":[]}", null)]);
    const free = await setup("bg-unpriced", unpriced.fake);
    expect(await askContinuityInBackground(free.c, free.ask)).toEqual({ kind: "proceed" });
    expect(await free.budget.readRequest(free.worldId, free.requestKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 66_000 });
    expect(await free.replay()).toMatchObject({ kind: "unresolved" });
  });
  it("lets only one of two racing workers create the response", async () => {
    const { fake, calls } = transport(async () => { await new Promise(resolve => setTimeout(resolve, 50)); return { responseId: "resp_synthetic" }; },
      [async () => ({ status: "in_progress" }), async () => ({ status: "in_progress" })]);
    const { c, ask, budget, worldId, requestKey } = await setup("bg-race", fake);
    const gates = await Promise.all([askContinuityInBackground(c, ask), askContinuityInBackground(c, ask)]);
    expect(gates.every(gate => gate.kind === "waiting")).toBe(true);
    expect(calls.create).toBe(1);
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending", reserveMicroUsd: 66_000 });
    expect(await db.auditLog.count({ where: { entityId: "bg-race", action: "generation:sol-background-review" } })).toBe(3);
  });
  it("refuses another question under a key that already has a round", async () => {
    const { fake } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "in_progress" })]);
    const { c, ask } = await setup("bg-intent", fake);
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting" });
    const other = prepareVisualReview({ role: "head-continuity", effort: "high", transport: "responses-background", images: [Buffer.from("other-png")],
      labels: ["CASE newyork-v12-1:people"], prompt: "A different question" });
    await expect(askContinuityInBackground(c, { ...ask, question: other })).rejects.toThrow(/differs from its round's intent/);
  });
});
