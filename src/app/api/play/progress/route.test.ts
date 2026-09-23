import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
const f = vi.hoisted(() => ({ find: vi.fn(), record: vi.fn(), resolve: vi.fn(), user: vi.fn() }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.find } } }) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user }));
vi.mock("@/services/share-link.service", () => ({ resolvePlayToken: f.resolve }));
vi.mock("@/services/progress.service", async original => ({ ...await original<object>(), recordProgress: f.record }));
import { POST } from "./route";

const config = buildDemoConfig("en");
const scene = config.scenes[0]!;
let game: { id: string; ownerId: string; deletedAt: Date | null; status: string; configJson: string };
const batch = () => ({ gameId: config.gameId, anonymousSessionId: "anon-synthetic", events: [{ eventType: "target_found", sceneSlug: scene.slug, targetId: scene.targets[0]!.id }] });
const send = (data: object) => POST(new Request("https://example.test/api/play/progress", { method: "POST", body: JSON.stringify(data) }));
beforeEach(() => {
  vi.clearAllMocks();
  game = { id: config.gameId, ownerId: "owner", deletedAt: null, status: "DELIVERED", configJson: JSON.stringify(config) };
  f.find.mockImplementation(async () => game); f.user.mockResolvedValue(null); f.resolve.mockResolvedValue({ ok: false });
});
describe("authenticated coarse play telemetry", () => {
  it("does not accept a known game id as authorization", async () => {
    expect((await send(batch())).status).toBe(403); expect(f.record).not.toHaveBeenCalled();
  });
  it("allows the owner", async () => {
    f.user.mockResolvedValue({ id: "owner" });
    expect((await send(batch())).status).toBe(204); expect(f.record).toHaveBeenCalledOnce();
  });
  it("rejects a malformed published config without a 500 or persistence", async () => {
    f.user.mockResolvedValue({ id: "owner" });
    game.configJson = "{}";
    expect((await send(batch())).status).toBe(400);
    expect(f.record).not.toHaveBeenCalled();
  });
  it("refuses a different signed-in parent", async () => {
    f.user.mockResolvedValue({ id: "someone-else" });
    expect((await send(batch())).status).toBe(403); expect(f.record).not.toHaveBeenCalled();
  });
  it("allows a verified player link without passing the token to persistence", async () => {
    f.resolve.mockResolvedValue({ ok: true, game });
    expect((await send({ ...batch(), playToken: "synthetic-token" })).status).toBe(204);
    expect(f.record.mock.calls[0]![1]).not.toHaveProperty("playToken");
  });
  it.each(["revoked", "wrong-game"])("refuses a %s link", async reason => {
    f.resolve.mockResolvedValue(reason === "revoked" ? { ok: false } : { ok: true, game: { id: "other" } });
    expect((await send({ ...batch(), playToken: "synthetic-token" })).status).toBe(403); expect(f.record).not.toHaveBeenCalled();
  });
  it.each(["deleted", "not-ready"])("refuses a %s game even for its owner", async condition => {
    f.user.mockResolvedValue({ id: "owner" });
    if (condition === "deleted") game.deletedAt = new Date(); else game.status = "TARGETS_GENERATING";
    expect((await send(batch())).status).toBe(403); expect(f.record).not.toHaveBeenCalled();
  });
  it.each([
    { eventType: "target_found", sceneSlug: scene.slug, targetId: "imaginary" },
    { eventType: "target_found", sceneSlug: scene.slug },
    { eventType: "scene_started", sceneSlug: "imaginary" },
    { eventType: "hint_used" },
  ])("refuses events outside the published config: %j", async event => {
    f.user.mockResolvedValue({ id: "owner" });
    expect((await send({ ...batch(), events: [event] })).status).toBe(400); expect(f.record).not.toHaveBeenCalled();
  });
});
