"use client";

import { useActionState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { checkoutAction, type ActionResult } from "../create/actions";
import Link from "next/link";
import { LEGAL_VERSION, serviceCopy } from "@/domain/legal";

export function CheckoutForm({ defaultEmail, priceLabel, outcome, backHref, automaticPublication = false, gameId, backLabel, lockedEmail = false }: { defaultEmail: string; priceLabel: string; outcome: "declined" | "cancelled" | null; backHref: string; automaticPublication?: boolean; gameId?: string; backLabel?: string; lockedEmail?: boolean }) {
  const { t, tf, locale } = useI18n();
  const legal = serviceCopy[locale];
  const ck = t.create.checkout;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(checkoutAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      {gameId ? <input type="hidden" name="gameId" value={gameId} /> : null}
      {outcome === "declined" ? <Notice kind="warn">{ck.declined}</Notice> : outcome === "cancelled" ? <Notice kind="warn">{ck.cancelled}</Notice> : null}
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          {ck.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="fm-input" defaultValue={defaultEmail} placeholder="you@example.com" required autoComplete="email" dir="ltr" readOnly={lockedEmail} />
        <p className="fm-hint">{ck.emailHint}</p>
        {state && !state.ok ? <p className="fm-error">{errorText(t, state)}</p> : null}
      </div>
      <p className="fm-hint">{legal.checkoutNotice} <Link href="/cancellation">{legal.cancellation}</Link></p>
      <input type="hidden" name="legalVersion" value={LEGAL_VERSION} />
      <label className="service-acceptance"><input type="checkbox" name="legalAccepted" value="1" required /><span>{legal.acceptance}</span></label>
      <p className="fm-hint"><Link href="/terms">{legal.terms}</Link> · <Link href="/privacy">{legal.privacy}</Link> · <Link href="/support">{legal.support}</Link></p>
      <div className="create__actions create__actions--single">
        <Button type="submit" size="lg" block loading={pending} className="summary__pay">
          {pending ? ck.openingPayment : tf(ck.pay, { price: priceLabel })}
        </Button>
      </div>
      <p className="fm-hint fm-center">{automaticPublication ? ck.prepAutomatic : ck.prep}</p>
      <LinkButton href={backHref} variant="ghost">
        <span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden>
          ➜
        </span>
        {backLabel ?? (backHref === "/create/package" ? ck.backPackage : ck.backScenes)}
      </LinkButton>
    </form>
  );
}
