"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/Shell";

interface Status {
  status: string;
  step: 1 | 2 | 3 | 4;
  done: boolean;
  failed: boolean;
  playUrl: string | null;
  awaitingQa: boolean;
}

export function CreatingStatus({ gameId, childName, isAdmin }: { gameId: string; childName: string; isAdmin: boolean }) {
  const [s, setS] = useState<Status | null>(null);
  const steps = [`יוצרים את הדמות של ${childName}`, `מחביאים את ${childName} בעולמות`, "מוסיפים הפתעות", "בודקים שהכול מוכן"];

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/status`, { cache: "no-store" });
        if (res.ok && alive) setS((await res.json()) as Status);
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
        <Notice kind="warn">{s.status === "PAYMENT_FAILED" ? "התשלום לא הושלם." : "עדיין מחכים לאישור התשלום…"}</Notice>
        <LinkButton href="/checkout" variant="secondary">
          חזרה לתשלום
        </LinkButton>
      </div>
    );
  }

  if (s.failed) {
    return (
      <Notice kind="danger">
        משהו השתבש ביצירה. אנחנו על זה — ונעדכן במייל. {isAdmin ? <Link href={`/admin/orders/${gameId}`}>לאדמין</Link> : null}
      </Notice>
    );
  }

  if (s.done && s.playUrl) {
    return (
      <div className="fm-card fm-card--pad-6 fm-stack fm-stack--3 fm-center">
        <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
          🎉
        </span>
        <h2>המשחק של {childName} מוכן!</h2>
        <p className="fm-lead">שלחנו גם מייל עם הקישור הפרטי וקישור לספרייה.</p>
        <LinkButton href={s.playUrl} size="lg">
          לפתיחת המשחק
        </LinkButton>
        <Link href="/library" className="fm-small">
          ניהול המשחק בספרייה שלי
        </Link>
      </div>
    );
  }

  return (
    <div className="fm-stack fm-stack--3">
      <ol className="progress" aria-label="התקדמות">
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
          בדיקה אחרונה לפני המסירה. {isAdmin ? <Link href={`/admin/orders/${gameId}`}>לבדיקת QA באדמין</Link> : "נשלח מייל ברגע שהכול מאושר."}
        </Notice>
      ) : null}
    </div>
  );
}
