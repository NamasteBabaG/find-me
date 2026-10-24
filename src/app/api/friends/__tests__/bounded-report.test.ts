import { beforeEach, describe, expect, it, vi } from "vitest";
import { PassportChoiceSchema } from "@/services/passport.service";
import { PASSPORT_DISCOVERIES } from "@/domain/passport/passport";
const f = vi.hoisted(() => ({ parent: vi.fn() }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/rate-limit", () => ({ callerKey: () => "synthetic", rateLimit: () => ({ ok: true }), tooManyRequests: () => Response.json({}, { status: 429 }) }));
vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/lib/server/friends", () => ({ friendOrigin: () => true, friendParent: f.parent, friendJson: (body: unknown, status = 200) => Response.json(body, { status }), friendFailure: () => Response.json({}, { status: 503 }), FRIEND_HEADERS: {} }));
import { POST } from "../report/route";

function oversized(size: number) {
  const values = new Array(size);
  Object.defineProperty(values, 0, { get() { throw Error("Oversized parent input was visited"); } });
  return values;
}
beforeEach(() => vi.clearAllMocks());
describe("parent input collection resource bounds", () => {
  it("rejects oversized friend report acknowledgements before visiting any entry", async () => {
    const req = new Request("https://qa.example.invalid/api/friends/report", { method: "POST" });
    vi.spyOn(req, "json").mockResolvedValue({ gameId: "game-synthetic", worldSlug: "journey", operation: "seen", markSeen: oversized(101) });
    expect((await POST(req)).status).toBe(400);
    expect(f.parent).not.toHaveBeenCalled();
  });
  it("rejects oversized passport discovery acknowledgements before visiting any entry", () => {
    expect(PassportChoiceSchema.safeParse({ kind: "seen", stamp: true, discoveryIds: oversized(PASSPORT_DISCOVERIES + 1) }).success).toBe(false);
  });
  it("preserves the existing valid passport discovery boundary", () => {
    expect(PassportChoiceSchema.safeParse({ kind: "seen", stamp: true, discoveryIds: Array.from({ length: PASSPORT_DISCOVERIES }, (_, i) => "discovery-" + i) }).success).toBe(true);
  });
});
