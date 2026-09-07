"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName, initialAge }: { initialName: string; initialAge?: number | null }) {
  const { t, tf } = useI18n();
  const n = t.create.name;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
      <div className="create__child-fields">
        <div className="fm-field">
          <label htmlFor="name" className="fm-label">{n.label}</label>
          <input id="name" name="name" className="fm-input fm-input--lg" defaultValue={initialName} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus autoComplete="off" aria-describedby="child-name-hint" />
          <p id="child-name-hint" className="fm-hint">{n.hint}</p>
        </div>
        <div className="fm-field">
          <label htmlFor="ageYears" className="fm-label">{n.ageLabel}</label>
          <select id="ageYears" name="ageYears" className="fm-input fm-input--lg" defaultValue={validChildAge(initialAge) ? initialAge : ""} required aria-invalid={state && !state.ok && state.code === "INVALID_CHILD_AGE" ? true : undefined} aria-describedby={state && !state.ok ? "child-age-hint child-form-error" : "child-age-hint"}>
            <option value="" disabled>{n.agePlaceholder}</option>
            {CHILD_AGES.map(age => <option key={age} value={age}>{age}</option>)}
          </select>
          <p id="child-age-hint" className="fm-hint">{n.ageHint}</p>
        </div>
      </div>
      {state && !state.ok ? <p id="child-form-error" className="fm-error" role="alert">{errorText(t, state)}</p> : null}
      {state && !state.ok && state.code === "SERVICE_UNAVAILABLE" ? (
        <p><a className="fm-btn fm-btn--secondary fm-btn--sm" href="/#demo">{t.home.hero.demo}</a></p>
      ) : null}
      <div className="create__actions">
        <span className="fm-small">{tf(t.common.stepOf, { n: 1, total: 5 })}</span>
        <Button type="submit" size="lg" loading={pending}>
          {n.next}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </Button>
      </div>
    </form>
  );
}
