import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSET_URL_TTL_SECONDS, signedAssetUrl, verifyAssetSignature, withFreshAssetUrls } from "@/services/asset.service";
import { tokenForLink, verifyLinkToken } from "@/services/share-link.service";
import { hmacSign } from "@/lib/ids";
import type { Container } from "@/services/container";

// Only `secret` is read by the signing helpers; the rest of the container is never touched.
const c = { secret: "test-secret-do-not-use" } as Container;
afterEach(() => vi.useRealTimers());

function parts(url: string) {
  const q = new URL(url, "http://x").searchParams;
  return { sig: q.get("s")!, exp: q.get("e")! };
}

describe("asset signatures", () => {
  it("keeps avatar and config URLs stable across polls within a ten-minute bucket", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:00:01Z"));
    const avatar = signedAssetUrl(c, "ast_face");
    const stored = { avatarUrl: "/api/assets/ast_face?e=1&s=old" };
    expect(withFreshAssetUrls(c, stored).avatarUrl).toBe(avatar);
    vi.setSystemTime(new Date("2026-09-06T12:09:59.999Z"));
    expect(signedAssetUrl(c, "ast_face")).toBe(avatar);
    expect(withFreshAssetUrls(c, stored).avatarUrl).toBe(avatar);
  });

  it("refreshes at the boundary without revoking an earlier valid URL or extending TTL", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:09:59Z"));
    const before = signedAssetUrl(c, "ast_face");
    const old = parts(before);
    expect(Number(old.exp) * 1000).toBeLessThanOrEqual(Date.now() + ASSET_URL_TTL_SECONDS * 1000);
    expect(Number(old.exp) * 1000).toBeGreaterThan(Date.now() + (ASSET_URL_TTL_SECONDS - 600) * 1000);
    vi.setSystemTime(new Date("2026-09-06T12:10:00Z"));
    const after = signedAssetUrl(c, "ast_face");
    expect(after).not.toBe(before);
    expect(Number(parts(after).exp) - Number(old.exp)).toBe(600);
    expect(verifyAssetSignature(c, "ast_face", old.sig, old.exp)).toBe(true);
    expect(verifyAssetSignature(c, "ast_face", old.sig, old.exp, Number(old.exp) * 1000 + 1)).toBe(false);
  });

  it("preserves a short custom TTL even near the end of a bucket", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:09:59Z"));
    const url = signedAssetUrl(c, "ast_face", 60);
    const { sig, exp } = parts(url);
    expect(Number(exp) * 1000 - Date.now()).toBe(60_000);
    expect(verifyAssetSignature(c, "ast_face", sig, exp)).toBe(true);
    vi.setSystemTime(new Date("2026-09-06T12:10:00Z"));
    expect(Number(parts(signedAssetUrl(c, "ast_face", 60)).exp) - Number(exp)).toBe(1);
  });

  it("still accepts unbucketed URLs issued by an older deployment", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:00:01Z"));
    const exp = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS;
    const sig = hmacSign(`asset:ast_face:${exp}`, c.secret).slice(0, 32);
    expect(verifyAssetSignature(c, "ast_face", sig, String(exp))).toBe(true);
  });

  it("verifies the signature embedded in signedAssetUrl (/api/assets/<id>?e=<epoch>&s=<32 chars>)", () => {
    const url = signedAssetUrl(c, "ast_abc123");
    const m = /^\/api\/assets\/ast_abc123\?e=(\d+)&s=([A-Za-z0-9_-]{32})$/.exec(url);
    expect(m).not.toBeNull();
    expect(verifyAssetSignature(c, "ast_abc123", m![2]!, m![1]!)).toBe(true);
  });

  it("rejects missing, tampered, truncated and cross-asset signatures", () => {
    const { sig, exp } = parts(signedAssetUrl(c, "ast_abc123"));
    expect(verifyAssetSignature(c, "ast_abc123", null, exp)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", "", exp)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig, null)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig.slice(0, -1), exp)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", `${sig}x`, exp)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a"), exp)).toBe(false);
    expect(verifyAssetSignature(c, "ast_other", sig, exp)).toBe(false);
    expect(verifyAssetSignature({ secret: "another" }, "ast_abc123", sig, exp)).toBe(false);
  });

  it("expires, and cannot be extended by editing the deadline", () => {
    const { sig, exp } = parts(signedAssetUrl(c, "ast_abc123", 60));
    const justBefore = (Number(exp) - 1) * 1000;
    const justAfter = (Number(exp) + 1) * 1000;
    expect(verifyAssetSignature(c, "ast_abc123", sig, exp, justBefore)).toBe(true);
    expect(verifyAssetSignature(c, "ast_abc123", sig, exp, justAfter)).toBe(false);
    // Pushing the deadline out invalidates the signature: the deadline is signed.
    expect(verifyAssetSignature(c, "ast_abc123", sig, String(Number(exp) + 3600), justAfter)).toBe(false);
  });

  it("re-signs every asset url in a stored config, whatever shape it was written in", () => {
    const stored = {
      child: { avatarUrl: "/api/assets/ast_face?s=stale" },
      scenes: [{ targets: [{ sprite: { url: "/api/assets/ast_one?e=1&s=old" } }, { sprite: { url: "/api/assets/ast_two" } }] }],
      untouched: "/scenes/beach/base.webp",
    };
    const fresh = withFreshAssetUrls(c, stored);
    expect(fresh.untouched).toBe(stored.untouched);
    for (const [url, id] of [
      [fresh.child.avatarUrl, "ast_face"],
      [fresh.scenes[0]!.targets[0]!.sprite.url, "ast_one"],
      [fresh.scenes[0]!.targets[1]!.sprite.url, "ast_two"],
    ] as const) {
      const { sig, exp } = parts(url);
      expect(verifyAssetSignature(c, id, sig, exp)).toBe(true);
      expect(Number(exp) * 1000).toBeGreaterThan(Date.now());
      expect(Number(exp) * 1000).toBeLessThanOrEqual(Date.now() + ASSET_URL_TTL_SECONDS * 1000 + 1000);
    }
  });
});

describe("share-link tokens", () => {
  const link = { id: "shr_abcdefghijklmnopqrst", createdAt: new Date("2026-01-01T00:00:00Z") };

  it("verifies the token it minted (format unchanged: <linkId>.<hmac>)", () => {
    const token = tokenForLink(c, link);
    expect(token.startsWith(`${link.id}.`)).toBe(true);
    expect(verifyLinkToken(c, link, token)).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const token = tokenForLink(c, link);
    expect(verifyLinkToken(c, link, `${token.slice(0, -3)}xyz`)).toBe(false);
    expect(verifyLinkToken(c, link, token.slice(0, -1))).toBe(false);
    expect(verifyLinkToken(c, link, `shr_other.${token.split(".")[1]}`)).toBe(false);
    expect(verifyLinkToken(c, { ...link, createdAt: new Date("2026-01-02T00:00:00Z") }, token)).toBe(false);
    expect(verifyLinkToken(c, link, link.id)).toBe(false);
  });
});
