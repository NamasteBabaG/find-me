"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Last-resort boundary. Anything unexpected shows a calm page with a way back
 * instead of Next's raw "server-side exception" text.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4 fm-center">
      <span className="fm-pill">🙈</span>
      <h1>Something went sideways</h1>
      <p className="fm-lead">We could not finish that step. Nothing was charged. Please try again.</p>
      <div className="fm-row fm-row--center">
        <button type="button" className="fm-btn" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="fm-btn fm-btn--secondary">
          Back home
        </Link>
      </div>
      {error.digest ? <p className="fm-small">Reference: {error.digest}</p> : null}
    </main>
  );
}
