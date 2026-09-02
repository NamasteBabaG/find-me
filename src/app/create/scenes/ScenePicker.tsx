"use client";

import { useActionState, useState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { chooseScenesAction, type ActionResult } from "../actions";

interface SceneOption {
  slug: string;
  name: string;
  tagline: string;
  thumbnail: string;
}

export function ScenePicker({ scenes, want, preselected }: { scenes: SceneOption[]; want: number; preselected: string[] }) {
  const { t, tf } = useI18n();
  const s = t.create.scenes;
  const [picked, setPicked] = useState<string[]>(preselected.slice(0, want));
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(chooseScenesAction, null);
  const full = picked.length >= want;
  const allSelected = scenes.length === want;

  const toggle = (slug: string) => {
    if (allSelected) return;
    setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : full ? p : [...p, slug]));
  };

  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="pick__counter fm-center">
        <span className={`fm-badge ${full ? "fm-badge--leaf" : "fm-badge--sea"}`}>{tf(s.counter, { picked: picked.length, want })}</span>
      </div>
      <div className="picker" role="group">
        {scenes.map((sc) => {
          const on = picked.includes(sc.slug);
          return (
            <button key={sc.slug} type="button" className={`fm-card fm-card--selectable pick${on ? " fm-card--selected" : ""}`} onClick={() => toggle(sc.slug)} aria-pressed={on} disabled={!on && full}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sc.thumbnail} alt="" />
              <span className="pick__check" aria-hidden>
                {on ? "✓" : ""}
              </span>
              <span className="pick__name">{sc.name}</span>
              <span className="pick__tag">{sc.tagline}</span>
            </button>
          );
        })}
      </div>
      {picked.map((slug) => (
        <input key={slug} type="hidden" name="scene" value={slug} />
      ))}
      {state && !state.ok ? <p className="fm-error fm-center">{errorText(t, state)}</p> : null}
      <div className="create__actions create__actions--sticky">
        <LinkButton href="/create/package" variant="ghost">
          {t.common.back}
        </LinkButton>
        <Button type="submit" size="lg" loading={pending} disabled={!full}>
          {s.next}
        </Button>
      </div>
    </form>
  );
}
