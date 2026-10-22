import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { LeanCapacityReceipt } from "../../../domain/generation/lean-capacity-recovery";
import { BACKGROUND_REVIEW_ROUND_VERSION, backgroundRoundOf, type BackgroundReviewBinding, type BackgroundReviewEvent } from "../../../domain/generation/background-review-round";
import { backgroundRoundIdOf, SOL_BACKGROUND_ACTION } from "../continuity-background";
import { leanCapacityRecoveryOf } from "../lean-capacity-recovery-pin";
import { boundLeanRecoveryHold, parkedHoldSha256 } from "../lean-review-recovery-pin";
import { capacityReviewRoundAdmission, boundLeanCapacityStartedRoundHold } from "../lean-capacity-started-round";

vi.mock("../lean-capacity-recovery-pin", async original => ({ ...await original<typeof import("../lean-capacity-recovery-pin")>(), leanCapacityRecoveryOf: vi.fn() }));
afterEach(() => vi.mocked(leanCapacityRecoveryOf).mockReset());
const gameId = "capacity-started-round-synthetic", worldId = gameId + ":board-wizard";
const authorizedAt = "2026-10-22T00:00:00.000Z";
const binding: BackgroundReviewBinding = { hideId: "synthetic-v12-3", variantId: "synthetic-variant", imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64) };
const policy = (role: "quality" | "continuity", tier: "flex" | "default") => "visual-review-" + (role === "quality" ? "scene-quality" : "head-continuity") + "-sol-high-background-" + tier + "/lean-v1";
function fixture() {
  const rows = new Map<string, { id: string; actorType: string; actorId: string | null; entityType: string; entityId: string; action: string; metaJson: string; createdAt: Date }>();
  const db = { auditLog: {
    findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
    findMany: async ({ where }: { where: { id?: { startsWith?: string }; entityId?: string; entityType?: string; action?: string } }) => [...rows.values()].filter(row => (!where.id?.startsWith || row.id.startsWith(where.id.startsWith)) && (!where.entityId || row.entityId === where.entityId) && (!where.entityType || row.entityType === where.entityType) && (!where.action || row.action === where.action)),
    create: () => { throw Error("Read-only recovery eligibility must never write"); },
  } } as unknown as Pick<Prisma.TransactionClient, "auditLog">;
  // The production reader validates the full immutable receipt; these tests isolate its subsequent scope check.
  const pin = { gameId, worldId, jobId: "job_" + gameId, authorizedAt, identitySha256: binding.identitySha256,
    heldRequestKeys: [] as string[], ledgerSha256: "d".repeat(64) } as unknown as LeanCapacityReceipt;
  const add = (role: "quality" | "continuity", tier: "flex" | "default", n: number, at: string, patch: Partial<BackgroundReviewBinding> = {}) => {
    const fingerprint = n.toString(16).padStart(64, "0"), requestKey = "self-repair:board:synthetic:" + fingerprint;
    const intent = { version: BACKGROUND_REVIEW_ROUND_VERSION, roundId: backgroundRoundIdOf(worldId, requestKey), gameId, worldId, requestKey,
      fingerprint, bodySha256: "f".repeat(64), reserveMicroUsd: role === "quality" ? 200_000 : 120_000,
      binding: { ...binding, ...patch }, policyVersion: policy(role, tier) };
    // The intent precedes the grant; its claim, dispatch and overload deliberately occur after it.
    const stamp = Date.parse(authorizedAt) + 1_000;
    const events: BackgroundReviewEvent[] = [{ kind: "intent", intent }, { kind: "claim", at: stamp },
      { kind: "submitted", responseId: "resp_synthetic_" + n, at: stamp + 1 },
      { kind: "outcome", responseId: "resp_synthetic_" + n, state: "unpriced", providerStatus: "failed", errorCode: "server_is_overloaded", at: stamp + 2 }];
    for (const [i, event] of events.entries()) { const id = "aud_sb_" + intent.roundId + "_" + event.kind;
      rows.set(id, { id, actorType: "SYSTEM", actorId: null, entityType: "Game", entityId: gameId, action: SOL_BACKGROUND_ACTION,
        metaJson: JSON.stringify(event), createdAt: new Date(i === 0 ? at : stamp + i) }); }
    return { round: backgroundRoundOf(events), candidate: { requestKey, fingerprint, role }, intentId: "aud_sb_" + intent.roundId + "_intent" };
  };
  return { db, rows, pin, add };
}
const before = "2026-10-21T23:59:00.000Z", after = "2026-10-22T00:00:01.000Z";

