"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { CREATION_MILESTONES, type CreationMilestone, type CreationState, type MilestoneState } from "@/domain/creation-progress";

interface Status {
  status: string;
  /** True while generation still has work to do — the page then nudges it along. */
  pending?: boolean;
  done: boolean;
  failed: boolean;
  state: CreationState;
  playUrl: string | null;
  awaitingQa: boolean;
  /** A real recipient got the mail. "Ready" alone means the link works, nothing more. */
  delivered: boolean;
  /** The box's mail provider only logs — nothing reaches an inbox here. */
  mailSimulated: boolean;
  /** Where to upload a different photo, when the state asks for one. */
  newPhotoUrl: string | null;
  percent: number;
  milestones: Record<CreationMilestone, MilestoneState>;
  current: CreationMilestone | null;
  characterReady: boolean;
  /** The illustrated sticker — a GAME asset, never the photograph. */
  avatarUrl: string | null;
  spotsDone: number;
  spotsTotal: number;
  /** The board being painted right now. */
  place: { slug: string; name: string } | null;
}

/** How many polls may fail in a row before the page says so. */
const QUIET_FAILURES = 3;

/**
 * The wait, as a small game of its own.
 *
 * A parent has just paid and is now looking at the one screen in the product
 * that takes minutes. Everything here is drawn from the pipeline's own facts:
 * the character appears the moment it exists, the bar moves with every hiding
 * spot painted, and the line under the sticker names the board being painted.
 * Nothing is timed, so nothing can lie.
 *
 * Every state the backend can be in has a sentence and, where the parent can
 * do something, a button: a snag being retried, a person checking, a new photo
 * needed, a dead end. And when the page itself cannot reach the server it says
 * that, with the time of the last update, instead of showing a stale screen.
 */
