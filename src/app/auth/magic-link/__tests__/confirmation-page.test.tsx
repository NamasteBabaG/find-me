import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { createMagicConfirmation } from "../challenge";

const mocks = vi.hoisted(() => ({ cookie: undefined as string | undefined, inspect: vi.fn(), locale: "en" as "en" | "he" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined }) }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => {} }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ secret: "synthetic-confirmation-secret" }) }));
vi.mock("@/services/auth.service", () => ({ inspectMagicLink: mocks.inspect }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict(mocks.locale), locale: mocks.locale }) }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => null, SiteFooter: () => null }));
import MagicLinkConfirmation, { metadata } from "../confirm/page";

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.cookie = createMagicConfirmation("synthetic-confirmation-secret", "synthetic-token");
  mocks.inspect.mockReset().mockResolvedValue({ email: "account@example.invalid" });
  mocks.locale = "en";
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit sign-in account choice", () => {
  it("keeps token paths private while allowing a native form to retain its CSRF Origin", () => {
    expect(metadata.referrer).toBe("strict-origin");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
  it.each(["en", "he"] as const)("shows the account and a user-operated POST form in %s", async locale => {
    mocks.locale = locale;
    const html = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: "synthetic-token", next: "/family" }) }));
    expect(html).toContain("account@example.invalid");
    expect(html).toContain(getDict(locale).magicLinkConfirm.lead);
    expect(html).toContain('action="/auth/magic-link" method="post"');
    expect(html).toContain('name="confirmation"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("<script");
  });
  it("cannot offer a sign-in action without browser proof or after a link expires", async () => {
    mocks.cookie = undefined;
    let html = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: "synthetic-token" }) }));
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(html).not.toContain("<form");
    expect(html).not.toContain("account@example.invalid");
    mocks.cookie = createMagicConfirmation("synthetic-confirmation-secret", "synthetic-token");
    mocks.inspect.mockResolvedValue(null);
    html = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: "synthetic-token" }) }));
    expect(html).not.toContain("<form");
    expect(html).toContain(getDict("en").magicLinkConfirm.invalidBody);
  });
  it("treats duplicate query tokens as invalid instead of rendering an ambiguous account choice", async () => {
    const html = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: ["synthetic-token", "other-token"] }) }));
    expect(html).not.toContain("<form");
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("an invalid confirmation offers a new sign-in retaining the selected game, never an external destination", async () => {
    mocks.cookie = undefined;
    const next = "/family/fam_test/play/game_source?board=tokyo&world=journey";
    const html = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: "synthetic-token", next }) }));
    expect(html).not.toContain("<form");
    expect(html).toContain('href="/family?error=expired&amp;next=%2Ffamily%2Ffam_test%2Fplay%2Fgame_source%3Fboard%3Dtokyo%26world%3Djourney"');
    for (const unsafe of ["https://outside.invalid", "//outside.invalid", [next, "/checkout?game=other"]]) {
      const invalid = renderToStaticMarkup(await MagicLinkConfirmation({ searchParams: Promise.resolve({ token: "synthetic-token", next: unsafe }) }));
      expect(invalid).toContain('href="/family?error=expired&amp;next=%2Flibrary"');
      expect(invalid).not.toContain("outside.invalid");
    }
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
