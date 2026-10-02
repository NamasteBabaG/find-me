import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalPath } from "../safe-redirect";

const mocks = vi.hoisted(() => ({ consume: vi.fn(), inspect: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ secret: "synthetic-confirmation-secret", appUrl: "https://qa.findmeworlds.com" }) }));
vi.mock("@/services/auth.service", () => ({ consumeMagicLink: mocks.consume, inspectMagicLink: mocks.inspect }));
vi.mock("@/lib/server/session", () => ({ setSessionCookie: mocks.setCookie }));
afterEach(() => vi.unstubAllEnvs());

describe("local return URLs", () => {
  it.each(["//outside.test", "/\\outside.test", "https://outside.test", "/\n/outside.test", "/\t/outside.test", "relative", ""])("refuses %j", (value) => {
    expect(safeLocalPath(value, "/library")).toBe("/library");
  });
  it("preserves a local path, query and hash, and normalizes dot segments", () => {
    expect(safeLocalPath("/a/../library?tab=games#item")).toBe("/library?tab=games#item");
  });
  it("the magic-link confirmation cannot inherit an external return destination", async () => {
    vi.stubEnv("APP_ENV", "production");
    mocks.inspect.mockResolvedValue({ email: "synthetic@example.invalid" });
    const { GET } = await import("@/app/auth/magic-link/route");
    for (const next of ["/\\outside.test", "/\n/outside.test", "//outside.test"]) {
      const url = new URL("https://qa.findmeworlds.com/auth/magic-link");
      url.searchParams.set("token", "synthetic-valid-token");
      url.searchParams.set("next", next);
      const location = new URL((await GET(new Request(url))).headers.get("location")!);
      expect(location.pathname).toBe("/auth/magic-link/confirm");
      expect(location.searchParams.get("next")).toBe("/library");
    }
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("keeps the safe destination and the expired-token fallback", async () => {
    vi.stubEnv("APP_ENV", "production");
    const { GET } = await import("@/app/auth/magic-link/route");
    const req = () => new Request("https://qa.findmeworlds.com/auth/magic-link?token=synthetic&next=%2Flibrary%3Ftab%3Dgames");
    mocks.inspect.mockResolvedValue({ email: "synthetic@example.invalid" });
    expect(new URL((await GET(req())).headers.get("location")!).searchParams.get("next")).toBe("/library?tab=games");
    mocks.inspect.mockResolvedValue(null);
    expect((await GET(req())).headers.get("location")).toBe("https://qa.findmeworlds.com/library?error=expired");
  });
});
