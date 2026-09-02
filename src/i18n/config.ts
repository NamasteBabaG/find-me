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

/** The currency follows the language for now: Hebrew site → ILS, English site → USD. (Geo detection will refine this.) */
export function currencyFor(locale: Locale): import("@/domain/package").Currency {
  return locale === "he" ? "ILS" : "USD";
}

/** Single implementation lives in the domain; re-exported so UI code can import money helpers next to `tf`/`pick`. */
export { formatMoney, type Currency } from "@/domain/package";
