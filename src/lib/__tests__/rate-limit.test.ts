import { describe, expect, it } from "vitest";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";

describe("rate limit", () => {
  it("allows up to the limit, then refuses until the window rolls", () => {
    const t0 = 1_000_000;
    const key = `t1:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000, t0).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(60);
    expect(rateLimit(key, 3, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("counts each caller separately", () => {
    const t0 = 2_000_000;
    const a = `t2a:${Math.random()}`;
    const b = `t2b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000, t0).ok).toBe(true);
    expect(rateLimit(a, 1, 60_000, t0).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000, t0).ok).toBe(true);
  });

  it("takes the client from the first forwarded hop, and buckets unknown callers together", () => {
    const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(callerKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "photo")).toBe("photo:203.0.113.7");
    expect(callerKey(req({ "x-real-ip": "203.0.113.9" }), "photo")).toBe("photo:203.0.113.9");
    expect(callerKey(req({}), "photo")).toBe("photo:unknown");
  });
});
