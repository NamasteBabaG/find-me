import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Currency, type Locale } from "./config";
import { getDict, type Dictionary } from "./index";

export const COUNTRY_COOKIE = "findme_country";

/**
 * Visitor country (ISO-3166 alpha-2, upper case). Order: dev/test override
 * cookie → Vercel edge header → Cloudflare header → DEFAULT_COUNTRY env → "".
 */
export async function getCountry(): Promise<string> {
  // The override cookie is a dev/QA tool only: in production it would let a visitor pick their own currency.
  if (process.env.NODE_ENV !== "production") {
    const jar = await cookies();
    const override = jar.get(COUNTRY_COOKIE)?.value;
    if (override && /^[A-Za-z]{2}$/.test(override)) return override.toUpperCase();
  }
  const h = await headers();
  const fromEdge = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? h.get("x-country");
  if (fromEdge && /^[A-Za-z]{2}$/.test(fromEdge)) return fromEdge.toUpperCase();
  return (process.env.DEFAULT_COUNTRY ?? "").toUpperCase();
}

/** Currency follows the visitor's location, not the UI language: Israel pays in ₪, everyone else in USD. */
export async function getCurrency(): Promise<Currency> {
  return (await getCountry()) === "IL" ? "ILS" : "USD";
}

/**
 * Server-side locale resolution. Order: cookie (the parent's explicit choice)
 * → visitor country (Israel ⇒ Hebrew) → default (en).
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  return (await getCountry()) === "IL" ? "he" : DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDict(locale) };
}
