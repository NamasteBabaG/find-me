"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { saveNameAction, type ActionResult } from "./actions";

export function NameForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveNameAction, null);
  return (
    <form action={action} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      <div className="fm-field">
        <label htmlFor="name" className="fm-label">
          השם של הילד או הילדה
        </label>
        <input id="name" name="name" className="fm-input fm-input--lg" defaultValue={initialName} placeholder="למשל: נועה" maxLength={24} minLength={2} required autoFocus autoComplete="off" />
        <p className="fm-hint">בדיוק כמו שקוראים לו או לה בבית.</p>
        {state && !state.ok ? <p className="fm-error">{state.reason}</p> : null}
      </div>
      <div className="create__actions">
        <span className="fm-small">שלב 1 מתוך 5</span>
        <Button type="submit" size="lg" loading={pending}>
          ממשיכים לתמונה ➜
        </Button>
      </div>
    </form>
  );
}
