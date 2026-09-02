import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { getDict, type Dictionary } from "./index";

/**
 * Server-side locale resolution. Order: cookie → default (en).
 * Geo/IP detection will slot in here (Vercel's `x-vercel-ip-country` header
 * → "IL" ⇒ he) without touching any page.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDict(locale) };
}
