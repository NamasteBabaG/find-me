"use client";
import { useActionState } from "react";
import { useI18n } from "@/i18n/client";
import { errorText, type FlowResult } from "@/i18n/errors";
import { Button } from "@/ui/Button";
import { closePaymentAction } from "./actions";

export function ClosePaymentForm({ gameId, orderId, recovery = false }: { gameId: string; orderId: string; recovery?: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FlowResult | null, FormData>(closePaymentAction, null);
  return <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--2">
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="orderId" value={orderId} />
    {recovery ? <input type="hidden" name="recovery" value="1" /> : null}
    <p className="fm-hint">{t.worldPurchase.closePaymentHint}</p>
    {state && !state.ok ? <p className="fm-error" role="alert">{errorText(t, state)}</p> : null}
    <Button type="submit" variant="ghost" block loading={pending}>{pending ? t.worldPurchase.closingPayment : t.worldPurchase.closePayment}</Button>
  </form>;
}
