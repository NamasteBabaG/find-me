"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { otherLocale } from "./config";
import { useI18n } from "./client";
import { setLocaleAction } from "./actions";

/** Globe pill in the header: flips en ⇄ he and re-renders the page in place. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = otherLocale(locale);
  return (
    <button
      type="button"
      className="fm-lang"
      aria-label={t.common.switchLangAria}
      title={t.common.switchLangAria}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLocaleAction(next);
          router.refresh();
        })
      }
    >
      <span aria-hidden>🌐</span>
      {compact ? null : <span className="fm-lang__label">{t.common.switchLang}</span>}
    </button>
  );
}
