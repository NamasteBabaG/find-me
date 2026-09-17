import { beforeEach, describe, expect, it, vi } from "vitest";
const rig = vi.hoisted(() => ({ user: { id: "owner", email: "owner@example.invalid" } as { id: string; email: string } | null, owner: true, createdAt: new Date(), sessionId: "session-a", manage: vi.fn(), preview: vi.fn(), reauth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "test-session-token" }) }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => rig.user, SESSION_COOKIE: "findme_session" }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/rate-limit", () => ({ callerKey: () => "test", rateLimit: () => ({ ok: true }), tooManyRequests: () => new Response(null, { status: 429 }) }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ secret: "test-secret", db: { familyChild: { count: async () => Number(rig.owner) }, session: { findUnique: async () => ({ id: rig.sessionId, userId: "owner", createdAt: rig.createdAt, expiresAt: new Date(Date.now() + 3600_000) }) } } }) }));
vi.mock("@/services/passport-share.service", () => ({ managePassportShare: rig.manage, passportSharePreview: rig.preview }));
vi.mock("@/services/auth.service", () => ({ requestMagicLink: rig.reauth }));
import { POST } from "./route";
const childId = "fam_12345678901234567890";
const send = (operation: string, extra: Record<string, unknown> = {}, origin = "http://localhost:3022") => POST(new Request("http://localhost:3022/api/passport/share", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ childId, operation, locale: "en", ...extra }) }));
beforeEach(() => { rig.user = { id: "owner", email: "owner@example.invalid" }; rig.owner = true; rig.createdAt = new Date(); rig.sessionId = "session-a"; vi.clearAllMocks(); rig.manage.mockResolvedValue({ active: true }); rig.preview.mockResolvedValue({ name: "Little explorer", worlds: [] }); });

describe("parent-only passport sharing route", () => {
  it("rejects cross-origin, missing session and another family's child before sharing", async () => {
    expect((await send("enable", {}, "https://other.example")).status).toBe(403);
    rig.user = null; expect((await send("status")).status).toBe(401);
    rig.user = { id: "owner", email: "owner@example.invalid" }; rig.owner = false;
    expect((await send("status")).status).toBe(404); expect(rig.manage).not.toHaveBeenCalled();
  });
  it("an old session must reauthenticate, but can always revoke", async () => {
    rig.createdAt = new Date(Date.now() - 11 * 60_000);
    expect(await (await send("preview")).json()).toMatchObject({ needsAdult: true });
    expect(rig.preview).not.toHaveBeenCalled();
    expect((await send("revoke")).status).toBe(200);
    expect(rig.manage).toHaveBeenCalledOnce();
  });
  it("enable needs both explicit consent and a recent preview bound to this session/child/language", async () => {
    expect((await send("enable", { consent: true })).status).toBe(403);
    const { previewToken } = await (await send("preview")).json();
    expect((await send("enable", { previewToken })).status).toBe(403);
    expect((await send("enable", { consent: true, previewToken, locale: "he" })).status).toBe(403);
    expect((await send("enable", { consent: true, previewToken, childId: "fam_09876543210987654321" })).status).toBe(403);
    rig.sessionId = "session-b";
    expect((await send("enable", { consent: true, previewToken })).status).toBe(403);
    rig.sessionId = "session-a";
    expect((await send("enable", { consent: true, previewToken })).status).toBe(200);
    expect(rig.manage).toHaveBeenCalledOnce();
  });
  it("an expired preview cannot authorize rotation", async () => {
    const now = vi.spyOn(Date, "now"); const time = new Date().getTime(); now.mockReturnValue(time);
    try {
      const { previewToken } = await (await send("preview")).json();
      now.mockReturnValue(time + 301_000);
      expect((await send("rotate", { consent: true, previewToken })).status).toBe(403);
      expect(rig.manage).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  });
});
