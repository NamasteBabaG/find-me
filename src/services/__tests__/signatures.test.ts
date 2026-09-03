import { describe, expect, it } from "vitest";
import { signedAssetUrl, verifyAssetSignature } from "@/services/asset.service";
import { tokenForLink, verifyLinkToken } from "@/services/share-link.service";
import type { Container } from "@/services/container";

// Only `secret` is read by the signing helpers; the rest of the container is never touched.
const c = { secret: "test-secret-do-not-use" } as Container;

describe("asset signatures", () => {
  it("verifies the signature embedded in signedAssetUrl (format unchanged: /api/assets/<id>?s=<32 chars>)", () => {
    const url = signedAssetUrl(c, "ast_abc123");
    const m = /^\/api\/assets\/ast_abc123\?s=([A-Za-z0-9_-]{32})$/.exec(url);
    expect(m).not.toBeNull();
    expect(verifyAssetSignature(c, "ast_abc123", m![1]!)).toBe(true);
  });

  it("rejects missing, tampered, truncated and cross-asset signatures", () => {
    const sig = new URL(signedAssetUrl(c, "ast_abc123"), "http://x").searchParams.get("s")!;
    expect(verifyAssetSignature(c, "ast_abc123", null)).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", "")).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig.slice(0, -1))).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig + "x")).toBe(false);
    expect(verifyAssetSignature(c, "ast_abc123", sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(verifyAssetSignature(c, "ast_other", sig)).toBe(false);
    expect(verifyAssetSignature({ secret: "another" }, "ast_abc123", sig)).toBe(false);
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
