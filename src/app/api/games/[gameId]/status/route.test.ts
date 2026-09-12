import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  game: vi.fn(), asset: vi.fn(), job: vi.fn(), user: vi.fn(), denied: vi.fn(), link: vi.fn(), proof: vi.fn(), hash: vi.fn(), wizard: vi.fn(), ledger: vi.fn(),
  approved: vi.fn(),
}));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: mocks.denied }));
vi.mock("@/lib/server/session", () => ({ currentUser: mocks.user, draftTokenFromCookie: async () => null, isAdminEmail: () => false }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: mocks.game }, asset: { findUnique: mocks.asset }, generationJob: { findUnique: mocks.job }, worldBudgetLedger: { findUnique: mocks.ledger } }, email: { id: "console" } }) }));
vi.mock("@/services/generation/board-conditioned-wizard", () => ({ BOARD_WIZARD_STYLE: "fixed-sprite-board-wizard-v1", readBoardWizard: mocks.wizard }));
// Only the expensive lookup is stubbed. `characterNeedsApproval` is the real
// decision rule under test, so it runs for real.
vi.mock("@/services/generation/board-wizard-identity-gate", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/generation/board-wizard-identity-gate")>()),
  identityApprovedForDisplay: mocks.approved,
}));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "qa" }) }));
vi.mock("@/services/share-link.service", () => ({ ensurePlayerLink: mocks.link }));
vi.mock("@/services/asset.service", () => ({ signedAssetUrl: () => "/synthetic-avatar" }));
vi.mock("@/services/generation/pipeline", () => ({ RESUMABLE_STATUSES: ["PAID", "TARGETS_GENERATING", "QA_PENDING", "GENERATION_FAILED"] }));
vi.mock("@/services/generation/fixed-world-stage-record", () => ({
  FIXED_WORLD_STYLE_VERSION: "fixed-sprite-v3", isFixedWorldStyle: (s: string) => s.startsWith("fixed-sprite-"),
  readFixedWorldStage: mocks.proof, fixedWorldConfigSha256: mocks.hash,
}));
import { GET } from "./route";
import type { WorldBudgetRequest, WorldBudgetSnapshot } from "@/services/generation/world-budget";

// Boundary wiring tests; actual strict capsules/SQLite are tested by staging.
const game = { id: "synthetic", ownerId: "owner", childProfileId: "child", styleVersion: "fixed-sprite-v3", status: "QA_PENDING", locale: "en", deletedAt: null,
  // A wizard game cannot be enrolled without an approved identity sheet, so the
  // fixture carries one: the route asks whether the drawing was approved, not
  // merely whether its file landed.
  configJson: null as string | null, scenes: [],
  childProfile: { avatarAssetId: "avatar", identityAssetId: "identity", originalPhotoAssetId: "photo", ageYears: 8 } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.denied.mockResolvedValue(null); mocks.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
  mocks.game.mockResolvedValue({ ...game }); mocks.asset.mockResolvedValue({ status: "READY" });
  mocks.job.mockResolvedValue({ gameId: game.id, status: "DONE", stepsJson: "{}" });
  mocks.proof.mockReturnValue(null); mocks.hash.mockReturnValue("synthetic-hash"); mocks.link.mockResolvedValue({ url: "/synthetic-play" });
  mocks.ledger.mockResolvedValue(null); mocks.approved.mockResolvedValue(true);
});
async function response() { return GET(new Request("https://example.invalid/api/games/synthetic/status"), { params: Promise.resolve({ gameId: "synthetic" }) }); }
function assembled(status = "MANUAL_REVIEW") {
  mocks.game.mockResolvedValue({ ...game, status, configJson: "{}" });
  mocks.proof.mockReturnValue({ state: "staged", gameId: game.id, ownerId: game.ownerId, childProfileId: game.childProfileId, configSha256: "synthetic-hash" });
}

