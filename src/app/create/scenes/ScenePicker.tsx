"use client";

import { creationDraftHref } from "@/domain/creation-draft";

import { useActionState, useState } from "react";
import { Button, LinkButton } from "@/ui/Button";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { Icon } from "@/ui/Icon";
import { WorldEmblem } from "@/ui/WorldEmblem";
import { chooseScenesAction, type ActionResult } from "../actions";

interface SceneOption {
  slug: string;
  name: string;
  tagline: string;
}

/**
 * Independent adventures. The server offers only complete, renderable worlds.
 * Each card shows the world's emblem, never a board: a board would give away
 * its hiding places before the child plays (Guy, 2026-11-18).
 * `note` says which worlds the chosen search level leaves out, where worlds are chosen.
 */
export function ScenePicker({ draftGameId, scenes, want, preselected, note }: { draftGameId?: string; scenes: SceneOption[]; want: number; preselected: string[]; note?: string }) {
  const { t, tf } = useI18n();
  const s = t.create.scenes;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(chooseScenesAction, null);
  const [included, setIncluded] = useState(() => {
    const valid = [...new Set(preselected)].filter(slug => scenes.some(sc => sc.slug === slug));
    return valid.length === want ? valid : scenes.slice(0, want).map(sc => sc.slug);
  });
  const full = included.length === want;
  function choose(slug: string) {
    if (want === 1) setIncluded([slug]);
    else setIncluded(current => current.includes(slug) ? current.filter(s => s !== slug) : current.length < want ? [...current, slug] : current);
  }

  return (
    <form action={action} className="worlds">
      {draftGameId ? <input type="hidden" name="draftGameId" value={draftGameId} /> : null}
      {/* One world is one tap; only a multi-world draft needs a count and a rule. */}
      {want > 1 ? (
        <div className="worlds__count fm-center" aria-live="polite" aria-atomic="true">
          <span className="fm-badge fm-badge--leaf">{tf(s.counter, { picked: included.length, want })}</span>
          <p id="world-choice-help" className="fm-hint">{s.limit}</p>
        </div>
      ) : null}
      {note ? <p className="fm-notice fm-center">{note}</p> : null}
      <div className="picker" role="group" aria-label={s.title} aria-describedby={want > 1 ? "world-choice-help" : undefined}>
        {scenes.map((sc) => {
          const on = included.includes(sc.slug);
          return (
            <button key={sc.slug} type="button" aria-pressed={on} disabled={pending}
              aria-disabled={!on && full && want > 1 ? true : undefined}
              onClick={() => choose(sc.slug)} className={`pick${on ? " pick--in" : ""}`} data-world={sc.slug}>
              <span className="pick__art" aria-hidden><WorldEmblem slug={sc.slug} /></span>
              <span className="pick__check" aria-hidden>
                <Icon name="check" strokeWidth={3} />
              </span>
              <span className="pick__name">{sc.name}</span>
              <span className="pick__tag">{sc.tagline}</span>
            </button>
          );
        })}
      </div>
      {included.map((slug) => (
        <input key={slug} type="hidden" name="scene" value={slug} />
      ))}
      {state && !state.ok ? <p className="fm-error fm-center">{errorText(t, state)}</p> : null}
      <div className="create__actions create__actions--bar">
        <LinkButton href={creationDraftHref("photo", draftGameId)} variant="ghost">
          <span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden />
          {t.common.back}
        </LinkButton>
        <Button type="submit" size="lg" loading={pending} disabled={!full}>
          {pending ? t.common.savingStep : s.next}
          <span className="fm-btn__arrow" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
