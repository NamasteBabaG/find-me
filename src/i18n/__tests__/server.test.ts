import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCountry, getCurrency, getLocale } from "../server";
import { COUNTRY_COOKIE } from "../server";
import { LOCALE_COOKIE } from "../config";

const state = vi.hoisted(() => ({ cookies: new Map<string,string>(), headers: new Map<string,string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined }),
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}));

beforeEach(() => { state.cookies.clear(); state.headers.clear(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("DEFAULT_COUNTRY", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("location chooses currency; language chooses copy", () => {
  it.each([
    ["IL", "he", "ILS"], ["IL", "en", "ILS"],
    ["US", "he", "USD"], ["US", "en", "USD"],
  ])("%s visitor with %s language pays %s", async (country, locale, currency) => {
    state.headers.set("x-vercel-ip-country", country);
    state.cookies.set(LOCALE_COOKIE, locale);
    expect(await getCurrency()).toBe(currency);
    expect(await getLocale()).toBe(locale);
  });
  it("cannot change real deployment pricing through a country cookie or a lower-priority header", async () => {
    state.headers.set("x-vercel-ip-country", "US");
    state.headers.set("x-country", "IL");
    state.cookies.set(COUNTRY_COOKIE, "IL");
    state.cookies.set(LOCALE_COOKIE, "he");
    expect(await getCountry()).toBe("US");
    expect(await getCurrency()).toBe("USD");
  });
  it("supports local-only geographic simulations without tying them to language", async () => {
    vi.stubEnv("NODE_ENV", "development");
    state.cookies.set(COUNTRY_COOKIE, "il");
    state.cookies.set(LOCALE_COOKIE, "en");
    expect(await getCurrency()).toBe("ILS");
    expect(await getLocale()).toBe("en");
  });
  it("falls back to USD on unknown location, even for explicit Hebrew", async () => {
    state.cookies.set(LOCALE_COOKIE, "he");
    expect(await getCurrency()).toBe("USD");
  });
});