function localBudget(pendingState?: "pending" | "unknown"): WorldBudgetSnapshot {
  const paid = (requestKey: string, scope: "identity" | "image" | "judge", amountMicroUsd: number): WorldBudgetRequest => ({
    requestKey, scope, operationFingerprint: `fingerprint-${requestKey}`, reserveMicroUsd: 400_000,
    state: "settled", origin: "reserved", unknownReasons: [], conflicts: [],
    evidence: { providerNamespace: "synthetic", providerRequestId: `receipt-${requestKey}`, usageId: `usage-${requestKey}`,
      rawUsage: { tokens: 1 }, model: "synthetic-model", amountMicroUsd, costBasis: "provider-billed" },
  });
  const identity = paid("identity", "identity", 100_000), image = paid("image", "image", 48_800), judge = paid("judge", "judge", 2_000);
  const requests: WorldBudgetRequest[] = [identity, image, judge];
  if (image.state === "settled") requests.push({ ...image, requestKey: "same-image-receipt", state: "linked", canonicalRequestKey: image.requestKey });
  if (pendingState) requests.push({ requestKey: "next-image", scope: "image", operationFingerprint: "next-fingerprint", reserveMicroUsd: 400_000,
    origin: "reserved", state: pendingState, unknownReasons: pendingState === "unknown" ? ["usage missing"] : [], conflicts: [] });
  return { worldId: "synthetic:board-wizard", requests };
}

