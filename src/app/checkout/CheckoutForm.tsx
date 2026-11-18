"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { checkoutAction, type ActionResult } from "../create/actions";
import Link from "next/link";
import { LEGAL_VERSION, serviceCopy } from "@/domain/legal";
import { Icon } from "@/ui/Icon";

/**
 * The pay half of the summary: the address the game goes to, the one tick the
 * law asks for with its terms beside it, and the button. Nothing else.
 */
export function CheckoutForm({ defaultEmail, priceLabel, outcome, gameId, draftGameId, lockedEmail = false }: { defaultEmail: string; priceLabel: string; outcome: "declined" | "cancelled" | null; gameId?: string; draftGameId?: string; lockedEmail?: boolean }) {
  const { t, tf, locale } = useI18n();
  const legal = serviceCopy[locale];
  const ck = t.create.checkout;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(checkoutAction, null);
  return (
    <form action={action} className="fm-card summary__card summary__pay-card">
      {draftGameId ? <input type="hidden" name="draftGameId" value={draftGameId} /> : null}
      {gameId ? <input type="hidden" name="gameId" value={gameId} /> : null}
      {outcome === "declined" ? <Notice kind="warn">{ck.declined}</Notice> : outcome === "cancelled" ? <Notice kind="warn">{ck.cancelled}</Notice> : null}
      <div className="fm-field">
        <label htmlFor="email" className="fm-label">
          {ck.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="fm-input" defaultValue={defaultEmail} placeholder="you@example.com" required autoComplete="email" dir="ltr" readOnly={lockedEmail} aria-describedby="email-hint" />
        <p id="email-hint" className="fm-hint">{ck.emailHint}</p>
        {state && !state.ok ? <p className="fm-error">{errorText(t, state)}</p> : null}
      </div>
      <input type="hidden" name="legalVersion" value={LEGAL_VERSION} />
      {/* The same tick as the photo consent: the product's sun box, not the browser's blue square. */}
      <label className="uploader__consent service-acceptance">
        <input type="checkbox" name="legalAccepted" value="1" required />
        <span className="uploader__tick" aria-hidden><Icon name="check" strokeWidth={3} /></span>
        <span>{legal.acceptance}</span>
      </label>
      <p className="summary__legal">
        {legal.checkoutNotice}{" "}
        <Link href="/cancellation">{legal.cancellation}</Link> · <Link href="/terms">{legal.terms}</Link> · <Link href="/privacy">{legal.privacy}</Link> · <Link href="/support">{legal.support}</Link>
      </p>
      <Button type="submit" size="lg" block loading={pending} className="summary__pay">
        {pending ? ck.openingPayment : tf(ck.pay, { price: priceLabel })}
      </Button>
    </form>
  );
}
