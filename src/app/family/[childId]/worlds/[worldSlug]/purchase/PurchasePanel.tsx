"use client";
import { useActionState } from "react";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import { useI18n } from "@/i18n/client";
import { errorText, type FlowResult } from "@/i18n/errors";
import { Button } from "@/ui/Button";
import { continueWorldAction } from "./actions";

export function PurchasePanel({ childId, worldSlug, ageYears, returnGameId, resuming }: {
  childId: string; worldSlug: string; ageYears: number | null; returnGameId: string | null; resuming: boolean;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FlowResult | null, FormData>(continueWorldAction.bind(null, childId, worldSlug), null);
  return <form action={action} className="fm-stack fm-stack--3">
    <input type="hidden" name="returnGame" value={returnGameId ?? ""} />
    {resuming && validChildAge(ageYears) ? <><input type="hidden" name="ageYears" value={ageYears} /><p className="fm-hint">{t.worldPurchase.frozenAge.replace("{age}", String(ageYears))}</p></>
      : <div className="fm-field"><label className="fm-label" htmlFor="world-character-age">{t.worldPurchase.ageLabel}</label>
        <span className="fm-select"><select className="fm-input" id="world-character-age" name="ageYears" defaultValue={validChildAge(ageYears) ? String(ageYears) : ""} disabled={pending} required>
          <option value="" disabled>{t.create.name.agePlaceholder}</option>{CHILD_AGES.map(age => <option key={age} value={age}>{age}</option>)}
        </select></span></div>}
    {state && !state.ok ? <p className="fm-error" role="alert">{errorText(t, state)}</p> : null}
    <Button type="submit" size="lg" block loading={pending}>{pending ? t.common.savingStep : resuming ? t.worldPurchase.resume : t.worldPurchase.start}</Button>
  </form>;
}
