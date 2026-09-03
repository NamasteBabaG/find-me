"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName }: { initialName: string }) {
  const { t, tf } = useI18n();
  const n = t.create.name;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
      <div className="fm-field">
        <label htmlFor="name" className="fm-label">
          {n.label}
        </label>
        <input id="name" name="name" className="fm-input fm-input--lg" defaultValue={initialName} placeholder={n.placeholder} maxLength={24} minLength={2} required autoFocus autoComplete="off" />
        <p className="fm-hint">{n.hint}</p>
        {state && !state.ok ? <p className="fm-error">{errorText(t, state)}</p> : null}
      </div>
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
