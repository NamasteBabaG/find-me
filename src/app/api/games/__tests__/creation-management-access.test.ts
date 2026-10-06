import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  game: vi.fn(), user: vi.fn(), denied: vi.fn(), mail: vi.fn(), photo: vi.fn(), tick: vi.fn(),
  notify: vi.fn(), health: vi.fn(), retention: vi.fn(), token: null as string | null, admin: false,
}));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.game } } }) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: f.denied }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => f.token, isAdminEmail: () => f.admin }));
vi.mock("@/lib/env", () => ({ env: () => ({ CRON_SECRET: "synthetic-cron" }) }));
vi.mock("@/services/create-flow.service", () => ({ replacePhotoForPaidGame: f.photo }));
vi.mock("@/services/publish.service", () => ({ resendGameMail: f.mail }));
vi.mock("@/services/generation/queue", () => ({ tickGeneration: f.tick }));
vi.mock("@/services/admin-alert.service", () => ({ retryFailedAdminAlerts: f.notify }));
vi.mock("@/services/generation-health.service", () => ({ alertStalledGeneration: f.health }));
vi.mock("@/services/retention.service", () => ({ runRetentionIfDue: f.retention }));

import { POST as photo } from "../[gameId]/photo/route";
import { POST as resend } from "../[gameId]/resend/route";
import { POST as tick } from "../../jobs/tick/route";

beforeEach(() => {
  vi.clearAllMocks(); f.token = null; f.admin = false;
  f.denied.mockResolvedValue(null); f.user.mockResolvedValue(null);
  f.game.mockResolvedValue({ ownerId: "owner", draftToken: "synthetic-draft" });
  f.mail.mockResolvedValue({ ok: true }); f.tick.mockResolvedValue({ pending: false });
  f.notify.mockResolvedValue(null); f.health.mockResolvedValue(null); f.retention.mockResolvedValue(null);
});

const routes = [
  { name: "paid photo", forbidden: 404, run: () => {
    const form = new FormData(); form.set("consent", "1");
    return photo(new Request("https://example.invalid/api/games/synthetic/photo", { method: "POST", body: form }), { params: Promise.resolve({ gameId: "synthetic" }) });
  }, accepted: 400 }, // The authorized upload proceeds to its missing-file validation.
  { name: "resend", forbidden: 403, run: () => resend(new Request("https://example.invalid/api/games/synthetic/resend", { method: "POST" }), { params: Promise.resolve({ gameId: "synthetic" }) }), accepted: 200 },
  { name: "game tick", forbidden: 403, run: () => tick(new Request("https://example.invalid/api/jobs/tick?gameId=synthetic", { method: "POST" })), accepted: 200 },
];

describe.each(routes)("$name creation management authorization", route => {
  it.each(["cookie", "owner", "admin"])("preserves %s authority", async authority => {
    f.token = authority === "cookie" ? "synthetic-draft" : "foreign-draft";
    f.user.mockResolvedValue(authority === "owner" ? { id: "owner" } : authority === "admin" ? { id: "admin" } : null);
    f.admin = authority === "admin";
    expect((await route.run()).status).toBe(route.accepted);
    if (route.name === "resend") expect(f.mail).toHaveBeenCalledOnce();
    if (route.name === "game tick") {
      expect(f.tick).toHaveBeenCalledOnce(); expect(f.notify).not.toHaveBeenCalled(); expect(f.health).not.toHaveBeenCalled(); expect(f.retention).not.toHaveBeenCalled();
    }
  });

  it.each(["anonymous", "foreign-owner", "participant"])("preserves its denial response for %s", async authority => {
    f.token = "foreign-draft"; f.user.mockResolvedValue(authority === "anonymous" ? null : { id: authority });
    expect((await route.run()).status).toBe(route.forbidden);
    expect(f.mail).not.toHaveBeenCalled(); expect(f.photo).not.toHaveBeenCalled(); expect(f.tick).not.toHaveBeenCalled();
  });

  it("keeps a missing game distinct from a foreign existing game where applicable", async () => {
    f.game.mockResolvedValue(null);
    expect((await route.run()).status).toBe(route.name === "game tick" ? 403 : 404);
    expect(f.mail).not.toHaveBeenCalled(); expect(f.photo).not.toHaveBeenCalled(); expect(f.tick).not.toHaveBeenCalled();
  });

  it("checks the outer QA gate before looking up private game ownership", async () => {
    f.denied.mockResolvedValue(new Response("qa denied", { status: 401 }));
    expect((await route.run()).status).toBe(401);
    expect(f.game).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
  });
});

it("a verified cron remains independent of game cookies and account ownership", async () => {
  const response = await tick(new Request("https://example.invalid/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer synthetic-cron" } }));
  expect(response.status).toBe(200); expect(f.game).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
  expect(f.tick).toHaveBeenCalledOnce(); expect(f.notify).toHaveBeenCalledOnce(); expect(f.health).toHaveBeenCalledOnce(); expect(f.retention).toHaveBeenCalledOnce();
});
