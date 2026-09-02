/**
 * Locales. English is the default (LTR); Hebrew is a first-class citizen
 * (RTL). Detection by IP/geo is planned; today the parent switches with the
 * globe button and the choice lives in a cookie. Each game is frozen in the
 * locale it was purchased in (Game.locale) so links behave the same for
 * everyone who opens them.
 */
export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "findme_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "he";
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "he" ? "en" : "he";
}

/** Localized copy inside content files (scenes, body templates). */
export type LocalizedText = Record<Locale, string>;

export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text[DEFAULT_LOCALE];
}

/** Intl-style number/price formatting per locale. Prices are in agorot (ILS). */
export function formatPrice(agorot: number, locale: Locale): string {
  const n = agorot / 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return locale === "he" ? `${s} ₪` : `₪${s}`;
}