describe("capacity grant carries exactly an already-started Flex round", () => {
  it("keeps the held cohort and new default questions admitted without changing records", async () => {
    const f = fixture(), held = f.add("quality", "flex", 1, before), fresh = f.add("continuity", "default", 2, after);
    f.pin.heldRequestKeys.push(held.candidate.requestKey);
    const snapshot = JSON.stringify([...f.rows]);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, held.round)).toEqual({ kind: "held" });
    expect(await capacityReviewRoundAdmission(f.db, f.pin, fresh.round)).toEqual({ kind: "default" });
    expect(JSON.stringify([...f.rows])).toBe(snapshot);
  });
  it.each(["quality", "continuity"] as const)("continues an unsubmitted pre-grant Flex %s intent after its evidenced overload", async role => {
    const f = fixture(), old = f.add(role, "flex", 3, before), snapshot = JSON.stringify([...f.rows]);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, old.round)).toMatchObject({ kind: "started-flex", anchor: { requestKey: old.candidate.requestKey, createdAt: before } });
    expect(JSON.stringify([...f.rows])).toBe(snapshot);
  });
  it("carries its post-grant Flex continuity only through the exact quality candidate of that prepared round", async () => {
    const f = fixture(), quality = f.add("quality", "flex", 4, before), continuity = f.add("continuity", "flex", 5, after);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round, [quality.candidate])).toMatchObject({ kind: "started-flex", anchor: { requestKey: quality.candidate.requestKey } });
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round)).toBeNull();
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round, [{ ...quality.candidate, fingerprint: "0".repeat(64) }])).toBeNull();
  });
  it.each(["imageSha256", "geometrySha256", "identitySha256", "variantId", "hideId"] as const)("refuses a companion anchored to different %s", async field => {
    const f = fixture(), quality = f.add("quality", "flex", 6, before, { [field]: "e".repeat(64) }), continuity = f.add("continuity", "flex", 7, after);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round, [quality.candidate])).toBeNull();
  });
  it("refuses fresh Flex quality, a post-grant/default anchor, and a timestamp equal to the grant", async () => {
    const f = fixture(), fresh = f.add("quality", "flex", 8, after), old = f.add("quality", "flex", 9, before), equal = f.add("quality", "flex", 10, authorizedAt);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, fresh.round, [old.candidate])).toBeNull();
    expect(await capacityReviewRoundAdmission(f.db, f.pin, equal.round)).toBeNull();
    const continuity = f.add("continuity", "flex", 11, after), wrong = f.add("quality", "default", 12, before);
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round, [fresh.candidate, wrong.candidate])).toBeNull();
  });
  it("refuses a changed intent actor or fingerprint, a priced answer, or a non-capacity failure", async () => {
    const f = fixture(), old = f.add("quality", "flex", 13, before), row = f.rows.get(old.intentId)!;
    row.actorType = "USER"; expect(await capacityReviewRoundAdmission(f.db, f.pin, old.round)).toBeNull();
    row.actorType = "SYSTEM"; row.metaJson = JSON.stringify({ kind: "intent", intent: { ...old.round.intent, fingerprint: "e".repeat(64) } });
    expect(await capacityReviewRoundAdmission(f.db, f.pin, old.round)).toBeNull();
    row.metaJson = JSON.stringify({ kind: "intent", intent: old.round.intent });
    const terminal = old.round.terminal!;
    expect(await capacityReviewRoundAdmission(f.db, f.pin, { ...old.round, terminal: { ...terminal, state: "answered", providerStatus: "completed" } as typeof terminal })).toBeNull();
    expect(await capacityReviewRoundAdmission(f.db, f.pin, { ...old.round, terminal: { ...terminal, errorCode: "content_policy_violation" } as typeof terminal })).toBeNull();
  });
  it("wakes only the exact old-code mismatch for its own already-started failed round", async () => {
    const f = fixture(), old = f.add("quality", "flex", 14, before);
    vi.mocked(leanCapacityRecoveryOf).mockResolvedValue(f.pin);
    const job = { id: f.pin.jobId, updatedAt: new Date(after), lastError: "local-patch-continue-in-slice/v1: " + old.candidate.requestKey + ": its record no longer matches an interruption this continuation admits on these pixels" };
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, job)).toEqual({ worldId, jobId: job.id, holdSha256: parkedHoldSha256(job), heldRequestKeys: [old.candidate.requestKey], ledgerSha256: f.pin.ledgerSha256 });
    expect(await boundLeanRecoveryHold(f.db, gameId, job)).toEqual(await boundLeanCapacityStartedRoundHold(f.db, gameId, job));
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, { ...job, id: "other-job" })).toBeNull();
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, { ...job, lastError: job.lastError + "; operator stop" })).toBeNull();
    vi.mocked(leanCapacityRecoveryOf).mockResolvedValue(null);
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, job)).toBeNull();
  });
  it("wakes a paired post-grant continuity hold without replacing normal continuation's candidate proof", async () => {
    const f = fixture(), quality = f.add("quality", "flex", 17, before), continuity = f.add("continuity", "flex", 18, after);
    const answered = f.rows.get("aud_sb_" + quality.round.intent.roundId + "_outcome")!;
    answered.metaJson = JSON.stringify({ kind: "outcome", state: "answered", providerStatus: "completed",
      responseId: "resp_synthetic_17", at: Date.parse(after) });
    vi.mocked(leanCapacityRecoveryOf).mockResolvedValue(f.pin);
    const job = { id: f.pin.jobId, updatedAt: new Date(after), lastError: "local-patch-continue-in-slice/v1: " + continuity.candidate.requestKey
      + ": its record no longer matches an interruption this continuation admits on these pixels" };
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, job)).toEqual({ worldId, jobId: job.id,
      holdSha256: parkedHoldSha256(job), heldRequestKeys: [continuity.candidate.requestKey], ledgerSha256: f.pin.ledgerSha256 });
    // A bounded wake buys nothing. Actual continuation still requires the exact rebuilt candidate.
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round)).toBeNull();
    expect(await capacityReviewRoundAdmission(f.db, f.pin, continuity.round, [quality.candidate])).toMatchObject({ kind: "started-flex" });
  });
  it.each(["imageSha256", "geometrySha256", "identitySha256", "variantId", "hideId"] as const)("does not discover a wake companion for different %s", async field => {
    const f = fixture();
    f.add("quality", "flex", 19, before, { [field]: "e".repeat(64) });
    const continuity = f.add("continuity", "flex", 20, after);
    vi.mocked(leanCapacityRecoveryOf).mockResolvedValue(f.pin);
    const job = { id: f.pin.jobId, updatedAt: new Date(after), lastError: "local-patch-continue-in-slice/v1: " + continuity.candidate.requestKey
      + ": its record no longer matches an interruption this continuation admits on these pixels" };
    expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, job)).toBeNull();
  });
  it("does not wake later holds for a fresh default question or a fresh Flex question", async () => {
    const f = fixture(); vi.mocked(leanCapacityRecoveryOf).mockResolvedValue(f.pin);
    for (const tier of ["default", "flex"] as const) {
      const fresh = f.add("quality", tier, tier === "default" ? 15 : 16, after);
      const job = { id: f.pin.jobId, updatedAt: new Date(after), lastError: "local-patch-continue-in-slice/v1: " + fresh.candidate.requestKey + ": its record no longer matches an interruption this continuation admits on these pixels" };
      expect(await boundLeanCapacityStartedRoundHold(f.db, gameId, job)).toBeNull();
    }
  });
});
