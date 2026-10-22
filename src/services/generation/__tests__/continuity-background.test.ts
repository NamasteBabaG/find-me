import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { BackgroundReviewRefused, type BackgroundReviewState, type BackgroundReviewTransport } from "../../../infra/generation/types";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { askContinuityInBackground, advanceContinuityInBackground, backgroundReviewWaiting, permanentFailureOnImage, reconcileRefusedBackgroundRound } from "../continuity-background";
import { WITHHELD_PROVIDER_ERROR_CODE } from "../../../domain/generation/background-provider-error";
import { WorldBudget } from "../world-budget";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce, retainedPayloadDigest } from "../paid-operation";
import { prepareVisualReview } from "../visual-review";
import { providerFailureRefusal } from "../local-patch-review-interruption-recovery";
import { LOCAL_PATCH_LEAN_ACTION, leanReleaseAuditId, leanReleaseReceipt } from "../lean-release";
import { LEAN_REVIEW_RECOVERY_ACTION, leanNewWorldRecoveryReceipt, leanReviewRecoveryAuditId } from "../../../domain/generation/lean-review-recovery";
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
async function setup(gameId: string, fake: BackgroundReviewTransport, prompt = "Synthetic continuity question", tier?: "flex" | "default") {
  await seedApprovedGame(base, db, { gameId, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING" });
  const c = { ...base, backgroundReview: fake } as Container;
  const question = prepareVisualReview({ role: "head-continuity", effort: "high", transport: "responses-background", ...(tier ? { tier } : {}), images: [Buffer.from("synthetic-png")],
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
  it.each(["billed", "unpriced", "missing", "lost"] as const)(
    "finishes a terminal %s receipt after its accounting write was interrupted, without polling or changing evidence", async mode => {
      const terminal: BackgroundReviewState = mode === "missing" ? { status: "missing" } : mode === "unpriced"
        ? { status: "failed", reading: { responseId: "resp_synthetic", raw: null, usage: null, model: "gpt-6.1-sol",
          finishReason: null, serviceTier: "default", providerError: { code: "server_is_overloaded", message: "Synthetic capacity failure" } } }
        : completed("{\"cases\":[]}");
      const { fake, calls } = transport(async () => {
        if (mode === "lost") throw Error("synthetic lost create");
        return { responseId: "resp_synthetic" };
      }, [async () => ({ status: "in_progress" }), async () => terminal]);
      const { c, ask, budget, store, worldId, requestKey } = await setup(`bg-terminal-crash-${mode}`, fake);
      if (mode !== "lost") expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting" });
      const stop = mode === "billed" ? vi.spyOn(WorldBudget.prototype, "settle").mockRejectedValueOnce(Error("accounting stopped"))
        : vi.spyOn(WorldBudget.prototype, "markUnknown").mockRejectedValueOnce(Error("accounting stopped"));
      try {
        await expect(mode === "lost" ? askContinuityInBackground(c, ask) : advanceContinuityInBackground(c, ask.gameId)).rejects.toThrow("accounting stopped");
      } finally { stop.mockRestore(); }
      expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending", reserveMicroUsd: 66_000 });
      const kept = (await store.get(worldId, requestKey))!;
      const events = await db.auditLog.findMany({ where: { entityId: ask.gameId, action: "generation:sol-background-review" }, orderBy: { id: "asc" } });
      // A sweep can finish local accounting even when its transport has been disabled.
      const offline = { ...c, backgroundReview: undefined };
      expect(await advanceContinuityInBackground(offline, ask.gameId)).toBe(1);
      const request = await budget.readRequest(worldId, requestKey);
      expect(request).toMatchObject(mode === "billed" ? { state: "settled", evidence: kept.evidence }
        : { state: "unknown", reserveMicroUsd: 66_000, unknownReasons: [mode === "lost"
          ? `${requestKey}: the background create's answer was lost; the charge is unknown and kept in full`
          : mode === "missing" ? `${requestKey}: background response resp_synthetic is no longer available; the charge is unknown and kept in full`
            : `${requestKey}: background response resp_synthetic ended failed (server_is_overloaded) without a charge that can be stated`] });
      const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
      expect(await askContinuityInBackground(offline, ask)).toEqual({ kind: "proceed" });
      expect(await advanceContinuityInBackground(offline, ask.gameId)).toBe(0);
      expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
      expect(await store.get(worldId, requestKey)).toEqual(kept);
      expect(await db.auditLog.findMany({ where: { entityId: ask.gameId, action: "generation:sol-background-review" }, orderBy: { id: "asc" } })).toEqual(events);
      expect(calls).toEqual({ create: 1, retrieve: mode === "lost" ? 0 : 2, cancel: 0 });
    });
  it("also completes an interrupted terminal settlement when its exact question is asked again", async () => {
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [
      async () => ({ status: "in_progress" }), async () => completed("{\"cases\":[]}")]);
    const { c, ask, budget, worldId, requestKey } = await setup("bg-terminal-asked-again", fake);
    await askContinuityInBackground(c, ask);
    const stop = vi.spyOn(WorldBudget.prototype, "settle").mockRejectedValueOnce(Error("accounting stopped"));
    try { await expect(advanceContinuityInBackground(c, ask.gameId)).rejects.toThrow("accounting stopped"); }
    finally { stop.mockRestore(); }
    expect(await askContinuityInBackground({ ...c, backgroundReview: undefined }, ask)).toEqual({ kind: "proceed" });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled" });
    expect(calls).toEqual({ create: 1, retrieve: 2, cancel: 0 });
  });
  it.each(["operation", "policy", "response"] as const)("refuses terminal replay from a digest-valid receipt with a different %s", async changed => {
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [
      async () => ({ status: "in_progress" }), async () => completed("{\"cases\":[]}")]);
    const { c, ask, worldId, requestKey } = await setup(`bg-terminal-mismatch-${changed}`, fake);
    await askContinuityInBackground(c, ask);
    const stop = vi.spyOn(WorldBudget.prototype, "settle").mockRejectedValueOnce(Error("accounting stopped"));
    try { await expect(advanceContinuityInBackground(c, ask.gameId)).rejects.toThrow("accounting stopped"); }
    finally { stop.mockRestore(); }
    // Keep a structurally valid retained envelope and its digest: replay must still prove its operation/response.
    const key = retainedPurchaseKey(worldId, requestKey), row = await db.fileBlob.findUniqueOrThrow({ where: { key } });
    const envelope = JSON.parse(Buffer.from(row.data).toString()), wire = JSON.parse(Buffer.from(envelope.bytesBase64, "base64").toString());
    if (changed === "operation") envelope.operationFingerprint = "e".repeat(64);
    else {
      if (changed === "policy") wire.policy = { ...wire.policy, model: "a-different-model" };
      else wire.responseId = "resp_someone_else";
      const bytes = Buffer.from(JSON.stringify(wire));
      envelope.bytesBase64 = bytes.toString("base64"); envelope.payloadSha256 = retainedPayloadDigest(bytes);
    }
    await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(envelope))) } });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    await expect(advanceContinuityInBackground({ ...c, backgroundReview: undefined }, ask.gameId)).rejects.toThrow(/matching retained receipt|differs from its question|differs from its terminal record/);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(calls).toEqual({ create: 1, retrieve: 2, cancel: 0 });
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
  it("names only a response the provider has just said still runs (local-patch-slice-pacing/v1)", async () => {
    const key = `tva-synthetic:${"a".repeat(64)}`;
    let release!: () => void;
    const created = new Promise<void>(resolve => { release = resolve; });
    const { fake } = transport(async () => { await created; return { responseId: "resp_synthetic" }; },
      [async () => ({ status: "in_progress" }), async () => { throw Error("read timed out"); }, async () => ({ status: "in_progress" }),
        async () => completed("{\"cases\":[]}")]);
    const { c, ask } = await setup("bg-running", fake);
    const pass = async (deadlineAt?: number) => { const running = new Set<string>();
      await advanceContinuityInBackground(c, ask.gameId, { ...(deadlineAt === undefined ? {} : { deadlineAt }), running }); return running; };
    expect(await pass()).toEqual(new Set());
    // Claimed, its create still answering: the review that claimed it records the answer; nothing is named.
    const asked = askContinuityInBackground(c, ask);
    while (!await db.auditLog.count({ where: { entityId: ask.gameId, id: { endsWith: "_claim" } } })) await new Promise(resolve => setTimeout(resolve, 5));
    expect(await pass()).toEqual(new Set());
    release();
    expect(await asked).toMatchObject({ kind: "waiting" });
    // Created and running, but a pass with no room to read it names nothing, nor does a read that fails.
    expect(await pass(Date.now() + 1_000)).toEqual(new Set());
    expect(await pass()).toEqual(new Set());
    // A read that says it runs names it, by its appearance's current pixels.
    expect(await pass()).toEqual(new Set([key]));
    // Complete: its review decides it now.
    expect(await pass()).toEqual(new Set());
    // A lost create has finished as well.
    const lost = await setup("bg-running-lost", transport(async () => { throw Error("socket hang up"); }).fake);
    expect(await askContinuityInBackground(lost.c, lost.ask)).toEqual({ kind: "proceed" });
    const none = new Set<string>();
    await advanceContinuityInBackground(lost.c, lost.ask.gameId, { running: none });
    expect(none).toEqual(new Set());
  });

  it("names every appearance whose question has not ended, from the record alone, so its board asks its siblings first", async () => {
    const key = `tva-synthetic:${"a".repeat(64)}`;
    const { fake } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "in_progress" }), async () => completed("{\"cases\":[]}")]);
    const { c, ask } = await setup("bg-waiting", fake);
    expect(await backgroundReviewWaiting(db, ask.gameId)).toEqual(new Set());
    // Created and not yet answered: named, by its appearance's current pixels, whether or not a pass has read it.
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting" });
    expect(await backgroundReviewWaiting(db, ask.gameId)).toEqual(new Set([key]));
    // Answered: its review decides it now.
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(await backgroundReviewWaiting(db, ask.gameId)).toEqual(new Set());
    // A lost create and a refusal have ended too.
    const lost = await setup("bg-waiting-lost", transport(async () => { throw Error("socket hang up"); }).fake);
    expect(await askContinuityInBackground(lost.c, lost.ask)).toEqual({ kind: "proceed" });
    expect(await backgroundReviewWaiting(db, lost.ask.gameId)).toEqual(new Set());
    const refused = await setup("bg-waiting-refused", transport(async () => { throw new BackgroundReviewRefused(429, "insufficient_quota"); }).fake);
    expect(await askContinuityInBackground(refused.c, refused.ask)).toMatchObject({ kind: "held" });
    expect(await backgroundReviewWaiting(db, refused.ask.gameId)).toEqual(new Set());
    // A record that cannot be read is refused, not skipped.
    await db.auditLog.create({ data: { id: "aud_sb_not-a-round", actorType: "SYSTEM", action: "generation:sol-background-review",
      entityType: "Game", entityId: ask.gameId, metaJson: "{}" } });
    await expect(backgroundReviewWaiting(db, ask.gameId)).rejects.toThrow(/cannot be read/);
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

