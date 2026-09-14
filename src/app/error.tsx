"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Last-resort boundary. Anything unexpected shows a calm page with a way back
 * instead of Next's raw "server-side exception" text.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, tf } = useI18n();
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4 fm-center">
      <span className="fm-pill">🙈</span>
      <h1>{t.appError.title}</h1>
      <p className="fm-lead">{t.appError.lead}</p>
      <div className="fm-row fm-row--center">
        <button type="button" className="fm-btn" onClick={reset}>
          {t.appError.retry}
        </button>
        <Link href="/library" className="fm-btn fm-btn--secondary">
          {t.common.myGames}
        </Link>
        <Link href="/" className="fm-btn fm-btn--ghost">{t.common.home}</Link>
      </div>
      {error.digest ? <p className="fm-small">{tf(t.appError.reference, { reference: error.digest })}</p> : null}
    </main>
  );
}
