"use client";

import { useActionState, useEffect } from "react";
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

/**
 * The worlds this package includes — a confirmation, not a choice.
 *
 * This step used to offer a free pick of any `want` worlds. It could not
 * deliver one: the worlds are a ladder (`outOfOrderWorlds`), so the second
 * cannot be bought without the first, and the only selection the server will
 * accept is the first `want` of them. Tapping a world that was not already
 * chosen did nothing until another was un-chosen first, and a parent who
 * un-chose and re-chose in the wrong order got "packages include worlds in
 * order" thrown back at them at the end (Guy found both).
 *
 * So the step says what it actually is: these are the worlds in your package,
 * in the order they are played, and the ones beyond it open with a bigger
 * package — which is the package step, one tap away.
 */
export function ScenePicker({ scenes, want, preselected }: { scenes: SceneOption[]; want: number; preselected: string[] }) {
  const { t, tf } = useI18n();
  const router = useRouter();
  const s = t.create.scenes;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(chooseScenesAction, null);
  useEffect(() => { router.prefetch("/checkout"); }, [router]);

  // The ladder decides, not the order they happen to be listed in.
  const included = preselected.length === want ? preselected : scenes.slice(0, want).map((sc) => sc.slug);

  return (
    <form action={action} className="fm-stack fm-stack--4">
      <div className="pick__counter fm-center">
        <span className="fm-badge fm-badge--leaf">{tf(s.counter, { picked: included.length, want })}</span>
      </div>
      <div className="picker" role="list">
        {scenes.map((sc) => {
          const on = included.includes(sc.slug);
          return (
            <div key={sc.slug} role="listitem" className={`fm-card pick${on ? " fm-card--selected pick--in" : " pick--locked"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sc.thumbnail} alt="" />
              <span className="pick__check" aria-hidden>
                {on ? "✓" : "＋"}
              </span>
              <span className="pick__name">{sc.name}</span>
              <span className="pick__tag">{sc.tagline}</span>
              <span className="pick__state">{on ? s.included : s.locked}</span>
            </div>
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
        <Button type="submit" size="lg" loading={pending}>
          {s.next}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </Button>
      </div>
    </form>
  );
}
