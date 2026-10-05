"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { getDict } from "@/i18n";
import type { FamilyWorldCard, FamilyWorlds } from "@/domain/family-worlds";
import { useGameText } from "../i18n";
import "./OwnerWorldSelector.css";

const HISTORY_KEY = "findMeWorldSelector";

/** Link owns its navigation state; both labels reserve the same space. */
function ParentContinueLabel({ label, opening }: { label: string; opening: string }) {
  const { pending } = useLinkStatus();
  return <span className={`owner-worlds__parent-label${pending ? " is-pending" : ""}`} aria-live="polite">
    <span className="owner-worlds__parent-ready" aria-hidden={pending}>{label}</span>
    <span className="owner-worlds__parent-opening" aria-hidden={!pending}><span className="fm-spinner" aria-hidden />{opening}</span>
  </span>;
}

/** Shown only by the session-authorized owner shell. The endpoint repeats that
 * authorization; none of these sibling games enters the shareable config. */
export function OwnerWorldSelector({ gameId, worldSlug, icon = "🌍", onCurrentWorld }: {
  gameId: string; worldSlug?: string; icon?: string; onCurrentWorld(worldSlug: string): void;
}) {
  const { locale, dir, tf } = useGameText();
  const copy = getDict(locale).worldSelector;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false), [data, setData] = useState<FamilyWorlds | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<FamilyWorldCard | null>(null), [parent, setParent] = useState(false);
  const [navigating, setNavigating] = useState<string | null>(null);

  // A phone's back gesture dismisses the sheet before leaving the game.
  // Next replaces this sheet entry only when a chosen route commits. Until
  // then its marker stays, so a cancelled navigation can still dismiss it.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, [HISTORY_KEY]: gameId }, "");
    const onBack = () => { if (window.history.state?.[HISTORY_KEY] !== gameId) { setOpen(false); setSelected(null); setParent(false); } };
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
      if (window.history.state?.[HISTORY_KEY] === gameId) window.history.back();
    };
  }, [open, gameId]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    if (!element.open) { if (element.showModal) element.showModal(); else element.setAttribute("open", ""); }
    return () => {
      if (element.open) { if (element.close) element.close(); else element.removeAttribute("open"); }
      trigger.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(false);
    const query = new URLSearchParams({ gameId, ...(worldSlug ? { world: worldSlug } : {}) });
    fetch(`/api/family/worlds?${query}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("worlds-unavailable");
        const value = await response.json() as FamilyWorlds & { ok: boolean };
        if (!value.ok || value.currentGameId !== gameId || !Array.isArray(value.worlds)) throw new Error("worlds-unavailable");
        if (!controller.signal.aborted) setData(value);
      }).catch(() => { if (!controller.signal.aborted) { setData(null); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, gameId, worldSlug, reload]);

  function close() { setOpen(false); setSelected(null); setParent(false); }
  function choose(card: FamilyWorldCard) {
    if (navigating) return;
    if (card.status === "ready" && card.playHref) {
      if (card.gameId === gameId) { onCurrentWorld(card.worldSlug); close(); }
      else { setNavigating(card.worldSlug); router.replace(card.playHref); }
      return;
    }
    setSelected(card); setParent(false);
  }
  function status(card: FamilyWorldCard): string {
    if (card.status === "ready") return card.current ? copy.current : card.completedPlaces === card.totalPlaces ? copy.revisit : (card.foundTargets ?? 0) > 0 ? copy.continue : copy.start;
    return ({ preparing: copy.preparing, payment_pending: copy.paymentPending, attention: copy.attention, available: copy.preview, unavailable: copy.unavailable })[card.status];
  }
  const owned = data?.worlds.filter(card => card.gameId) ?? [], catalog = data?.worlds.filter(card => !card.gameId) ?? [];

  return <>
    <button ref={trigger} type="button" className="owner-worlds__trigger" onClick={() => { setNavigating(null); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}>
      <span className="owner-worlds__trigger-icon" aria-hidden>{icon}</span><span>{copy.trigger}</span><span aria-hidden>⌄</span>
    </button>
    {open ? <dialog ref={dialog} className="owner-worlds" aria-labelledby={titleId} dir={dir} lang={locale}
      onCancel={event => { event.preventDefault(); close(); }} onClose={close}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="owner-worlds__panel">
        <header className="owner-worlds__header"><h2 id={titleId}>{selected ? selected.name : copy.title}</h2>
          <button type="button" className="owner-worlds__close" onClick={close} aria-label={copy.close}><span aria-hidden>×</span></button>
        </header>
        {selected ? <div className="owner-worlds__preview">
          <div className="owner-worlds__emblem owner-worlds__emblem--large" aria-hidden>{selected.icon}</div>
          <p className="owner-worlds__tagline">{selected.tagline || tf(copy.previewText, { places: selected.totalPlaces })}</p>
          <p className="owner-worlds__state">{selected.status === "available" ? tf(copy.previewStats, { places: selected.totalPlaces }) : status(selected)}</p>
          {selected.purchaseHref ? <>
            {parent ? <><p className="owner-worlds__parent-note">{copy.parentNote}</p><Link className="fm-btn fm-btn--primary" href={selected.purchaseHref} replace><ParentContinueLabel label={copy.parentContinue} opening={copy.parentOpening} /></Link></>
              : <button type="button" className="fm-btn fm-btn--secondary" onClick={() => setParent(true)}>{selected.status === "available" ? copy.parentAction : copy.preparationAction}</button>}
          </> : null}
          <button type="button" className="fm-btn fm-btn--ghost" onClick={() => { setSelected(null); setParent(false); }}>{copy.back}</button>
        </div> : <>
          {loading && !data ? <p role="status" className="owner-worlds__notice">{copy.loading}</p> : null}
          {error ? <div className="owner-worlds__notice" role="status"><p>{copy.loadError}</p><button type="button" className="fm-btn fm-btn--secondary" onClick={() => setReload(value => value + 1)}>{copy.reload}</button></div> : null}
          {[{ title: copy.mine, cards: owned }, { title: copy.catalog, cards: catalog }].map(group => group.cards.length ? <section key={group.title} className="owner-worlds__section" aria-label={group.title}>
            <h3>{group.title}</h3><ul className="owner-worlds__grid">{group.cards.map(card => <li key={card.worldSlug}>
              <button type="button" className={`owner-worlds__card${card.current ? " is-current" : ""}`} onClick={() => choose(card)} aria-current={card.current ? "true" : undefined} aria-disabled={navigating ? true : undefined} aria-busy={navigating === card.worldSlug || undefined}>
                <span className="owner-worlds__emblem" aria-hidden>{card.icon}</span>
                <span className="owner-worlds__card-copy"><strong>{card.name}</strong><span className="owner-worlds__state" aria-live="polite">{navigating === card.worldSlug ? tf(copy.openingWorld, { world: card.name }) : status(card)}</span>
                  {card.completedPlaces !== null ? <span className="owner-worlds__progress">{tf(copy.progress, { done: card.completedPlaces, total: card.totalPlaces })}</span> : null}
                </span><span className="owner-worlds__card-arrow" aria-hidden>{navigating === card.worldSlug ? <span className="fm-spinner" /> : dir === "rtl" ? "‹" : "›"}</span>
              </button>
            </li>)}</ul>
          </section> : null)}
        </>}
      </div>
    </dialog> : null}
  </>;
}
