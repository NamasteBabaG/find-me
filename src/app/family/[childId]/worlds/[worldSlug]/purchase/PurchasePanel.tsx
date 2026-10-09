"use client";
import { useActionState, useState } from "react";
import { CHILD_AGES, validChildAge } from "@/domain/child-appearance";
import type { SearchLevel } from "@/domain/search-level";
import { tf } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { errorText, type FlowResult } from "@/i18n/errors";
import { Button } from "@/ui/Button";
import { SearchLevelChoice } from "@/app/create/SearchLevelChoice";
import { continueWorldAction } from "./actions";

export function PurchasePanel({ childId, worldSlug, ageYears, returnGameId, resuming, levelChoice = false, initialLevel = null, frozenLevel = null }: {
  childId: string; worldSlug: string; ageYears: number | null; returnGameId: string | null; resuming: boolean;
  /** Asked only while this world can be sold at both levels; a resumed draft keeps its own. */
  levelChoice?: boolean; initialLevel?: SearchLevel | null; frozenLevel?: SearchLevel | null;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FlowResult | null, FormData>(continueWorldAction.bind(null, childId, worldSlug), null);
  const [age, setAge] = useState(validChildAge(ageYears) ? String(ageYears) : "");
  const [level, setLevel] = useState<SearchLevel | null>(initialLevel);
  const [levelMissing, setLevelMissing] = useState(false);
  const frozen = resuming && levelChoice ? frozenLevel : null;
  const asking = levelChoice && !frozen;
  const levelInvalid = levelMissing || Boolean(state && !state.ok && (state.code === "SEARCH_LEVEL_REQUIRED" || state.code === "SEARCH_LEVEL_UNAVAILABLE"));
  return <form action={action} className="fm-stack fm-stack--3" onSubmit={event => {
    if (!asking || level) return;
    event.preventDefault();
    setLevelMissing(true);
    event.currentTarget.querySelector<HTMLInputElement>('input[name="searchLevel"]')?.focus();
  }}>
    <input type="hidden" name="returnGame" value={returnGameId ?? ""} />
    {frozen ? <><input type="hidden" name="searchLevel" value={frozen} /><p className="fm-hint">{tf(t.create.level.frozen, { level: t.create.level[frozen].name })}</p></> : null}
    {asking ? <>
      <SearchLevelChoice value={level} ageYears={age ? Number(age) : null} invalid={levelInvalid} disabled={pending}
        describedBy={levelMissing ? "world-level-error" : undefined} onChange={next => { setLevel(next); setLevelMissing(false); }} />
      {levelMissing ? <p id="world-level-error" className="fm-error" role="alert">{t.errors.SEARCH_LEVEL_REQUIRED}</p> : null}
    </> : null}
    {resuming && validChildAge(ageYears) ? <><input type="hidden" name="ageYears" value={ageYears} /><p className="fm-hint">{t.worldPurchase.frozenAge.replace("{age}", String(ageYears))}</p></>
      : <div className="fm-field"><label className="fm-label" htmlFor="world-character-age">{t.worldPurchase.ageLabel}</label>
        <span className="fm-select"><select className="fm-input" id="world-character-age" name="ageYears" value={age} onChange={e => setAge(e.target.value)} disabled={pending} required>
          <option value="" disabled>{t.create.name.agePlaceholder}</option>{CHILD_AGES.map(age => <option key={age} value={age}>{age}</option>)}
        </select></span></div>}
    {state && !state.ok ? <p className="fm-error" role="alert">{errorText(t, state)}</p> : null}
    <Button type="submit" size="lg" block loading={pending}>{pending ? t.common.savingStep : resuming ? t.worldPurchase.resume : t.worldPurchase.start}</Button>
  </form>;
}
