import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  game: vi.fn(), asset: vi.fn(), job: vi.fn(), user: vi.fn(), denied: vi.fn(), link: vi.fn(), proof: vi.fn(), hash: vi.fn(), wizard: vi.fn(), ledger: vi.fn(),
}));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: mocks.denied }));
vi.mock("@/lib/server/session", () => ({ currentUser: mocks.user, draftTokenFromCookie: async () => null, isAdminEmail: () => false }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: mocks.game }, asset: { findUnique: mocks.asset }, generationJob: { findUnique: mocks.job }, worldBudgetLedger: { findUnique: mocks.ledger } }, email: { id: "console" } }) }));
vi.mock("@/services/generation/board-conditioned-wizard", () => ({ BOARD_WIZARD_STYLE: "fixed-sprite-board-wizard-v1", readBoardWizard: mocks.wizard }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "qa" }) }));
vi.mock("@/services/share-link.service", () => ({ ensurePlayerLink: mocks.link }));
vi.mock("@/services/asset.service", () => ({ signedAssetUrl: () => "/synthetic-avatar" }));
vi.mock("@/services/generation/pipeline", () => ({ RESUMABLE_STATUSES: ["PAID", "TARGETS_GENERATING", "QA_PENDING", "GENERATION_FAILED"] }));
vi.mock("@/services/generation/fixed-world-stage-record", () => ({
  FIXED_WORLD_STYLE_VERSION: "fixed-sprite-v3", isFixedWorldStyle: (s: string) => s.startsWith("fixed-sprite-"),
  readFixedWorldStage: mocks.proof, fixedWorldConfigSha256: mocks.hash,
}));
import { GET } from "./route";

// Boundary wiring tests; actual strict capsules/SQLite are tested by staging.
const game = { id: "synthetic", ownerId: "owner", childProfileId: "child", styleVersion: "fixed-sprite-v3", status: "QA_PENDING", locale: "en", deletedAt: null,
  configJson: null as string | null, childProfile: { avatarAssetId: "avatar" }, scenes: [] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.denied.mockResolvedValue(null); mocks.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
  mocks.game.mockResolvedValue({ ...game }); mocks.asset.mockResolvedValue({ status: "READY" });
  mocks.job.mockResolvedValue({ gameId: game.id, status: "DONE", stepsJson: "{}" });
  mocks.proof.mockReturnValue(null); mocks.hash.mockReturnValue("synthetic-hash"); mocks.link.mockResolvedValue({ url: "/synthetic-play" });
  mocks.ledger.mockResolvedValue(null);
});
async function response() { return GET(new Request("https://example.invalid/api/games/synthetic/status"), { params: Promise.resolve({ gameId: "synthetic" }) }); }
function assembled(status = "MANUAL_REVIEW") {
  mocks.game.mockResolvedValue({ ...game, status, configJson: "{}" });
  mocks.proof.mockReturnValue({ state: "staged", gameId: game.id, ownerId: game.ownerId, childProfileId: game.childProfileId, configSha256: "synthetic-hash" });
}

describe("fixed-world creation status boundary", () => {
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
