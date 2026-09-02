"use client";

import { useActionState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { checkoutAction, type ActionResult } from "../create/actions";

export function CheckoutForm({ defaultEmail, priceLabel, cancelled }: { defaultEmail: string; priceLabel: string; cancelled: boolean }) {
  const { t, tf } = useI18n();
  const ck = t.create.checkout;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(checkoutAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      {cancelled ? <Notice kind="warn">{ck.cancelled}</Notice> : null}
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          {ck.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="fm-input" defaultValue={defaultEmail} placeholder="you@example.com" required autoComplete="email" dir="ltr" />
        <p className="fm-hint">{ck.emailHint}</p>
        {state && !state.ok ? <p className="fm-error">{errorText(t, state)}</p> : null}
      </div>
      <div className="create__actions create__actions--sticky create__actions--single">
        <Button type="submit" size="lg" block loading={pending}>
          {tf(ck.pay, { price: priceLabel })}
        </Button>
      </div>
      <LinkButton href="/create/scenes" variant="ghost">
        {ck.backScenes}
      </LinkButton>
    </form>
  );
}
