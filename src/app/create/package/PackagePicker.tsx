"use client";

import { useActionState, useState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { choosePackageAction, type ActionResult } from "../actions";

interface Option {
  tier: string;
  name: string;
  sceneCount: number;
  searches: number;
  price: string;
  playtime: string;
  popular: boolean;
  available: boolean;
}

export function PackagePicker({ options, defaultTier }: { options: Option[]; defaultTier: string }) {
  const [tier, setTier] = useState(defaultTier);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(choosePackageAction, null);
  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="packages" role="radiogroup" aria-label="חבילות">
        {options.map((o) => {
          const selected = o.tier === tier;
          return (
            <label key={o.tier} className={`fm-card fm-card--pad-4 package fm-card--selectable${selected ? " fm-card--selected" : ""}${o.available ? "" : " package--soon"}`}>
              <input type="radio" name="tier" value={o.tier} className="visually-hidden" checked={selected} disabled={!o.available} onChange={() => setTier(o.tier)} />
              {o.popular ? <span className="fm-badge fm-badge--berry package__ribbon">הכי אהובה</span> : null}
              <h3>{o.name}</h3>
              <span className="package__worlds">{o.sceneCount} עולמות</span>
              <span className="fm-muted">
                {o.searches} חיפושים · {o.playtime}
              </span>
              <span className="package__price">{o.price}</span>
              {!o.available ? <span className="fm-badge fm-badge--outline">בקרוב</span> : <span className="fm-badge fm-badge--sea">{selected ? "נבחר ✓" : "בוחרים"}</span>}
            </label>
          );
        })}
      </div>
      {state && !state.ok ? <p className="fm-error fm-center">{state.reason}</p> : null}
      <div className="create__actions">
        <LinkButton href="/create/photo" variant="ghost">
          ➜ חזרה
        </LinkButton>
        <Button type="submit" size="lg" loading={pending}>
          ממשיכים לבחירת עולמות ➜
        </Button>
      </div>
    </form>
  );
}
