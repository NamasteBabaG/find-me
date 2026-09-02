import { en, type Dictionary } from "./dictionaries/en";
import { he } from "./dictionaries/he";
import { fillTemplate } from "@/lib/copy";
import type { Locale } from "./config";

export type { Dictionary };
export * from "./config";

const DICTS: Record<Locale, Dictionary> = { en, he };

export function getDict(locale: Locale): Dictionary {
  return DICTS[locale];
}

/** Fill `{placeholders}` in a dictionary string. */
export function tf(template: string, vars: Record<string, string | number>): string {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = String(v);
  return fillTemplate(template, out);
}

/** Locale-aware date for adult UI. */
export function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}