describe("fixed-world creation status boundary", () => {
  it("reports a local-patch ledger hold without waiting for the worker's parking marker", async () => {
    mocks.game.mockResolvedValue({ ...game, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1" });
    mocks.job.mockResolvedValue({ gameId: game.id, status: "QUEUED", currentStep: "local-patch", stepsJson: "{}" });
    mocks.ledger.mockResolvedValue({ snapshotJson: JSON.stringify(localBudget("unknown")) });
    const body = await (await response()).json();
    expect(body).toMatchObject({ state: "held", pending: false, awaitingQa: true, done: false, playUrl: null, place: null,
      qaCost: { spentCents: 15.08, reservedCents: 40, capCents: 500, held: true } });
    expect(mocks.ledger).toHaveBeenCalledExactlyOnceWith({ where: { worldId: "synthetic:board-wizard" } });
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each([undefined, "pending"] as const)("counts all local-patch purchases once without parking an ordinary %s ledger", async pendingState => {
    mocks.game.mockResolvedValue({ ...game, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1" });
    mocks.ledger.mockResolvedValue({ snapshotJson: JSON.stringify(localBudget(pendingState)) });
    expect(await (await response()).json()).toMatchObject({ state: "working", pending: true, awaitingQa: false,
      qaCost: { spentCents: 15.08, reservedCents: pendingState ? 40 : 0, capCents: 500, held: false } });
  });
  it("reports an empty new local-patch budget without requiring a ledger row", async () => {
    mocks.game.mockResolvedValue({ ...game, status: "PAID", styleVersion: "local-patch-world-v1" });
    expect(await (await response()).json()).toMatchObject({ pending: true, qaCost: { spentCents: 0, reservedCents: 0, capCents: 500, held: false } });
  });
  it.each(["invalid-json", "wrong-world", "invalid-snapshot", "unavailable"])("does not schedule local-patch work or invent costs for %s budget evidence", async kind => {
    mocks.game.mockResolvedValue({ ...game, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1" });
    if (kind === "unavailable") mocks.ledger.mockRejectedValue(new Error("Synthetic database unavailable"));
    else mocks.ledger.mockResolvedValue({ snapshotJson: kind === "invalid-json" ? "{" : JSON.stringify(kind === "wrong-world"
      ? { ...localBudget(), worldId: "another-game:board-wizard" } : { ...localBudget(), requests: [{}] }) });
    expect(await (await response()).json()).toMatchObject({ state: "held", pending: false, qaCost: null, awaitingQa: true });
  });
  it("never exempts a new local-patch avatar from review even when the identity link is missing", async () => {
    mocks.game.mockResolvedValue({ ...game, status: "AVATAR_GENERATING", styleVersion: "local-patch-world-v1",
      childProfile: { ...game.childProfile, identityAssetId: null } });
    mocks.approved.mockResolvedValue(false);
    expect(await (await response()).json()).toMatchObject({ characterReady: false, avatarUrl: null });
    expect(mocks.approved).toHaveBeenCalled();
  });
  it("hides an unapproved character in the window before enrolment, where it is actually drawn", async () => {
    // The window this gate exists for. The identity sheet is drawn and linked to
    // the profile, the review has not run or has just refused it, and the game is
    // STILL `collage-v1` - the board-wizard style is only set by a successful
    // enrolment, which happens after approval. A first version of this gate asked
    // about the engine and so skipped precisely this window.
    for (const status of ["AVATAR_GENERATING", "MANUAL_REVIEW"]) {
      mocks.game.mockResolvedValue({ ...game, status, styleVersion: "collage-v1" });
      mocks.approved.mockResolvedValue(false);
      const body = await (await response()).json();
      expect(body.avatarUrl, `${status} before approval`).toBeNull();
      expect(mocks.approved).toHaveBeenCalled();
    }
  });

  it("shows the character once its drawing has been approved, whatever engine the game is on", async () => {
    for (const styleVersion of ["collage-v1", "fixed-sprite-board-wizard-v1"]) {
      mocks.game.mockResolvedValue({ ...game, styleVersion });
      mocks.approved.mockResolvedValue(true);
      expect((await (await response()).json()).avatarUrl, styleVersion).toBe("/synthetic-avatar");

      // An approved drawing whose file is not there yet is still not shown.
      mocks.asset.mockResolvedValue({ status: "FAILED" });
      expect((await (await response()).json()).avatarUrl, styleVersion).toBeNull();
      mocks.asset.mockResolvedValue({ status: "READY" });
    }
  });

  it("asks nothing of a game that has no drawing to approve", async () => {
    // An older game whose avatar came from the collage path has no identity
    // sheet, so there is nothing of this kind to approve and nothing to hide.
    // The exemption is that explicit condition, not "any engine but the wizard".
    mocks.game.mockResolvedValue({ ...game, styleVersion: "collage-v1", childProfile: { avatarAssetId: "avatar" } });
    mocks.approved.mockResolvedValue(false);
    expect((await (await response()).json()).avatarUrl).toBe("/synthetic-avatar");
    expect(mocks.approved).not.toHaveBeenCalled();
  });

  it("reports unassembled enrollment honestly without legacy scheduling or a play link", async () => {
    const res = await response(), body = await res.json();
    expect(body).toMatchObject({ status: "QA_PENDING", percent: 20, step: 2, state: "awaiting_review", done: false, pending: false, playUrl: null });
    expect(body.milestones.assemble).toBe("todo"); expect(body).not.toHaveProperty("fixedEnrollment");
    expect(res.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each(["READY", "DELIVERED"])("does not trust %s with missing staging evidence", async status => {
    mocks.game.mockResolvedValue({ ...game, status });
    expect(await (await response()).json()).toMatchObject({ done: false, delivered: false, playUrl: null, percent: 20 });
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each(["missing-job", "running-job", "wrong-game", "wrong-owner", "wrong-child", "hash", "malformed", "deleted", "future-version"])("keeps %s evidence closed", async kind => {
    assembled("READY");
    if (kind === "missing-job") mocks.job.mockResolvedValue(null);
    if (kind === "running-job") mocks.job.mockResolvedValue({ gameId: game.id, status: "RUNNING", stepsJson: "{}" });
    if (kind === "wrong-game") mocks.job.mockResolvedValue({ gameId: "other", status: "DONE", stepsJson: "{}" });
    if (kind === "wrong-owner" || kind === "wrong-child") mocks.proof.mockReturnValue({ state: "staged", gameId: game.id, ownerId: kind === "wrong-owner" ? "other" : game.ownerId, childProfileId: kind === "wrong-child" ? "other" : game.childProfileId, configSha256: "synthetic-hash" });
    if (kind === "hash") mocks.hash.mockReturnValue("different");
    if (kind === "malformed") mocks.proof.mockImplementation(() => { throw new Error("bad capsule"); });
    if (kind === "deleted") mocks.game.mockResolvedValue({ ...game, status: "READY", configJson: "{}", deletedAt: new Date() });
    if (kind === "future-version") mocks.game.mockResolvedValue({ ...game, status: "READY", configJson: "{}", styleVersion: "fixed-sprite-v999" });
    expect(await (await response()).json()).toMatchObject({ done: false, pending: false, playUrl: null });
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("distinguishes assembly awaiting QA from a manually released game", async () => {
    assembled();
    expect(await (await response()).json()).toMatchObject({ percent: 96, done: false, pending: false, playUrl: null });
    assembled("READY");
    expect(await (await response()).json()).toMatchObject({ percent: 100, done: true, playUrl: "/synthetic-play" });
    expect(mocks.link).toHaveBeenCalledOnce();
  });
  it("preserves legacy progress and does not query fixed proof", async () => {
    mocks.game.mockResolvedValue({ ...game, styleVersion: "collage-v1" });
    expect(await (await response()).json()).toMatchObject({ percent: 96, pending: true });
    expect(mocks.job).not.toHaveBeenCalled();
  });
  it("requires the QA gate and ownership before reading private proof", async () => {
    mocks.user.mockResolvedValue({ id: "other" });
    expect((await response()).status).toBe(403); expect(mocks.job).not.toHaveBeenCalled();
    mocks.denied.mockResolvedValue(new Response("denied", { status: 401 }));
    expect((await response()).status).toBe(401);
  });
  it.each([false, true])("exposes all27 wizard slot states, but only full geometry gets a private review link (partial=%s)", async partial => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "fixed-sprite-board-wizard-v1", configJson: partial ? null : "{}" });
    const boards = Array.from({ length: 9 }, (_, i) => ({ boardId: `board-${i}`, state: partial && i === 8 ? "needs-repair" : "geometry-ok", attempts: 2, reason: "synthetic reason", visual: [] }));
    mocks.wizard.mockReturnValue({ state: "held", capMicroUsd: 4000000, boards, catalog: { boards: boards.map(b => ({ boardId: b.boardId, slots: ["A", "B", "C"].map(id => ({ slot: { id } })) })) } });
    const body = await (await response()).json();
    expect(body).toMatchObject({ done: false, pending: false, playUrl: null, spotsDone: partial ? 24 : 27, qaPreviewUrl: partial ? null : "/qa-review/synthetic" });
    expect(body.qaBoards).toHaveLength(9); expect(body.qaBoards.flatMap((b: { slots: unknown[] }) => b.slots)).toHaveLength(27); expect(mocks.link).not.toHaveBeenCalled();
    expect(body).toMatchObject({ percent: partial ? 77 : 96, state: "held" });
    expect(body.milestones.check).toBe("todo");
    expect(body.milestones.assemble).toBe(partial ? "todo" : "done");
  });
  it.each(["held", "review-required", "running"])("reports zero composed spots honestly when a manual-review wizard record is %s", state => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "fixed-sprite-board-wizard-v1" });
    const boards = Array.from({ length: 9 }, (_, i) => ({ boardId: `board-${i}`, state: "pending", attempts: 0, reason: null, visual: [] }));
    mocks.wizard.mockReturnValue({ state, capMicroUsd: 4000000, boards, catalog: { boards: boards.map(b => ({ boardId: b.boardId, slots: ["A", "B", "C"].map(id => ({ slot: { id } })) })) } });
    return response().then(async res => {
      const body = await res.json();
      expect(body).toMatchObject({ spotsDone: 0, spotsTotal: 27, percent: 20, step: 2, state: "held", pending: false, done: false, place: null, qaPreviewUrl: null });
      expect(body.milestones).toMatchObject({ hiding: "todo", assemble: "todo", check: "todo" });
      expect(mocks.link).not.toHaveBeenCalled();
    });
  });
  it("does not mistake a DONE slice for a stopped healthy wizard", async () => {
    mocks.game.mockResolvedValue({ ...game, status: "TARGETS_GENERATING", styleVersion: "fixed-sprite-board-wizard-v1" });
    const boards = Array.from({ length: 9 }, (_, i) => ({ boardId: `board-${i}`, state: i === 0 ? "geometry-ok" : "pending", attempts: i === 0 ? 1 : 0, reason: null, visual: [] }));
    mocks.wizard.mockReturnValue({ state: "running", capMicroUsd: 4000000, boards, catalog: { boards: boards.map(b => ({ boardId: b.boardId, slots: ["A", "B", "C"].map(id => ({ slot: { id } })) })) } });
    expect(await (await response()).json()).toMatchObject({ percent: 27, spotsDone: 3, pending: true, state: "working", milestones: { hiding: "active", assemble: "todo" } });
  });
  it.each(["missing", "malformed"])("keeps a %s wizard capsule from claiming 96% or scheduling work", async kind => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "fixed-sprite-board-wizard-v1" });
    if (kind === "missing") mocks.job.mockResolvedValue(null);
    else mocks.wizard.mockImplementation(() => { throw new Error("bad capsule"); });
    expect(await (await response()).json()).toMatchObject({ percent: 20, spotsDone: 0, spotsTotal: 27, pending: false, state: "held", qaPreviewUrl: null });
  });
  it.each(["identity-style-review-required", "identity-enrollment-failed", "unresolved-identity"])("shows a pre-enrollment %s hold rather than legacy96%%", async reason => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "collage-v1" });
    mocks.job.mockResolvedValue({ gameId: game.id, status: "DONE", stepsJson: JSON.stringify({ avatar: { status: "running" },
      boardWizardIdentity: { version: "board-wizard-identity-lifecycle/v1", state: "held", reason } }) });
    const body = await (await response()).json();
    expect(body).toMatchObject({ state: "held", percent: 20, spotsDone: 0, spotsTotal: 27, pending: false, done: false,
      qaPreviewUrl: null, qaBoards: null, playUrl: null, place: null, milestones: { character: "done", hiding: "todo", assemble: "todo", check: "todo" } });
    expect(mocks.job).toHaveBeenCalledOnce(); expect(mocks.link).not.toHaveBeenCalled(); expect(mocks.wizard).not.toHaveBeenCalled();
  });
  it("does not mark an uncreated identity complete when the pre-enrollment request was held", async () => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "collage-v1" }); mocks.asset.mockResolvedValue(null);
    mocks.job.mockResolvedValue({ gameId: game.id, status: "DONE", stepsJson: JSON.stringify({
      boardWizardIdentity: { version: "board-wizard-identity-lifecycle/v1", state: "held", reason: "unresolved-identity" } }) });
    expect(await (await response()).json()).toMatchObject({ state: "held", percent: 4, spotsDone: 0, spotsTotal: 27, avatarUrl: null,
      milestones: { character: "todo", hiding: "todo", assemble: "todo", check: "todo" } });
  });
  it.each(["absent", "malformed", "wrong-game", "running-job", "wrong-version", "not-held", "unknown-reason"])("keeps normal legacy manual-review semantics for %s identity metadata", async kind => {
    mocks.game.mockResolvedValue({ ...game, status: "MANUAL_REVIEW", styleVersion: "collage-v1" });
    const marker = { version: kind === "wrong-version" ? "unknown/v1" : "board-wizard-identity-lifecycle/v1",
      state: kind === "not-held" ? "running" : "held", reason: kind === "unknown-reason" ? "other" : "identity-style-review-required" };
    mocks.job.mockResolvedValue({ gameId: kind === "wrong-game" ? "other" : game.id, status: kind === "running-job" ? "RUNNING" : "DONE",
      stepsJson: kind === "malformed" ? "not json" : JSON.stringify(kind === "absent" ? {} : { boardWizardIdentity: marker }) });
    expect(await (await response()).json()).toMatchObject({ state: "awaiting_review", percent: 96, pending: false, qaPreviewUrl: null });
    expect(mocks.job).toHaveBeenCalledOnce();
  });
});
