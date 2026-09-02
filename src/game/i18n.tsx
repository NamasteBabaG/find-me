"use client";

import { createContext, useContext, type ReactNode } from "react";
import { dirOf, getDict, tf, type Dictionary, type Locale } from "@/i18n";

/**
 * The game speaks the language it was purchased in (GameConfig.locale),
 * independent of the parent's current site language.
 */
export type GameDict = Dictionary["game"];

interface GameI18n {
  locale: Locale;
  dir: "ltr" | "rtl";
  g: GameDict;
  tf: typeof tf;
}

const Ctx = createContext<GameI18n | null>(null);

export function GameI18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const g = getDict(locale).game;
  return <Ctx.Provider value={{ locale, dir: dirOf(locale), g, tf }}>{children}</Ctx.Provider>;
}

export function useGameText(): GameI18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGameText must be used inside <GameI18nProvider>");
  return v;
}
