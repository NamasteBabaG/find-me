"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Shell";
import { requestMagicLinkAction, type LoginResult } from "./actions";

export function LoginForm({ devOutbox }: { devOutbox: boolean }) {
  const [state, action, pending] = useActionState<LoginResult, FormData>(requestMagicLinkAction, null);
  if (state?.ok) {
    return (
      <Notice kind="success">
        <div className="fm-stack fm-stack--1">
          <strong>שלחנו קישור ל־{state.email}</strong>
          <span>הוא תקף ל־15 דקות. {devOutbox ? <Link href="/dev/outbox">בסביבת הפיתוח: לתיבת הדואר</Link> : null}</span>
        </div>
      </Notice>
    );
  }
  return (
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          המייל שאיתו רכשתם
        </label>
        <input id="email" name="email" type="email" className="fm-input" required autoComplete="email" dir="ltr" placeholder="you@example.com" />
        {state && !state.ok ? <p className="fm-error">{state.reason}</p> : null}
      </div>
      <Button type="submit" size="lg" loading={pending}>
        שלחו לי קישור כניסה
      </Button>
    </form>
  );
}