describe("a lean world's background questions (local-patch-lean/v1)", () => {
  const flexAnswer = (serviceTier: string | null): BackgroundReviewState => ({ status: "completed", reading: { responseId: "resp_synthetic", raw: "{\"cases\":[]}",
    usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier } });
  it("records its own policy, so the sweep reads its answer under it and prices it by the tier that served it", async () => {
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "in_progress" }), async () => flexAnswer("flex")]);
    const { c, ask, budget, worldId, requestKey, replay } = await setup("bg-lean", fake, "Synthetic lean continuity", "flex");
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", running: true });
    const intent = await db.auditLog.findFirstOrThrow({ where: { entityId: "bg-lean", id: { endsWith: "_intent" } } });
    expect(JSON.parse(intent.metaJson!).intent.policyVersion).toBe("visual-review-head-continuity-sol-high-background-flex/lean-v1");
    // The sweep, with no question in hand: the lean policy from the intent, the Flex half price from the response.
    expect(await advanceContinuityInBackground(c, ask.gameId)).toBe(1);
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 5_000 } });
    const bought = await replay();
    if (bought.kind !== "bought") throw Error("not replayed");
    expect(JSON.parse(bought.bytes.toString())).toMatchObject({ policy: ask.question.policy, wireFault: null, costUnknown: false });
    expect(calls).toEqual({ create: 1, retrieve: 2, cancel: 0 });
    // The historical round of another world records no policy: its bytes are as they always were.
    const historical = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "in_progress" })]);
    const plain = await setup("bg-plain", historical.fake);
    await askContinuityInBackground(plain.c, plain.ask);
    const plainIntent = await db.auditLog.findFirstOrThrow({ where: { entityId: "bg-plain", id: { endsWith: "_intent" } } });
    expect(JSON.parse(plainIntent.metaJson!).intent).not.toHaveProperty("policyVersion");
  });
  it.each(["flex", "default"] as const)("settles the retained lean %s bill after an interrupted accounting write, with no provider work or evidence changes", async tier => {
    const amountMicroUsd = tier === "flex" ? 5_000 : 10_000;
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [
      async () => ({ status: "in_progress" }), async () => flexAnswer(tier)]);
    const { c, ask, budget, store, worldId, requestKey } = await setup(`bg-lean-terminal-${tier}`, fake, "Synthetic lean terminal settlement", tier);
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", running: true });
    const stop = vi.spyOn(WorldBudget.prototype, "settle").mockRejectedValueOnce(Error("lean accounting stopped"));
    try { await expect(advanceContinuityInBackground(c, ask.gameId)).rejects.toThrow("lean accounting stopped"); }
    finally { stop.mockRestore(); }
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending", reserveMicroUsd: 66_000 });
    const kept = (await store.get(worldId, requestKey))!;
    expect(kept).toMatchObject({ evidence: { amountMicroUsd, providerRequestId: "resp_synthetic", model: "gpt-6.1-sol" }, unknownReason: null });
    expect(JSON.parse(kept.bytes.toString())).toMatchObject({ policy: { ...ask.question.policy, serviceTier: tier },
      fingerprint: ask.question.fingerprint, transport: "openai-responses-background/v1", providerStatus: "completed", costUnknown: false });
    const events = await db.auditLog.findMany({ where: { entityId: ask.gameId, action: "generation:sol-background-review" }, orderBy: { id: "asc" } });
    const beforeCalls = { ...calls }, offline = { ...c, backgroundReview: undefined };
    expect(await advanceContinuityInBackground(offline, ask.gameId)).toBe(1);
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: kept.evidence, unknownReasons: [], conflicts: [] });
    expect(await budget.audit(worldId)).toMatchObject({ pendingRequestKeys: [], unknownRequestKeys: [], reservedMicroUsd: 0, held: false });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(await askContinuityInBackground(offline, ask)).toEqual({ kind: "proceed" });
    expect(await advanceContinuityInBackground(offline, ask.gameId)).toBe(0);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(await store.get(worldId, requestKey)).toEqual(kept);
    expect(await db.auditLog.findMany({ where: { entityId: ask.gameId, action: "generation:sol-background-review" }, orderBy: { id: "asc" } })).toEqual(events);
    expect(calls).toEqual(beforeCalls);
    expect(calls).toEqual({ create: 1, retrieve: 2, cancel: 0 });
  });
  it("holds an answer whose served tier is unstated or unknown as an unknown charge", async () => {
    for (const [gameId, tier] of [["bg-lean-null", null], ["bg-lean-priority", "priority"]] as const) {
      const { fake } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => flexAnswer(tier)]);
      const { c, ask, budget, worldId, requestKey } = await setup(gameId, fake, "Synthetic lean continuity", "flex");
      expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
      expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "unknown" });
    }
  });
  it.each([["after its refusal was recorded", "the round asked again"], ["after its zero receipt was kept", "the sweep"],
    ["after its refusal was recorded", "the fallback's own check"]] as const)(
    "finishes a refusal whose create stopped %s, by %s: never a pending reservation, and nothing sent again", async (moment, finisher) => {
      const gameId = `bg-refused-${moment.includes("receipt") ? "kept" : "recorded"}-${finisher.split(" ").at(-1)}`;
      const { fake, calls } = transport(async () => { throw new BackgroundReviewRefused(429, null); });
      const { c, ask, budget, worldId, requestKey, store } = await setup(gameId, fake, "Synthetic lean continuity", "flex");
      const stop = moment.includes("receipt") ? vi.spyOn(WorldBudget.prototype, "settle").mockRejectedValueOnce(Error("worker stopped"))
        : vi.spyOn(LocalPatchRetainedPurchaseStore.prototype, "put").mockRejectedValueOnce(Error("worker stopped"));
      await expect(askContinuityInBackground(c, ask)).rejects.toThrow("worker stopped");
      stop.mockRestore();
      expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending" });
      expect(!!await store.get(worldId, requestKey)).toBe(moment.includes("receipt"));
      if (finisher === "the sweep") await advanceContinuityInBackground(c, gameId);
      else if (finisher === "the round asked again") expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "held", reason: expect.stringContaining("refused (429)") });
      else expect(await reconcileRefusedBackgroundRound(c, gameId, worldId, requestKey)).toBe(true);
      expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0, costBasis: "provider-billed",
        providerRequestId: expect.stringMatching(/^unsent\//) } });
      expect(await reconcileRefusedBackgroundRound(c, gameId, worldId, requestKey)).toBe(true);
      expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "held", reason: expect.stringContaining("refused (429)") });
      expect(calls.create).toBe(1);
    });
  it("records what the provider said about a failed response: its code on the outcome and in the unknown reason, never a free fallback (background-provider-error/v1)", async () => {
    const failed = (providerError?: unknown): BackgroundReviewState => ({ status: "failed", reading: { responseId: "resp_synthetic", raw: null, usage: null,
      model: "gpt-6.1-sol", finishReason: "failed", serviceTier: "flex", ...(providerError === undefined ? {} : { providerError } as object) } });
    const { fake, calls } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => { throw Error("read timed out"); },
      async () => ({ status: "in_progress" }), async () => failed({ code: "server_error", message: `The server had an error at https://example.test/${"k".repeat(40)}` })]);
    const { c, ask, budget, store, worldId, requestKey, replay } = await setup("bg-failed-code", fake, "Synthetic lean continuity", "flex");
    // A failed read and a running response: the round waits, its reservation pending; nothing has ended.
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", reason: expect.stringContaining("read again later") });
    expect(await askContinuityInBackground(c, ask)).toMatchObject({ kind: "waiting", running: true });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "pending", reserveMicroUsd: 66_000 });
    // Terminal failed: the whole reservation unknown, the code on the outcome and in the reason, the scrubbed error kept.
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(await budget.readRequest(worldId, requestKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 66_000,
      unknownReasons: [`${requestKey}: background response resp_synthetic ended failed (server_error) without a charge that can be stated`] });
    const outcome = await db.auditLog.findFirstOrThrow({ where: { entityId: "bg-failed-code", id: { endsWith: "_outcome" } } });
    expect(JSON.parse(outcome.metaJson!)).toMatchObject({ kind: "outcome", state: "unpriced", providerStatus: "failed", errorCode: "server_error" });
    const kept = JSON.parse((await store.get(worldId, requestKey))!.bytes.toString());
    expect(kept).toMatchObject({ providerStatus: "failed", raw: null, usage: null, providerError: { code: "server_error", message: "The server had an error at [url]" } });
    expect(await replay()).toMatchObject({ kind: "unresolved" });
    expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
    expect(calls).toEqual({ create: 1, retrieve: 3, cancel: 0 });
    // A failure that says nothing is recorded exactly as every earlier one: no field, the same reason.
    const bare = await setup("bg-failed-bare", transport(async () => ({ responseId: "resp_synthetic" }), [async () => failed()]).fake, "Synthetic lean continuity", "flex");
    expect(await askContinuityInBackground(bare.c, bare.ask)).toEqual({ kind: "proceed" });
    const bareOutcome = await db.auditLog.findFirstOrThrow({ where: { entityId: "bg-failed-bare", id: { endsWith: "_outcome" } } });
    expect(JSON.parse(bareOutcome.metaJson!)).not.toHaveProperty("errorCode");
    expect(JSON.parse((await bare.store.get(bare.worldId, bare.requestKey))!.bytes.toString())).not.toHaveProperty("providerError");
    expect(await bare.budget.readRequest(bare.worldId, bare.requestKey)).toMatchObject({
      unknownReasons: [`${bare.requestKey}: background response resp_synthetic ended failed without a charge that can be stated`] });
  });
  it("continues a provider-declared failure by its recorded kind, and a pinned world's role only until its second default-tier failure on the same pixels", async () => {
    const codes = new Map<string, string>();
    let created = 0;
    const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async () => ({ responseId: `resp_round${++created}` }),
      retrieve: async (responseId): Promise<BackgroundReviewState> => ({ status: "failed", reading: { responseId, raw: null, usage: null, model: "gpt-6.1-sol",
        finishReason: "failed", serviceTier: null, ...(codes.has(responseId) ? { providerError: { code: codes.get(responseId)!, message: null } } : {}) } }),
      cancel: async () => {} };
    const world = async (gameId: string, pinned: boolean) => {
      await seedApprovedGame(base, db, { gameId, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING" });
      await db.auditLog.create({ data: { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", action: LOCAL_PATCH_LEAN_ACTION, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify(leanReleaseReceipt(gameId)) } });
      if (pinned) await db.auditLog.create({ data: { id: leanReviewRecoveryAuditId(gameId), actorType: "SYSTEM", action: LEAN_REVIEW_RECOVERY_ACTION,
        entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanNewWorldRecoveryReceipt(gameId)) } });
      const c = { ...base, backgroundReview: fake } as Container, worldId = boardWizardWorldId(gameId);
      /** One failed round: the continuity question of this evidence attempt, at this tier, about the same pixels. */
      const fail = async (attempt: number, tier: "flex" | "default", code?: string) => {
        const question = prepareVisualReview({ role: "head-continuity", effort: "high", transport: "responses-background", tier, images: [Buffer.from("synthetic-png")],
          labels: ["CASE newyork-v12-1:people"], prompt: `Synthetic lean continuity\nImmutable candidate binding: {"hideId":"newyork-v12-1"}. Evidence attempt: ${attempt}.` });
        const requestKey = `self-repair:board:newyork:${question.fingerprint}`;
        if (code) codes.set(`resp_round${created + 1}`, code);
        expect(await askContinuityInBackground(c, { gameId, worldId, requestKey, question, reserveMicroUsd: 120_000, fence: async () => {},
          binding: { hideId: "newyork-v12-1", variantId: "tva-synthetic", imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64) } }))
          .toEqual({ kind: "proceed" });
        // The unknown charge stays whole; a synthetic operator continuation only lets the next round of this test be sent.
        const held = (await boardWizardBudgetOf(c).readRequest(worldId, requestKey))!;
        await boardWizardBudgetOf(c, 1, { authorizeUnknownContinuation: async () => true }).authorizeUnknownContinuation(worldId, { approvalId: `operator-${attempt}`,
          requestKey, scope: "judge", operationFingerprint: question.fingerprint, reserveMicroUsd: 120_000, unknownReasons: held.unknownReasons,
          operatorId: "operator-synthetic", authorizationSha256: "e".repeat(64), authorizedAt: "2026-10-20T15:00:00.000Z" });
        return () => providerFailureRefusal(c, gameId, worldId, requestKey);
      };
      return { c, worldId, fail };
    };
    const pinned = await world("bg-bound-pinned", true);
    expect(await (await pinned.fail(1, "flex"))()).toBeNull();
    expect(await (await pinned.fail(2, "default"))()).toBeNull();
    const third = await pinned.fail(3, "default");
    expect(await third()).toMatch(/^self-repair:board:newyork:[0-9a-f]{64}: the provider ended 2 default-tier questions of this role about these pixels failed; this question is not asked again automatically$/);
    // A failure the provider names as the request's own, a flagged image or the account is never continued, at any count.
    for (const [attempt, code, kind] of [[4, "image_content_policy_violation", "content-policy"], [5, "invalid_image", "request-invalid"], [6, "insufficient_quota", "account"]] as const)
      expect(await (await pinned.fail(attempt, "flex", code))()).toContain(`the provider ended it failed (${kind}: ${code}); a ${kind} failure is never asked again automatically`);
    // Without the pin only the kind decides: every earlier world reads exactly as before.
    const plain = await world("bg-bound-plain", false);
    for (const attempt of [1, 2, 3]) expect(await (await plain.fail(attempt, "default"))()).toBeNull();
    expect(await (await plain.fail(4, "default", "image_content_policy_violation"))()).toContain("content-policy");
    // A round that has not ended is never a failure to continue.
    expect(await providerFailureRefusal(pinned.c, "bg-bound-pinned", pinned.worldId, `self-repair:board:newyork:${"d".repeat(64)}`)).toContain("recorded no outcome");
  });
  it("stops every question about pixels the provider said can never succeed, whatever its charge: a settled bill stays settled, an unknown one unknown (Codex QA R1)", async () => {
    const pixels = { hideId: "newyork-v12-1", variantId: "tva-synthetic", imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64) };
    /** One round about those pixels, ended as `state` says: its ledger state, its outcome event and what the stop reads. */
    const ended = async (gameId: string, state: (responseId: string) => BackgroundReviewState) => {
      const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async () => ({ responseId: "resp_permanent" }),
        retrieve: async responseId => state(responseId), cancel: async () => {} };
      const { c, ask, budget, worldId, requestKey } = await setup(gameId, fake, "Synthetic lean continuity", "flex");
      expect(await askContinuityInBackground(c, ask)).toEqual({ kind: "proceed" });
      const outcome = JSON.parse((await db.auditLog.findFirstOrThrow({ where: { entityId: gameId, id: { endsWith: "_outcome" } } })).metaJson!);
      return { ledger: await budget.readRequest(worldId, requestKey), outcome, requestKey, stop: await permanentFailureOnImage(db, gameId, pixels),
        elsewhere: await permanentFailureOnImage(db, gameId, { ...pixels, imageSha256: "d".repeat(64) }) };
    };
    const reading = (responseId: string, status: "failed" | "incomplete", usage: Record<string, number> | null, code: string | null) =>
      ({ status, reading: { responseId, raw: null, usage, model: "gpt-6.1-sol", finishReason: status === "failed" ? "failed" : "content_filter",
        serviceTier: "flex", ...(code ? { providerError: { code, message: null } } : {}) } }) as BackgroundReviewState;
    const billed = { input_tokens: 2000, output_tokens: 500 };
    // Priced: the provider billed what it read before it refused. The bill is settled as it arrived; the stop holds anyway.
    const priced = await ended("bg-permanent-priced", id => reading(id, "failed", billed, "image_content_policy_violation"));
    expect(priced.ledger).toMatchObject({ state: "settled", evidence: { providerRequestId: "resp_permanent" } });
    expect(priced.outcome).toMatchObject({ state: "unusable", providerStatus: "failed", errorCode: "image_content_policy_violation" });
    expect(priced.stop).toBe(`${priced.requestKey}: the provider ended it failed (content-policy: image_content_policy_violation);`
      + " a content-policy failure is never asked again automatically; nothing more is asked about these pixels until a person decides");
    expect(priced.elsewhere).toBeNull();
    // Unpriced: unknown and reserved in full, never settled to reach the stop, and the same stop.
    const unpriced = await ended("bg-permanent-unpriced", id => reading(id, "failed", null, "invalid_image"));
    expect(unpriced.ledger).toMatchObject({ state: "unknown", reserveMicroUsd: 66_000 });
    expect(unpriced.outcome).toMatchObject({ state: "unpriced", errorCode: "invalid_image" });
    expect(unpriced.stop).toContain("the provider ended it failed (request-invalid: invalid_image)");
    // A response cut short by the provider's content filter, priced; and an account failure.
    expect((await ended("bg-permanent-filter", id => reading(id, "incomplete", billed, "content_filter"))).stop)
      .toContain("the provider ended it incomplete (content-policy: content_filter)");
    expect((await ended("bg-permanent-account", id => reading(id, "failed", billed, "insufficient_quota"))).stop).toContain("(account: insufficient_quota)");
    // A recoverable failure, priced or not, and a withheld code, stop nothing.
    for (const [gameId, usage, code] of [["bg-recoverable-priced", billed, "server_error"], ["bg-recoverable-unpriced", null, "rate_limit_exceeded"],
      ["bg-recoverable-withheld", null, WITHHELD_PROVIDER_ERROR_CODE]] as const)
      expect((await ended(gameId, id => reading(id, "failed", usage, code))).stop).toBeNull();
  });
  it("reconciles nothing for a round that was not refused", async () => {
    const { fake } = transport(async () => ({ responseId: "resp_synthetic" }), [async () => ({ status: "in_progress" })]);
    const { c, ask, worldId, requestKey } = await setup("bg-not-refused", fake, "Synthetic lean continuity", "flex");
    expect(await reconcileRefusedBackgroundRound(c, ask.gameId, worldId, requestKey)).toBe(false);
    await askContinuityInBackground(c, ask);
    expect(await reconcileRefusedBackgroundRound(c, ask.gameId, worldId, requestKey)).toBe(false);
  });
});
