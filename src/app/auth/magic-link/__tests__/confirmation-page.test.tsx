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
import MagicLinkConfirmation from "../confirm/page";

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.cookie = createMagicConfirmation("synthetic-confirmation-secret", "synthetic-token");
  mocks.inspect.mockReset().mockResolvedValue({ email: "account@example.invalid" });
  mocks.locale = "en";
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit sign-in account choice", () => {
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
});
