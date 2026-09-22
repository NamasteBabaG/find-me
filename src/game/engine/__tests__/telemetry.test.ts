// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Telemetry } from "../telemetry";
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });
it("sends the verified player capability only to its same-origin endpoint", () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  const telemetry = new Telemetry("game", true, "synthetic-capability");
  telemetry.track({ eventType: "scene_completed", sceneSlug: "board" });
  expect(fetcher).toHaveBeenCalledWith("/api/play/progress", expect.anything());
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({ gameId: "game", playToken: "synthetic-capability" });
  expect(window.localStorage.getItem("synthetic-capability")).toBeNull();
});
it("does not send demo telemetry", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  new Telemetry("demo", false).track({ eventType: "scene_completed", sceneSlug: "board" });
  expect(fetcher).not.toHaveBeenCalled();
});
