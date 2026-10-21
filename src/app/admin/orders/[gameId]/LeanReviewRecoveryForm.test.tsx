import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const held = `self-repair:board:paris:${"b".repeat(64)}`;
const f = vi.hoisted(() => ({ admin: { id: "admin" } as { id: string } | null, plan: vi.fn(), repair: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("@/services/generation/identity-source-revision-state", () => ({ identityRevisionPending: async () => false }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/lean-review-recovery", () => ({ LEAN_REVIEW_RECOVERY_CONFIRMATION: "release-this-world-under-local-patch-lean-review-recovery-v1",
  planLeanReviewRecovery: f.plan }));
vi.mock("@/services/generation/identity-source-revision", () => ({ identitySourceRevisionSupported: f.repair }));
vi.mock("../../actions", () => ({ applyLeanReviewRecoveryAction: f.apply }));
import { LeanReviewRecoveryForm } from "./LeanReviewRecoveryForm";
const eligible = { eligible: true, refusals: [], planSha256: "c".repeat(64), held: [{ requestKey: held, reserveMicroUsd: 120_000, shape: "provider-failed", refusal: null }],
  ledger: { capMicroUsd: 4_000_000, settledMicroUsd: 798_509, reservedMicroUsd: 1_000_000, committedMicroUsd: 1_798_509, remainingMicroUsd: 2_201_491,
    unknownRequests: 7, continuations: {} }, binding: { heldRequestKeys: [held] } };
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { f.admin = { id: "admin" }; f.plan.mockReset().mockResolvedValue(eligible); f.apply.mockReset(); f.repair.mockReset().mockResolvedValue(false); });
describe("lean world review-recovery release form (local-patch-lean-review-recovery/v1)", () => {
  it("renders one explicit release bound to the plan shown, and never releases on page load", async () => {
    const html = renderToStaticMarkup((await LeanReviewRecoveryForm({ gameId: "game-synthetic" }))!);
    expect(html).toContain('name="gameId" value="game-synthetic"');
    expect(html).toContain(`name="planSha256" value="${"c".repeat(64)}"`);
    expect(html).toContain('value="release-this-world-under-local-patch-lean-review-recovery-v1"');
    expect(html).toContain('type="checkbox"'); expect(html).toContain('required=""');
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toContain("$1.80"); expect(html).toContain("$4.00"); expect(html).toContain("$2.20"); expect(html).toContain("חיובי API נוספים");
    // An opaque key never reaches the page; nothing about the child, the photograph or the account is part of the plan.
    expect(html).not.toContain(held);
    expect(f.plan).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic" });
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("hides the control for a world the plan refuses", async () => {
    f.plan.mockResolvedValue({ ...eligible, eligible: false, refusals: ["the world already carries local-patch-lean-review-recovery/v1"] });
    expect(await LeanReviewRecoveryForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.apply).not.toHaveBeenCalled();
  });
  it("does not even read the plan without an administrator", async () => {
    f.admin = null;
    expect(await LeanReviewRecoveryForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.plan).not.toHaveBeenCalled();
  });
});


it("never offers continue-as-is beside an eligible rejected-reference repair", async () => {
  f.repair.mockResolvedValue(true);
  expect(await LeanReviewRecoveryForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.plan).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
