"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { requestMagicLinkAction, type LoginResult } from "./actions";

export function LoginForm({ devOutbox }: { devOutbox: boolean }) {
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
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          {l.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="fm-input" required autoComplete="email" dir="ltr" placeholder="you@example.com" />
        {state && !state.ok ? <p className="fm-error">{errorText(t, state)}</p> : null}
      </div>
      <Button type="submit" size="lg" loading={pending}>
        {l.sendLink}
      </Button>
    </form>
  );
}
