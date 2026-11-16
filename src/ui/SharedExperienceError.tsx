"use client";

import { useI18n } from "@/i18n/client";
import { LogoEyes } from "./Icon";

/** Shared links recover in place, without account, checkout or marketing exits. */
export function SharedExperienceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, tf } = useI18n();
  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4 fm-center">
      <span className="fm-logo__mark fm-logo__mark--big" aria-hidden><LogoEyes /></span>
      <h1>{t.appError.title}</h1>
      <p className="fm-lead">{t.play.loadError}</p>
      <button type="button" className="fm-btn" onClick={reset}>{t.appError.retry}</button>
      {error.digest ? <p className="fm-small">{tf(t.appError.reference, { reference: error.digest })}</p> : null}
    </main>
  );
}
