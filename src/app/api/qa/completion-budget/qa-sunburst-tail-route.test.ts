import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null, admin: { id: "owner-admin" } as { id: string } | null, ownerId: "owner-admin",
  preview: vi.fn(), status: vi.fn(), authorize: vi.fn(), tailPreview: vi.fn(), tailStatus: vi.fn(), tailAuthorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: async () => ({ ownerId: mocks.ownerId }) } } }) }));
vi.mock("@/services/generation/qa-five-dollar-completion", () => ({ previewQaFiveCompletion: mocks.preview,
  qaFiveCompletionStatus: mocks.status, authorizeQaFiveCompletion: mocks.authorize }));
vi.mock("@/services/generation/qa-sunburst-tail-completion", () => ({ previewQaSunburstTailCompletion: mocks.tailPreview,
  qaSunburstTailCompletionStatus: mocks.tailStatus, authorizeQaSunburstTailCompletion: mocks.tailAuthorize }));
import { QA_FIVE_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-five-dollar-completion";
import { QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-sunburst-tail-completion";
import { GET, POST } from "./route";

const base = "https://qa.example.invalid/api/qa/completion-budget", tail = base + "?plan=sunburst-tail-v1", gameId = "synthetic-game";
const input = { gameId, confirmation: QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION, planSha256: "a".repeat(64), ownerAuthorizationSha256: "b".repeat(64) };
const req = (url = tail, form = false, fields: Record<string, string> = input) => new Request(url, { method: "POST",
  headers: { origin: new URL(url).origin, host: new URL(url).host, "content-type": form ? "application/x-www-form-urlencoded" : "application/json" },
  body: form ? new URLSearchParams(fields).toString() : JSON.stringify(fields) });
const ops = [["amazon-detectives-hide-3"], ["greatwall-detectives-hide-1"], ["paris-detectives-hide-1"]].map(([hideId]) => ({
  kind: "journey-source-head-sunburst-tail/v1", hideId, imageReserveMicroUsd: 150_000, reviewCoverageMicroUsd: 250_000, requiredMicroUsd: 400_000 }));

beforeEach(() => {
  vi.clearAllMocks(); mocks.appEnv = "qa"; mocks.denied = null; mocks.admin = { id: "owner-admin" }; mocks.ownerId = "owner-admin";
  mocks.status.mockReset().mockResolvedValue(null); mocks.tailStatus.mockReset().mockResolvedValue(null);
  mocks.tailPreview.mockReset().mockResolvedValue({ ownerId: "owner-admin", gameId, planSha256: input.planSha256, baseCapMicroUsd: 4_000_000,
    capMicroUsd: 5_000_000, committedMicroUsd: 3_738_580, reservedMicroUsd: 411_231, unknownCount: 1, remainingUnderBaseMicroUsd: 261_420,
    requiredMicroUsd: 1_200_000, operations: ops });
  mocks.tailAuthorize.mockReset().mockResolvedValue({ plan: { baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000, requiredMicroUsd: 1_200_000,
    operations: ops.map(op => ({ ...op, rowId: "private-row", requestKey: op.hideId + ":standing:render:2" })) }, authorizationSha256: "c".repeat(64) });
});

describe("Sunburst tail owner action (plan=sunburst-tail-v1)", () => {
  it("previews every named operation and the full reservation without authorizing or exposing the owner", async () => {
    const response = await GET(new Request(tail + "&gameId=" + gameId));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const value = await response.json();
    expect(value).toMatchObject({ ok: true, recorded: false, plan: "sunburst-tail-v1", confirmation: QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION,
      requiredMicroUsd: 1_200_000, capMicroUsd: 5_000_000 });
    expect(value.operations).toHaveLength(3); expect(value).not.toHaveProperty("ownerId");
    expect(mocks.tailAuthorize).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("renders an escaped form listing ALL operations and the total, posting back to the tail selector, with no script", async () => {
    mocks.tailPreview.mockResolvedValue({ ...(await mocks.tailPreview()), operations: [...ops.slice(1), { ...ops[0], hideId: "<img src=x onerror=bad>" }] });
    const response = await GET(new Request(tail + "&gameId=" + gameId + "&view=form")), html = await response.text();
    expect(response.status).toBe(200); expect(response.headers.get("content-security-policy")).toMatch(/default-src 'none'.*form-action 'self'/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(html).toContain('action="/api/qa/completion-budget?plan=sunburst-tail-v1"'); expect(html).toContain('method="post"');
    for (const hide of ["greatwall-detectives-hide-1", "paris-detectives-hide-1"]) expect(html).toContain(hide);
    expect(html).toContain("&lt;img src=x onerror=bad&gt;"); expect(html).not.toContain("<img"); expect(html).not.toContain("<script");
    expect(html).toContain("$1.200000"); expect(html).toContain("$4.938580 of $5.000000");
    expect(html).toContain(QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION); expect(html).not.toContain("owner-admin");
    expect(mocks.tailAuthorize).not.toHaveBeenCalled();
  });
  it("shows a recorded grant's status and operations", async () => {
    mocks.tailStatus.mockResolvedValue({ ownerId: "owner-admin", baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000, requiredMicroUsd: 1_200_000,
      operations: ops.map(({ kind, hideId, requiredMicroUsd }) => ({ kind, hideId, requiredMicroUsd })), status: "active" });
    const value = await (await GET(new Request(tail + "&gameId=" + gameId))).json();
    expect(value).toMatchObject({ ok: true, recorded: true, status: "active", requiredMicroUsd: 1_200_000 });
    expect(value).not.toHaveProperty("ownerId"); expect(mocks.tailPreview).not.toHaveBeenCalled();
  });
  it.each([false, true])("records the frozen tail authority through form=%s without buying anything or leaking rows", async form => {
    const response = await POST(req(tail, form)); expect(response.status).toBe(200);
    expect(mocks.tailAuthorize).toHaveBeenCalledExactlyOnceWith(expect.anything(), { gameId, operatorId: "owner-admin",
      expectedPlanSha256: input.planSha256, ownerAuthorizationSha256: input.ownerAuthorizationSha256 });
    expect(mocks.authorize).not.toHaveBeenCalled();
    const text = await response.text(); expect(text).not.toContain("owner-admin"); expect(text).not.toContain("private-row");
    if (!form) expect(JSON.parse(text)).toMatchObject({ ok: true, plan: "sunburst-tail-v1", capMicroUsd: 5_000_000, requiredMicroUsd: 1_200_000,
      providerCalls: 0, automaticExtension: false });
  });
  it("keeps the confirmations separate: neither plan accepts the other's", async () => {
    expect((await POST(req(tail, false, { ...input, confirmation: QA_FIVE_COMPLETION_CONFIRMATION }))).status).toBe(400);
    expect((await POST(req(base, false, input))).status).toBe(400);
    expect(mocks.tailAuthorize).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("keeps the default plan v1 on both methods", async () => {
    mocks.preview.mockResolvedValue({ ownerId: "owner-admin", gameId, planSha256: input.planSha256, baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000,
      committedMicroUsd: 3_738_580, reservedMicroUsd: 411_231, unknownCount: 1,
      nextOperation: { kind: "journey-source-head-sunburst/v1", hideId: "paris-detectives-hide-1", requiredMicroUsd: 400_000, remainingUnderBaseMicroUsd: 261_420 } });
    mocks.authorize.mockResolvedValue({ plan: { baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000 }, authorizationSha256: "c".repeat(64) });
    expect(await (await GET(new Request(base + "?gameId=" + gameId))).json()).toMatchObject({ confirmation: QA_FIVE_COMPLETION_CONFIRMATION });
    expect((await POST(req(base, false, { ...input, confirmation: QA_FIVE_COMPLETION_CONFIRMATION }))).status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledOnce(); expect(mocks.tailPreview).not.toHaveBeenCalled(); expect(mocks.tailAuthorize).not.toHaveBeenCalled();
  });
  it.each(["?plan=other", "?plan=sunburst-tail-v1&plan=sunburst-tail-v1", "?plan="])("refuses the unknown selector %s on both methods", async query => {
    expect((await GET(new Request(base + query + "&gameId=" + gameId))).status).toBe(400);
    expect((await POST(req(base + query))).status).toBe(400);
    expect(mocks.tailAuthorize).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it.each(["production", "gate-denied", "no-admin", "other-owner", "cross-origin", "no-origin", "cross-site"])("refuses %s before authorizing", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "gate-denied") mocks.denied = new Response("gate", { status: 401 });
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "other-owner") mocks.ownerId = "someone-else";
    const request = req();
    if (mode === "cross-origin") request.headers.set("origin", "https://attacker.invalid");
    if (mode === "no-origin") request.headers.delete("origin");
    if (mode === "cross-site") request.headers.set("sec-fetch-site", "cross-site");
    expect((await POST(request)).status).toBeGreaterThanOrEqual(400); expect(mocks.tailAuthorize).not.toHaveBeenCalled();
    if (mode !== "cross-origin" && mode !== "no-origin" && mode !== "cross-site") {
      expect((await GET(new Request(tail + "&gameId=" + gameId))).status).toBeGreaterThanOrEqual(400); expect(mocks.tailPreview).not.toHaveBeenCalled();
    }
  });
  it.each(["bad-hash", "extra-field", "duplicate-field", "oversized", "false-length", "text-plain"])("rejects %s without changing authority", async mode => {
    const body = new URLSearchParams(input);
    if (mode === "bad-hash") body.set("planSha256", "invalid");
    if (mode === "extra-field") body.set("operations", "4");
    if (mode === "duplicate-field") body.append("gameId", "another-game");
    if (mode === "oversized" || mode === "false-length") body.set("ownerAuthorizationSha256", "a".repeat(5000));
    const request = req(tail, true); Object.defineProperty(request, "body", { value: new Request(base, { method: "POST", body: body.toString() }).body });
    if (mode === "false-length") request.headers.set("content-length", "3");
    if (mode === "text-plain") request.headers.set("content-type", "text/plain");
    expect((await POST(request)).status).toBe(400); expect(mocks.tailAuthorize).not.toHaveBeenCalled();
  });
  it("returns only a coarse refusal code", async () => {
    mocks.tailAuthorize.mockRejectedValue(Error("QA_SUNBURST_TAIL: Sunburst tail plan changed before authorization: private details"));
    const response = await POST(req()); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "PLAN_CHANGED" });
    mocks.tailPreview.mockRejectedValue(Error("private planner detail"));
    const page = await (await GET(new Request(tail + "&gameId=" + gameId + "&view=form"))).text();
    expect(page).toContain("Nothing was changed"); expect(page).not.toContain("private planner detail");
  });
});
