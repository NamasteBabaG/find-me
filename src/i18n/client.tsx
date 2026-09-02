"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "./dictionaries/en";
import { dirOf, type Locale } from "./config";
import { tf } from "./index";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Dictionary;
  tf: typeof tf;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, dir: dirOf(locale), t: dict, tf }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}
