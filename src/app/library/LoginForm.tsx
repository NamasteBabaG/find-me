"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { requestMagicLinkAction, type LoginResult } from "./actions";

export function LoginForm({ devOutbox, next = "/family" }: { devOutbox: boolean; next?: string }) {
  const { t, tf } = useI18n();
  const l = t.library;
  const [state, action, pending] = useActionState<LoginResult, FormData>(requestMagicLinkAction, null);
  if (state?.ok) {
    return (
      <Notice kind="success">
        <div className="fm-stack fm-stack--1">
          <strong>{tf(l.sent, { email: state.email })}</strong>
          <span>
            {l.sentValid} {devOutbox ? <Link href="/dev/outbox">{l.devOutbox}</Link> : null}
          </span>
        </div>
      </Notice>
    );
  }
  return (
    // noValidate: the server answers in the page's language; the browser's own bubbles do not (pilot QA, 2026-11-23).
    <form action={action} noValidate className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      <input type="hidden" name="next" value={next} />
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          {l.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="fm-input" required autoComplete="email" dir="ltr" placeholder="you@example.com"
          aria-invalid={state && !state.ok ? true : undefined} aria-describedby={state && !state.ok ? "login-email-error" : undefined} />
        {state && !state.ok ? <p id="login-email-error" className="fm-error" role="alert">{errorText(t, state)}</p> : null}
      </div>
      <Button type="submit" size="lg" loading={pending}>
        {l.sendLink}
      </Button>
    </form>
  );
}