export function CreatingStatus({ gameId, childName, isAdmin }: { gameId: string; childName: string; isAdmin: boolean }) {
  const { t, tf, locale } = useI18n();
  const cr = t.create.creating;
  const [s, setS] = useState<Status | null>(null);
  const [failures, setFailures] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [resend, setResend] = useState<"idle" | "busy" | "sent" | "simulated" | "wait" | "error">("idle");

  useEffect(() => {
    let alive = true;
    let working = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/status`, { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) throw new Error(`status ${res.status}`);
        const status = (await res.json()) as Status;
        setS(status);
        setFailures(0);
        setUpdatedAt(new Date());
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
        if (alive) setFailures((n) => n + 1);
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    // A phone that went to sleep, a tab that was switched away from: the moment
    // it is looked at again the page catches up instead of waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gameId]);

  const offline = failures >= QUIET_FAILURES;
  const reconnecting = offline ? (
    <Notice kind="warn">
      {tf(cr.reconnecting, { time: updatedAt ? updatedAt.toLocaleTimeString(locale === "he" ? "he-IL" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "—" })}{" "}
      <Link href="/library">{cr.backToLibrary}</Link>
    </Notice>
  ) : null;

  if (!s) return offline ? reconnecting : <div className="fm-skeleton" style={{ height: "var(--space-16)" }} aria-busy />;

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

  if (s.state === "failed") {
    return (
      <Notice kind="danger">
        {cr.failed} {isAdmin ? <Link href={`/admin/orders/${gameId}`}>{cr.adminLink}</Link> : null}
      </Notice>
    );
  }

  const sendAgain = async () => {
    setResend("busy");
    try {
      const res = await fetch(`/api/games/${gameId}/resend`, { method: "POST", cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; code?: string; outcome?: string; simulated?: boolean };
      if (res.status === 429) setResend("wait");
      else if (!body.ok || body.outcome === "failed" || body.outcome === "no-recipient") setResend("error");
      else setResend(body.simulated ? "simulated" : "sent");
    } catch {
      setResend("error");
    }
  };

  if (s.done && s.playUrl) {
    const mailLine = s.delivered && !s.mailSimulated ? cr.mailSent : cr.mailNotSent;
    return (
      <div className="fm-card fm-card--pad-6 fm-stack fm-stack--3 fm-center cp cp--done">
        <div className="cp__stage cp__stage--done">
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt="" className="cp__avatar" width={160} height={160} />
          ) : (
            <span className="cp__party" aria-hidden>
              🎉
            </span>
          )}
        </div>
        <h2>{tf(cr.readyTitle, { name: childName })}</h2>
        <p className="fm-lead">{cr.readyOpen}</p>
        <LinkButton href={s.playUrl} size="lg">
          {cr.open}
        </LinkButton>
        <p className="fm-small">
          {mailLine}{" "}
          {resend === "sent" ? (
            <strong>{cr.resent}</strong>
          ) : resend === "simulated" ? (
            <span>{cr.resendSimulated}</span>
          ) : resend === "wait" ? (
            <span>{cr.resendWait}</span>
          ) : resend === "error" ? (
            <span>{cr.mailNotSent}</span>
          ) : (
            <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={sendAgain} disabled={resend === "busy"}>
              {cr.resend}
            </button>
          )}
        </p>
        <Link href="/library" className="fm-small">
          {cr.manage}
        </Link>
      </div>
    );
  }

  const percent = Math.max(0, Math.min(100, s.percent));
  const labels: Record<CreationMilestone, string> = {
    photo: cr.milestones.photo,
    character: tf(cr.milestones.character, { name: childName }),
    hiding: tf(cr.milestones.hiding, { name: childName }),
    assemble: cr.milestones.assemble,
    check: cr.milestones.check,
  };

  return (
    <div className="fm-stack fm-stack--3 cp">
      {reconnecting}
      {s.state === "needs_new_photo" && s.newPhotoUrl ? (
        <Notice kind="warn">
          {tf(cr.needsNewPhoto, { name: childName })}{" "}
          <LinkButton href={s.newPhotoUrl} size="sm">
            {cr.newPhotoButton}
          </LinkButton>
        </Notice>
      ) : null}
      {s.state === "retrying" ? <Notice kind="info">{cr.retrying}</Notice> : null}

      <section className="fm-card cp__card" aria-live="polite">
        <div className={`cp__stage${s.avatarUrl ? " cp__stage--met" : ""}`}>
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt="" className="cp__avatar" width={160} height={160} />
          ) : (
            <span className="cp__pencil" aria-hidden>
              ✏️
            </span>
          )}
        </div>
        <h2 className="cp__title">{s.avatarUrl ? tf(cr.meet, { name: childName }) : tf(cr.drawing, { name: childName })}</h2>
        <p className="cp__lead">{s.place ? tf(cr.nowIn, { name: childName, place: s.place.name }) : s.avatarUrl ? cr.meetLead : cr.drawingLead}</p>

        <div className="cp__bar" role="progressbar" aria-label={cr.progressAria} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="cp__fill" style={{ width: `${percent}%` }} />
          <span className="cp__rider" style={{ insetInlineStart: `${percent}%` }} aria-hidden>
            {s.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.avatarUrl} alt="" width={40} height={40} />
            ) : (
              "✨"
            )}
          </span>
        </div>
        <p className="cp__percent">{tf(cr.percent, { percent })}</p>
      </section>

      <ol className="cp__steps">
        {CREATION_MILESTONES.map((m, i) => {
          const state = s.milestones[m];
          return (
            <li key={m} className={`cp__step cp__step--${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="cp__dot" aria-hidden>
                {state === "done" ? "✓" : state === "active" ? <span className="fm-spinner" /> : i + 1}
              </span>
              <span className="cp__label">
                {labels[m]}
                {m === "hiding" && s.spotsTotal > 0 && state !== "todo" ? <span className="cp__count">{tf(cr.spotsCount, { done: s.spotsDone, total: s.spotsTotal })}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {s.state === "awaiting_review" ? (
        <Notice kind="info">
          {cr.qa} {isAdmin ? <Link href={`/admin/orders/${gameId}`}>{cr.qaAdmin}</Link> : cr.qaParent}
        </Notice>
      ) : (
        <p className="fm-small fm-center">{cr.usually}</p>
      )}
    </div>
  );
}
