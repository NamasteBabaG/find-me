import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ appEnv: "production", container: vi.fn(), read: vi.fn(), attach: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv, PURCHASING_ENABLED: "off" }) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/services/container", () => ({ getContainer: f.container }));
vi.mock("@/services/create-flow.service", () => ({ attachPhoto: f.attach, draftBelongsTo: () => true }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, draftTokenFromCookie: async () => "synthetic-token" }));
vi.mock("@/lib/server/rate-limit", () => ({ LIMITS: { photoUpload: { limit: 12, windowMs: 600000 } }, callerKey: () => "synthetic", rateLimit: () => ({ ok: true }) }));
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks(); f.appEnv = "production";
  f.container.mockReturnValue({ db: { game: { findUnique: f.read } } });
  f.read.mockResolvedValue({ id: "synthetic-draft", deletedAt: null });
});

describe("prelaunch draft photo upload", () => {
  it("returns a typed closed state before multipart parsing, storage or database access", async () => {
    const req = new Request("https://production.example.invalid/api/drafts/photo", { method: "POST", body: "not multipart" });
    const parse = vi.spyOn(req, "formData");
    const res = await POST(req);
    expect(res.status).toBe(503); expect(await res.json()).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(parse).not.toHaveBeenCalled(); expect(f.container).not.toHaveBeenCalled(); expect(f.attach).not.toHaveBeenCalled();
  });

  it.each(["qa", "development"])("%s retains the multipart/consent flow", async appEnv => {
    f.appEnv = appEnv;
    const form = new FormData(); form.set("consent", "1");
    const res = await POST(new Request("https://qa.example.invalid/api/drafts/photo", { method: "POST", body: form }));
    expect(res.status).toBe(400); expect(await res.json()).toMatchObject({ code: "NO_FILE" });
    expect(f.read).toHaveBeenCalledOnce(); expect(f.attach).not.toHaveBeenCalled();
  });
});
