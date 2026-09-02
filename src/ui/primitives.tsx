import type { ReactNode } from "react";

/**
 * Presentational primitives safe to import from client components
 * (no server-only imports here).
 */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <div className="fm-stepper" role="list">
      {steps.map((label, i) => (
        <span key={label} role="listitem" aria-current={i === current ? "step" : undefined} aria-label={label} className={`fm-stepper__dot${i === current ? " fm-stepper__dot--active" : i < current ? " fm-stepper__dot--done" : ""}`} />
      ))}
      <span className="fm-stepper__label" aria-hidden>
        {steps[current]}
      </span>
    </div>
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
