"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";

interface Status {
  status: string;
  /** True while generation still has work to do — the page then nudges it along. */
  pending?: boolean;
  step: 1 | 2 | 3 | 4;
  done: boolean;
  failed: boolean;
  playUrl: string | null;
  awaitingQa: boolean;
}

export function CreatingStatus({ gameId, childName, isAdmin }: { gameId: string; childName: string; isAdmin: boolean }) {
  const { t, tf } = useI18n();
  const cr = t.create.creating;
  const [s, setS] = useState<Status | null>(null);
  const steps = cr.steps.map((x) => tf(x, { name: childName }));

  useEffect(() => {
    let alive = true;
    let working = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/status`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const status = (await res.json()) as Status;
        setS(status);
        // Generating a game takes minutes, more than a serverless request lives.
        // While this page is open it is the clock: each nudge does another slice
        // of the work. A cron does the same for a parent who closed the tab, and
        // both are safe to run at once (every step is idempotent).
        if (status.pending && !working) {
          working = true;
          try {
            await fetch(`/api/jobs/tick?gameId=${gameId}`, { method: "POST", cache: "no-store" });
          } finally {
            working = false;
          }
        }
      } catch {
        /* retry on next tick */
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [gameId]);

  if (!s) return <div className="fm-skeleton" style={{ height: "var(--space-16)" }} aria-busy />;

  if (s.status === "CHECKOUT_PENDING" || s.status === "PACKAGE_SELECTED" || s.status === "PAYMENT_FAILED") {
    return (
      <div className="fm-stack fm-stack--3">
        <Notice kind="warn">{s.status === "PAYMENT_FAILED" ? cr.paymentFailed : cr.waitingPayment}</Notice>
        <LinkButton href="/checkout" variant="secondary">
          {cr.backToCheckout}
        </LinkButton>
      </div>
    );
  }

  if (s.failed) {
    return (
      <Notice kind="danger">
        {cr.failed} {isAdmin ? <Link href={`/admin/orders/${gameId}`}>{cr.adminLink}</Link> : null}
      </Notice>
    );
  }

  if (s.done && s.playUrl) {
    return (
      <div className="fm-card fm-card--pad-6 fm-stack fm-stack--3 fm-center">
        <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
          🎉
        </span>
        <h2>{tf(cr.readyTitle, { name: childName })}</h2>
        <p className="fm-lead">{cr.readyLead}</p>
        <LinkButton href={s.playUrl} size="lg">
          {cr.open}
        </LinkButton>
        <Link href="/library" className="fm-small">
          {cr.manage}
        </Link>
      </div>
    );
  }

  return (
    <div className="fm-stack fm-stack--3">
      <ol className="progress">
        {steps.map((label, i) => {
          const n = i + 1;
          const cls = n < s.step ? "done" : n === s.step ? "active" : "todo";
          return (
            <li key={label} className={`progress__step progress__step--${cls}`} aria-current={cls === "active" ? "step" : undefined}>
              <span className="progress__dot" aria-hidden>
                {cls === "done" ? "✓" : cls === "active" ? <span className="fm-spinner" /> : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      {s.awaitingQa ? (
        <Notice kind="info">
          {cr.qa} {isAdmin ? <Link href={`/admin/orders/${gameId}`}>{cr.qaAdmin}</Link> : cr.qaParent}
        </Notice>
      ) : null}
    </div>
  );
}
