"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

/** Independent adventures. The server offers only complete, renderable worlds. */
export function ScenePicker({ scenes, want, preselected }: { scenes: SceneOption[]; want: number; preselected: string[] }) {
  const { t, tf } = useI18n();
  const router = useRouter();
  const s = t.create.scenes;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(chooseScenesAction, null);
  const [included, setIncluded] = useState(() => {
    const valid = [...new Set(preselected)].filter(slug => scenes.some(sc => sc.slug === slug));
    return valid.length === want ? valid : scenes.slice(0, want).map(sc => sc.slug);
  });
  useEffect(() => { router.prefetch("/checkout"); }, [router]);
  const full = included.length === want;
  function choose(slug: string) {
    if (want === 1) setIncluded([slug]);
    else setIncluded(current => current.includes(slug) ? current.filter(s => s !== slug) : current.length < want ? [...current, slug] : current);
  }

  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="pick__counter fm-center" aria-live="polite" aria-atomic="true">
        <span className="fm-badge fm-badge--leaf">{tf(s.counter, { picked: included.length, want })}</span>
      </div>
      <p id="world-choice-help" className="fm-center">{want === 1 ? s.swap : s.limit}</p>
      <div className="picker" role="group" aria-label={s.title} aria-describedby="world-choice-help">
        {scenes.map((sc) => {
          const on = included.includes(sc.slug);
          return (
            <button key={sc.slug} type="button" aria-pressed={on} disabled={pending}
              aria-disabled={!on && full && want > 1 ? true : undefined}
              onClick={() => choose(sc.slug)} className={`fm-card pick${on ? " fm-card--selected pick--in" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sc.thumbnail} alt="" />
              <span className="pick__check" aria-hidden>
                {on ? "✓" : "＋"}
              </span>
              <span className="pick__name">{sc.name}</span>
              <span className="pick__tag">{sc.tagline}</span>
              <span className="pick__state">{on ? s.included : s.choose}</span>
            </button>
          );
        })}
      </div>
      {included.map((slug) => (
        <input key={slug} type="hidden" name="scene" value={slug} />
      ))}
      {state && !state.ok ? <p className="fm-error fm-center">{errorText(t, state)}</p> : null}
      <div className="create__actions create__actions--sticky">
        <LinkButton href="/create/package" variant="ghost">
          {s.change}
        </LinkButton>
        <Button type="submit" size="lg" loading={pending} disabled={!full}>
          {s.next}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </Button>
      </div>
    </form>
  );
}
