import type { ReactNode } from "react";

/**
 * Presentational primitives safe to import from client components
 * (no server-only imports here).
 */

/**
 * The wizard's steps: a numbered dot and a name for each, the ones behind
 * ticked, the current one lit. Five anonymous dots said "there are steps";
 * they never said which one this is or what comes next. On a phone the names
 * fold away and one line under the dots says "Step 2 of 5 · Photo".
 */
export function Stepper({ steps, current, count }: { steps: readonly string[]; current: number; count?: string }) {
  return (
    <nav className="fm-steps" aria-label={count ?? steps[current]}>
      <ol className="fm-steps__list">
        {steps.map((label, i) => {
          const state = i === current ? "is-current" : i < current ? "is-done" : "";
          return (
            <li key={label} className={`fm-steps__item${state ? ` ${state}` : ""}`} aria-current={i === current ? "step" : undefined}>
              <span className="fm-steps__dot" aria-hidden>
                {i < current ? "✓" : i + 1}
              </span>
              <span className="fm-steps__label">{label}</span>
            </li>
          );
        })}
      </ol>
      {count ? (
        <p className="fm-steps__count" aria-hidden>
          {count} · {steps[current]}
        </p>
      ) : null}
    </nav>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "danger" | "success" | "warn"; children: ReactNode }) {
  const cls = kind === "warn" ? "fm-notice" : `fm-notice fm-notice--${kind}`;
  return (
    <div className={cls} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}
