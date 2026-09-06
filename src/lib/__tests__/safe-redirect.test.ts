import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalPath } from "../safe-redirect";

const mocks = vi.hoisted(() => ({ consume: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/auth.service", () => ({ consumeMagicLink: mocks.consume }));
vi.mock("@/lib/server/session", () => ({ setSessionCookie: mocks.setCookie }));
afterEach(() => vi.unstubAllEnvs());

describe("local return URLs", () => {
  it.each(["//outside.test", "/\\outside.test", "https://outside.test", "/\n/outside.test", "/\t/outside.test", "relative", ""])("refuses %j", (value) => {
    expect(safeLocalPath(value, "/library")).toBe("/library");
  });
  it("preserves a local path, query and hash, and normalizes dot segments", () => {
    expect(safeLocalPath("/a/../library?tab=games#item")).toBe("/library?tab=games#item");
  });
  it("the real magic-link handler cannot redirect outside after consuming a VALID token", async () => {
    vi.stubEnv("APP_ENV", "production");
    mocks.consume.mockResolvedValue({ sessionToken: "synthetic-session", expiresAt: new Date() });
    mocks.setCookie.mockResolvedValue(undefined);
    const { GET } = await import("@/app/auth/magic-link/route");
    for (const next of ["/\\outside.test", "/\n/outside.test", "//outside.test"]) {
      const url = new URL("https://qa.findmeworlds.com/auth/magic-link");
      url.searchParams.set("token", "synthetic-valid-token");
      url.searchParams.set("next", next);
      expect((await GET(new Request(url))).headers.get("location")).toBe("https://qa.findmeworlds.com/library");
    }
    expect(mocks.setCookie).toHaveBeenCalled();
  });
  it("keeps the safe destination and the expired-token fallback", async () => {
    vi.stubEnv("APP_ENV", "production");
    const { GET } = await import("@/app/auth/magic-link/route");
    const req = () => new Request("https://qa.findmeworlds.com/auth/magic-link?token=synthetic&next=%2Flibrary%3Ftab%3Dgames");
    mocks.consume.mockResolvedValue({ sessionToken: "synthetic-session", expiresAt: new Date() });
    expect((await GET(req())).headers.get("location")).toBe("https://qa.findmeworlds.com/library?tab=games");
    mocks.consume.mockResolvedValue(null);
    expect((await GET(req())).headers.get("location")).toBe("https://qa.findmeworlds.com/library?error=expired");
  });
});
