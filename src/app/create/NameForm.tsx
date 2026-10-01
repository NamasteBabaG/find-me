"use client";

import { useActionState, useState } from "react";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName, initialAge, children = [], initialChildId = "", fresh = false }: { initialName: string; initialAge?: number | null; children?: Array<{ id: string; displayName: string }>; initialChildId?: string; fresh?: boolean }) {
  const { t } = useI18n();
  const n = t.create.name;
  const [selectedId, setSelectedId] = useState(initialChildId);
  const [age, setAge] = useState<string>(validChildAge(initialAge) ? String(initialAge) : "");
  const [newName, setNewName] = useState(initialChildId ? "" : initialName);
  const selected = children.find(child => child.id === selectedId);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  const ageInvalid = Boolean(state && !state.ok && state.code === "INVALID_CHILD_AGE");
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
      <input type="hidden" name="freshAdventure" value={fresh ? "1" : "0"} />
      {children.length > 0 ? <div className="fm-field">
        <label className="fm-label" htmlFor="familyChildId">{t.family.choose}</label>
        <span className="fm-select"><select className="fm-input" id="familyChildId" name="familyChildId" value={selectedId} onChange={e => { setSelectedId(e.target.value); setAge(""); }} aria-describedby={selected ? "family-choice-hint" : undefined}>
          <option value="">{t.family.newChild}</option>
          {children.map(child => <option key={child.id} value={child.id}>{child.displayName}</option>)}
        </select></span>
        {/* Only a returning child needs a word: their adventure takes a new photo. */}
        {selected ? <p className="fm-hint" id="family-choice-hint">{t.family.existingHint}</p> : null}
      </div> : <input type="hidden" name="familyChildId" value="" />}
      {/* Name and age, nothing more (per Guy): the labels say it, the stepper says what comes next. */}
      <div className="create__child-fields">
        <div className="fm-field">
          <label htmlFor="name" className="fm-label">{n.label}</label>
          <input id="name" name="name" className="fm-input" value={selected?.displayName ?? newName} onChange={e => setNewName(e.target.value)} readOnly={Boolean(selected)} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus={!selected} autoComplete="off" />
        </div>
        <div className="fm-field">
          <label htmlFor="ageYears" className="fm-label">{n.ageLabel}</label>
          {/* The product's own chevron on the select; the browser's arrow is drawn away. */}
          <span className="fm-select">
            <select id="ageYears" name="ageYears" className="fm-input" value={age} onChange={e => setAge(e.target.value)} required aria-invalid={ageInvalid ? true : undefined} aria-describedby={state && !state.ok ? "child-form-error" : undefined}>
              <option value="" disabled>{n.agePlaceholder}</option>
              {CHILD_AGES.map(age => <option key={age} value={age}>{age}</option>)}
            </select>
          </span>
        </div>
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
