"use client";

import { useActionState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/Shell";
import { checkoutAction, type ActionResult } from "../create/actions";

export function CheckoutForm({ defaultEmail, priceLabel, cancelled }: { defaultEmail: string; priceLabel: string; cancelled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(checkoutAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      {cancelled ? <Notice kind="warn">התשלום בוטל. אפשר לנסות שוב כשתרצו.</Notice> : null}
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          לאיזה מייל לשלוח את המשחק?
        </label>
        <input id="email" name="email" type="email" className="fm-input" defaultValue={defaultEmail} placeholder="you@example.com" required autoComplete="email" dir="ltr" />
        <p className="fm-hint">בלי סיסמה: תקבלו קישור כניסה לספרייה במייל.</p>
        {state && !state.ok ? <p className="fm-error">{state.reason}</p> : null}
      </div>
      <Button type="submit" size="lg" block loading={pending}>
        יוצרים את המשחק — {priceLabel}
      </Button>
      <LinkButton href="/create/scenes" variant="ghost">
        ➜ חזרה לבחירת עולמות
      </LinkButton>
    </form>
  );
}
