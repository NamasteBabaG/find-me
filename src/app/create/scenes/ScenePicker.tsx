"use client";

import { useActionState, useState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { chooseScenesAction, type ActionResult } from "../actions";

interface SceneOption {
  slug: string;
  name: string;
  tagline: string;
  thumbnail: string;
}

export function ScenePicker({ scenes, want, preselected }: { scenes: SceneOption[]; want: number; preselected: string[] }) {
  const [picked, setPicked] = useState<string[]>(preselected.slice(0, want));
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(chooseScenesAction, null);
  const full = picked.length >= want;
  const allSelected = scenes.length === want;

  const toggle = (slug: string) => {
    if (allSelected) return;
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : full ? p : [...p, slug]));
  };

  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="pick__counter fm-center">
        <span className={`fm-badge ${full ? "fm-badge--leaf" : "fm-badge--sea"}`}>
          בחרתם {picked.length} מתוך {want}
        </span>
      </div>
      <div className="picker" role="group" aria-label="עולמות">
        {scenes.map((s) => {
          const on = picked.includes(s.slug);
          return (
            <button key={s.slug} type="button" className={`fm-card fm-card--selectable pick${on ? " fm-card--selected" : ""}`} onClick={() => toggle(s.slug)} aria-pressed={on} disabled={!on && full}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.thumbnail} alt="" />
              <span className="pick__check" aria-hidden>
                {on ? "✓" : ""}
              </span>
              <span className="pick__name">{s.name}</span>
              <span className="pick__tag">{s.tagline}</span>
            </button>
          );
        })}
      </div>
      {picked.map((slug) => (
        <input key={slug} type="hidden" name="scene" value={slug} />
      ))}
      {state && !state.ok ? <p className="fm-error fm-center">{state.reason}</p> : null}
      <div className="create__actions">
        <LinkButton href="/create/package" variant="ghost">
          ➜ חזרה
        </LinkButton>
        <Button type="submit" size="lg" loading={pending} disabled={!full}>
          לסיכום ותשלום ➜
        </Button>
      </div>
    </form>
  );
}
