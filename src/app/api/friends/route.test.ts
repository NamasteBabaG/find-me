import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestSharingError, emptyGuestSnapshot } from "@/domain/guest-sharing";
const f = vi.hoisted(() => ({ user: vi.fn(), get: vi.fn(), set: vi.fn(), session: vi.fn(), context: vi.fn(), manage: vi.fn(), report: vi.fn(), join: vi.fn(), play: vi.fn(), progress: vi.fn(), email: vi.fn(), ordinaryAsset: vi.fn(), media: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: f.get, set: f.set }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, SESSION_COOKIE: "findme_session", isAdminEmail: () => false }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/rate-limit", () => ({ callerKey: () => "synthetic", rateLimit: () => ({ ok: true }), tooManyRequests: () => new Response(null, { status: 429 }) }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { session: { findUnique: f.session }, game: { findUnique: f.context } } }) }));
vi.mock("@/services/auth.service", () => ({ requestMagicLink: f.email }));
vi.mock("@/services/asset.service", () => ({ readAsset: f.ordinaryAsset }));
vi.mock("@/services/guest-sharing.service", async importOriginal => ({ ...await importOriginal<object>(), manageGuestShare: f.manage, guestOwnerReport: f.report, guestSession: f.join, guestPlay: f.play, saveGuestProgress: f.progress, guestMedia: f.media }));
import { POST as share } from "./share/route";
import { POST as report } from "./report/route";
import { POST as session } from "./session/route";
import { POST as play } from "./play/route";
import { POST as progress } from "./progress/route";
import { GET as asset } from "../assets/[assetId]/route";
const shareId = "gsr_" + "a".repeat(20), participantId = "gpt_" + "b".repeat(20), token = shareId + "." + "c".repeat(43);
const request = (path: string, body: unknown, origin = "http://localhost:3107") => new Request(`http://localhost:3107/api/friends/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
const ownerBody = { gameId: "synthetic-game", worldSlug: "world-1" };
beforeEach(() => {
  vi.clearAllMocks(); f.user.mockResolvedValue({ id: "owner-from-session", email: "synthetic@example.invalid" });
  f.get.mockImplementation((name: string) => ({ value: name === "findme_session" ? "session-credential" : participantId + "." + "d".repeat(43) }));
  f.session.mockResolvedValue({ userId: "owner-from-session", createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
  f.manage.mockResolvedValue({ share: null, url: null }); f.report.mockResolvedValue({ participants: [] });
  f.progress.mockResolvedValue({ participant: { id: participantId, revision: 1, snapshot: emptyGuestSnapshot() }, changed: false });
  f.join.mockResolvedValue({ view: { shareId, participant: null } }); f.play.mockResolvedValue({ config: {} });
});
describe("friends API authentication and privacy boundary", () => {
  it("requires same-origin POST for every mutation/read capability", async () => {
    for (const handler of [share, report, session, play, progress]) expect((await handler(request("any", {}, "https://foreign.invalid"))).status).toBe(403);
    expect(f.manage).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
  });
  it("parent authority always comes from the session; owner body injection is rejected", async () => {
    expect((await share(request("share", { ...ownerBody, operation: "status", ownerId: "injected" }))).status).toBe(400);
    await share(request("share", { ...ownerBody, operation: "status" }));
    expect(f.manage).toHaveBeenCalledWith(expect.anything(), "owner-from-session", { ...ownerBody, operation: "status" });
    f.user.mockResolvedValue(null);
    expect((await report(request("report", ownerBody))).status).toBe(401);
  });
  it("create/rotate/revoke/removal need fresh parent auth and explicit consent for new grants", async () => {
    f.session.mockResolvedValue({ userId: "owner-from-session", createdAt: new Date(Date.now() - 11 * 60_000), expiresAt: new Date(Date.now() + 3600_000) });
    for (const operation of ["create", "rotate", "revoke"]) expect(await (await share(request("share", { ...ownerBody, operation, consent: true }))).json()).toMatchObject({ needsAdult: true });
    expect(await (await report(request("report", { ...ownerBody, operation: "remove", removeParticipantId: participantId }))).json()).toMatchObject({ needsAdult: true });
    expect(f.manage).not.toHaveBeenCalled(); expect(f.report).not.toHaveBeenCalled();
    f.session.mockResolvedValue({ userId: "owner-from-session", createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
    expect((await share(request("share", { ...ownerBody, operation: "create" }))).status).toBe(403);
    await share(request("share", { ...ownerBody, operation: "create", consent: true })); expect(f.manage).toHaveBeenCalledOnce(); expect(f.email).not.toHaveBeenCalled();
  });
  it("guest sessions set only scoped HttpOnly cookies and reject arbitrary nickname/free text", async () => {
    expect((await session(request("session", { shareToken: token, operation: "start", nicknameId: "custom real name" }))).status).toBe(400);
    f.join.mockResolvedValue({ view: { shareId, participant: { id: participantId } }, cookie: { name: `findme_friend_${shareId}`, value: "opaque-cookie", expires: new Date(Date.now() + 3600_000) } });
    const response = await session(request("session", { shareToken: token, operation: "start", nicknameId: "fox", joinKey: "a".repeat(36) }));
    expect(response.status).toBe(200); expect(f.set).toHaveBeenCalledWith(`findme_friend_${shareId}`, "opaque-cookie", expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
    expect(JSON.stringify(await response.json())).not.toContain("opaque-cookie");
  });
  it("play/progress require an explicit participant and return 409 for an old tab without revealing another identity", async () => {
    expect((await play(request("play", { shareToken: token }))).status).toBe(400);
    expect((await progress(request("progress", { shareToken: token, snapshot: emptyGuestSnapshot() }))).status).toBe(400);
    f.play.mockRejectedValue(new GuestSharingError("conflict"));
    const result = await play(request("play", { shareToken: token, participantId }));
    expect(result.status).toBe(409); expect(await result.json()).toEqual({ ok: false, code: "conflict" });
    expect(result.headers.get("cache-control")).toContain("no-store"); expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("progress acknowledges the durable snapshot for client retry and seen cannot acknowledge an unbounded list", async () => {
    const result = await progress(request("progress", { shareToken: token, participantId, snapshot: emptyGuestSnapshot() }));
    expect(await result.json()).toMatchObject({ ok: true, changed: false, snapshot: emptyGuestSnapshot() });
    expect((await report(request("report", { ...ownerBody, operation: "seen", markSeen: Array.from({ length: 101 }, () => ({ shareId, revision: 1 })) }))).status).toBe(400);
  });
  it("a malformed or denied guest asset never falls back to an owner session or normal signed asset", async () => {
    f.ordinaryAsset.mockResolvedValue({ buffer: Buffer.from("should not escape"), mimeType: "image/png", cacheable: true });
    const context = { params: Promise.resolve({ assetId: "synthetic-avatar" }) };
    const malformed = await asset(new Request("http://localhost:3107/api/assets/synthetic-avatar?guestShare=bad&s=valid&e=9999999999"), context);
    expect(malformed.status).toBe(404); expect(f.ordinaryAsset).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
    f.media.mockRejectedValue(new GuestSharingError("unavailable"));
    const denied = await asset(new Request(`http://localhost:3107/api/assets/synthetic-avatar?guestShare=${shareId}&guestParticipant=${participantId}&guestProof=${"p".repeat(43)}&s=valid&e=9999999999`), context);
    expect(denied.status).toBe(404); expect(f.ordinaryAsset).not.toHaveBeenCalled(); expect(denied.headers.get("cache-control")).toContain("no-store");
  });
  it("valid guest media is still no-store; ordinary GAME asset behavior stays separate", async () => {
    f.media.mockResolvedValue({ bytes: Buffer.from("guest illustration"), mimeType: "image/png" });
    const context = { params: Promise.resolve({ assetId: "synthetic-avatar" }) };
    const response = await asset(new Request(`http://localhost:3107/api/assets/synthetic-avatar?guestShare=${shareId}&guestParticipant=${participantId}&guestProof=${"p".repeat(43)}`), context);
    expect(await response.text()).toBe("guest illustration"); expect(response.headers.get("cache-control")).toContain("no-store");
    f.ordinaryAsset.mockResolvedValue({ buffer: Buffer.from("normal illustration"), mimeType: "image/png", cacheable: true });
    const ordinary = await asset(new Request("http://localhost:3107/api/assets/synthetic-avatar?s=valid&e=9999999999"), context);
    expect(await ordinary.text()).toBe("normal illustration"); expect(ordinary.headers.get("cache-control")).toContain("max-age=86400");
  });
});
