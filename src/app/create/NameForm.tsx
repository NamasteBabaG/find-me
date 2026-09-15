"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName, initialAge }: { initialName: string; initialAge?: number | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const n = t.create.name;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  // The next step is fetched while the parent is still typing, so pressing
  // Continue is a paint and not a wait. Every step does this for the one after it.
  useEffect(() => { router.prefetch("/create/photo"); }, [router]);
  const ageInvalid = Boolean(state && !state.ok && state.code === "INVALID_CHILD_AGE");
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
      <div className="create__child-fields">
        <div className="fm-field">
          <label htmlFor="name" className="fm-label">{n.label}</label>
          <input id="name" name="name" className="fm-input" defaultValue={initialName} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus autoComplete="off" aria-describedby="child-name-hint" />
          <p id="child-name-hint" className="fm-hint">{n.hint}</p>
        </div>
        <div className="fm-field">
          <label htmlFor="ageYears" className="fm-label">{n.ageLabel}</label>
          {/* The product's own chevron on the select; the browser's arrow is drawn away. */}
          <span className="fm-select">
            <select id="ageYears" name="ageYears" className="fm-input" defaultValue={validChildAge(initialAge) ? initialAge : ""} required aria-invalid={ageInvalid ? true : undefined} aria-describedby={state && !state.ok ? "child-age-hint child-form-error" : "child-age-hint"}>
              <option value="" disabled>{n.agePlaceholder}</option>
              {CHILD_AGES.map(age => <option key={age} value={age}>{age}</option>)}
            </select>
          </span>
        </div>
        {/* Four lines of hint under a narrow select made the row lopsided: the age hint runs under both fields. */}
        <p id="child-age-hint" className="fm-hint create__child-note">{n.ageHint}</p>
      </div>
      {state && !state.ok ? <p id="child-form-error" className="fm-error fm-center" role="alert">{errorText(t, state)}</p> : null}
      {state && !state.ok && state.code === "SERVICE_UNAVAILABLE" ? (
        <p className="fm-center"><a className="fm-btn fm-btn--secondary fm-btn--sm" href="/#demo">{t.home.hero.demo}</a></p>
      ) : null}
      {/* The step's own step count is on the stepper above; it was said twice. */}
      <div className="create__actions">
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
