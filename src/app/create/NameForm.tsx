"use client";

import { useActionState, useState } from "react";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import type { SearchLevel } from "@/domain/search-level";
import { saveNameAction, type ActionResult } from "./actions";
import { SearchLevelChoice } from "./SearchLevelChoice";

export function NameForm({ initialName, initialAge, children = [], initialChildId = "", fresh = false, levelChoice = false, freshLevelChoice = levelChoice, initialLevel = null, draftChild = null }: {
  initialName: string; initialAge?: number | null; children?: Array<{ id: string; displayName: string }>; initialChildId?: string; fresh?: boolean;
  /** Ask Explorers or Detectives for the draft being continued (the server decides; it re-checks on save). */
  levelChoice?: boolean; initialLevel?: SearchLevel | null;
  /** The continued draft already has a child: choosing another one starts a new draft on
   * save, which follows a new draft's terms (`freshLevelChoice`), not the continued one's. */
  draftChild?: { familyChildId: string } | null; freshLevelChoice?: boolean;
}) {
  const { t } = useI18n();
  const n = t.create.name;
  const [selectedId, setSelectedId] = useState(initialChildId);
  const [age, setAge] = useState<string>(validChildAge(initialAge) ? String(initialAge) : "");
  const [newName, setNewName] = useState(initialChildId ? "" : initialName);
  // No level is chosen for the parent: the first visit asks for a clear answer.
  const [level, setLevel] = useState<SearchLevel | null>(initialLevel);
  const [levelMissing, setLevelMissing] = useState(false);
  const startsFresh = (childId: string) => Boolean(draftChild) && childId !== draftChild!.familyChildId;
  // The cards follow the draft the save will use, so an answer the server needs is never out of reach.
  const asking = startsFresh(selectedId) ? freshLevelChoice : levelChoice;
  const selected = children.find(child => child.id === selectedId);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  const ageInvalid = Boolean(state && !state.ok && state.code === "INVALID_CHILD_AGE");
  const levelInvalid = levelMissing || Boolean(state && !state.ok && (state.code === "SEARCH_LEVEL_REQUIRED" || state.code === "SEARCH_LEVEL_UNAVAILABLE"));
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3" onSubmit={event => {
      // Answered on the spot, in the product's words, before a round trip.
      if (!asking || level) return;
      event.preventDefault();
      setLevelMissing(true);
      event.currentTarget.querySelector<HTMLInputElement>('input[name="searchLevel"]')?.focus();
    }}>
      <input type="hidden" name="freshAdventure" value={fresh ? "1" : "0"} />
      {children.length > 0 ? <div className="fm-field">
        <label className="fm-label" htmlFor="familyChildId">{t.family.choose}</label>
        <span className="fm-select"><select className="fm-input" id="familyChildId" name="familyChildId" value={selectedId} onChange={e => {
          const next = e.target.value;
          setSelectedId(next); setAge(""); setLevelMissing(false);
          // Another child's adventure never inherits this draft's path; coming back restores it.
          setLevel(startsFresh(next) ? null : initialLevel);
        }} aria-describedby={selected ? "family-choice-hint" : undefined}>
          <option value="">{t.family.newChild}</option>
          {children.map(child => <option key={child.id} value={child.id}>{child.displayName}</option>)}
        </select></span>
        {/* Only a returning child needs a word: their adventure takes a new photo. */}
        {selected ? <p className="fm-hint" id="family-choice-hint">{t.family.existingHint}</p> : null}
      </div> : <input type="hidden" name="familyChildId" value="" />}
      {/* Name and age, nothing more (per Guy): the labels say it, the stepper says what comes next.
          With the search level the order is name, path, exact age (Guy, 2026-10-09). */}
      <div className={`create__child-fields${asking ? " create__child-fields--level" : ""}`}>
        <div className="fm-field">
          <label htmlFor="name" className="fm-label">{n.label}</label>
          <input id="name" name="name" className="fm-input" value={selected?.displayName ?? newName} onChange={e => setNewName(e.target.value)} readOnly={Boolean(selected)} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus={!selected} autoComplete="off" />
        </div>
        {asking ? (
          <>
            <SearchLevelChoice value={level} ageYears={age ? Number(age) : null} invalid={levelInvalid}
              describedBy={levelMissing ? "level-error" : levelInvalid ? "child-form-error" : undefined}
              onChange={next => { setLevel(next); setLevelMissing(false); }} />
            {levelMissing ? <p id="level-error" className="fm-error" role="alert">{t.errors.SEARCH_LEVEL_REQUIRED}</p> : null}
          </>
        ) : null}
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
          {pending ? t.common.savingStep : n.next}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </Button>
      </div>
    </form>
  );
}
