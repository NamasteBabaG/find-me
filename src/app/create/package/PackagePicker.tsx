"use client";

import { useActionState, useState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { choosePackageAction, type ActionResult } from "../actions";

interface Option {
  tier: string;
  name: string;
  worldCount: number;
  boardCount: number;
  meta: string;
  price: string;
  popular: boolean;
}

export function PackagePicker({ options, defaultTier }: { options: Option[]; defaultTier: string }) {
  const { t, tf } = useI18n();
  const p = t.create.package;
  const [tier, setTier] = useState(defaultTier);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(choosePackageAction, null);
  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="packages" role="radiogroup">
        {options.map((o) => {
          const selected = o.tier === tier;
          return (
            <label key={o.tier} className={`fm-card fm-card--pad-4 package fm-card--selectable${selected ? " fm-card--selected" : ""}`}>
              <input type="radio" name="tier" value={o.tier} className="visually-hidden" checked={selected} onChange={() => setTier(o.tier)} />
              {o.popular ? <span className="fm-sticker-badge package__ribbon">{t.common.popular}</span> : null}
              <h3>{o.name}</h3>
              <span className="package__worlds">{o.worldCount === 1 ? t.common.worldCountOne : tf(t.common.worldsCount, { n: o.worldCount })}</span>
              <span className="fm-muted">{o.meta}</span>
              <span className="package__price">{o.price}</span>
              <span className="fm-badge fm-badge--sea">{selected ? p.selected : p.choose}</span>
            </label>
          );
        })}
      </div>
      {state && !state.ok ? <p className="fm-error fm-center">{errorText(t, state)}</p> : null}
      <div className="create__actions create__actions--sticky">
        <LinkButton href="/create/photo" variant="ghost">
          {t.common.back}
        </LinkButton>
        <Button type="submit" size="lg" loading={pending}>
          {p.next}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </Button>
      </div>
    </form>
  );
}
