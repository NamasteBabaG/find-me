"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName, initialAge, children = [], initialChildId = "", fresh = false }: { initialName: string; initialAge?: number | null; children?: Array<{ id: string; displayName: string }>; initialChildId?: string; fresh?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const n = t.create.name;
  const [selectedId, setSelectedId] = useState(initialChildId);
  const [age, setAge] = useState<string>(validChildAge(initialAge) ? String(initialAge) : "");
  const [newName, setNewName] = useState(initialChildId ? "" : initialName);
  const selected = children.find(child => child.id === selectedId);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  // The next step is fetched while the parent is still typing, so pressing
  // Continue is a paint and not a wait. Every step does this for the one after it.
  useEffect(() => { router.prefetch("/create/photo"); }, [router]);
  const ageInvalid = Boolean(state && !state.ok && state.code === "INVALID_CHILD_AGE");
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
      <input type="hidden" name="freshAdventure" value={fresh ? "1" : "0"} />
      {children.length > 0 ? <div className="fm-field">
        <label className="fm-label" htmlFor="familyChildId">{t.family.choose}</label>
        <span className="fm-select"><select className="fm-input" id="familyChildId" name="familyChildId" value={selectedId} onChange={e => { setSelectedId(e.target.value); setAge(""); }} aria-describedby="family-choice-hint">
          <option value="">{t.family.newChild}</option>
          {children.map(child => <option key={child.id} value={child.id}>{child.displayName}</option>)}
        </select></span>
        <p className="fm-hint" id="family-choice-hint">{selected ? t.family.existingHint : t.family.newChildHint}</p>
      </div> : <input type="hidden" name="familyChildId" value="" />}
      <div className="create__child-fields">
        <div className="fm-field">
          <label htmlFor="name" className="fm-label">{n.label}</label>
          <input id="name" name="name" className="fm-input" value={selected?.displayName ?? newName} onChange={e => setNewName(e.target.value)} readOnly={Boolean(selected)} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus={!selected} autoComplete="off" aria-describedby="child-name-hint" />
          <p id="child-name-hint" className="fm-hint">{n.hint}</p>
        </div>
        <div className="fm-field">
          <label htmlFor="ageYears" className="fm-label">{n.ageLabel}</label>
          {/* The product's own chevron on the select; the browser's arrow is drawn away. */}
          <span className="fm-select">
            <select id="ageYears" name="ageYears" className="fm-input" value={age} onChange={e => setAge(e.target.value)} required aria-invalid={ageInvalid ? true : undefined} aria-describedby={state && !state.ok ? "child-age-hint child-form-error" : "child-age-hint"}>
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
