"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import type { PassportPageView, PassportView } from "@/domain/passport/passport";
import { arrowPage, swipePage } from "./book-navigation";
import { PassportStamp } from "./StampMark";
import "./passport.css";

function Picture({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    if (!failed || attempt >= 2) return;
    // Bounded recovery for an image still being prepared, never clear rewards
    // or disable page navigation because a raster failed to arrive.
    const timer = setTimeout(() => { setAttempt(n => n + 1); setFailed(false); }, 1000 * (attempt + 1));
    return () => clearTimeout(timer);
  }, [failed, attempt]);
  return failed ? <span className="travel-passport__photo-wait" role="status">{t.travelPassport.photoUnavailable}</span> : <img src={src} alt={label} onError={() => setFailed(true)} loading="lazy" decoding="async" />;
}

function Chevron({ right }: { right: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none"><path d={right ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** One reading order: two paper leaves on desktop, one continuous mobile page. */
export function PassportBook({ book, mode = "owner", onPhotoSelect, onPlay, renderImage, cursorKey }: { book: PassportView; mode?: "owner" | "shared" | "demo"; onPhotoSelect?: (pageId: string, targetId: string) => Promise<void>; onPlay?: (pageId: string) => void; renderImage?: (src: string, label: string) => ReactNode; cursorKey?: string }) {
  const { t, tf, dir } = useI18n(), copy = t.travelPassport;
  const [open, setOpen] = useState(false), [opening, setOpening] = useState(false);
  const [worldId, setWorldId] = useState(book.worlds[0]?.id ?? ""), [pageId, setPageId] = useState("");
  const [cursorReady, setCursorReady] = useState<string | undefined>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null), [panel, setPanel] = useState<"photo" | "choose" | "detail" | null>(null);
  const [turn, setTurn] = useState<{ direction: "next" | "previous"; page: PassportPageView } | null>(null);
  const reduced = useRef(false), turning = useRef(false);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverButton = useRef<HTMLButtonElement>(null), zoomDialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; at: number; pointer: number; captured: boolean } | null>(null), suppressClick = useRef(false);
  const image = (src: string, label: string) => renderImage ? renderImage(src, label) : <Picture key={src} src={src} label={label} />;
  const world = book.worlds.find(w => w.id === worldId) ?? book.worlds[0];
  const page = world?.pages.find(p => p.id === pageId) ?? world?.pages[0];
  const index = page ? world!.pages.indexOf(page) : 0;
  const detail = page?.discoveries.find(item => item.id === detailId && item.collected);
  const foundCount = page?.discoveries.filter(item => item.collected).length ?? 0;

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => { reduced.current = query?.matches ?? false; };
    update(); query?.addEventListener?.("change", update);
    return () => { query?.removeEventListener?.("change", update); if (animationTimer.current) clearTimeout(animationTimer.current); };
  }, []);
  useEffect(() => {
    if (cursorKey) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(`passport-cursor:${cursorKey}`) ?? "null");
        if (saved && book.worlds.some(w => w.id === saved.world && w.pages.some(p => p.id === saved.page))) { setWorldId(saved.world); setPageId(saved.page); }
      } catch { /* Cursor loss never affects achievements. */ }
    }
    setCursorReady(cursorKey);
  }, [cursorKey]); // Book refresh and resize must not reset the reader's place.
  useEffect(() => {
    if (cursorKey && cursorReady === cursorKey && world && page) {
      try { sessionStorage.setItem(`passport-cursor:${cursorKey}`, JSON.stringify({ world: world.id, page: page.id })); } catch { /* Navigation convenience only. */ }
    }
  }, [cursorKey, cursorReady, world?.id, page?.id]);
  useEffect(() => { const el = zoomDialog.current; if (!el) return; if (panel) el.showModal?.(); else if (el.open) el.close?.(); }, [panel]);

  function focusPage() { requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }
  function stopAnimation() { if (animationTimer.current) clearTimeout(animationTimer.current); setTurn(null); setOpening(false); turning.current = false; }
  function openBook() {
    setOpen(true); setOpening(!reduced.current); focusPage();
    if (!reduced.current) animationTimer.current = setTimeout(() => setOpening(false), 900);
  }
  function navigate(next: PassportPageView, direction?: "next" | "previous") {
    if (!page || next.id === page.id || turning.current || busy) return;
    if (animationTimer.current) clearTimeout(animationTimer.current);
    setOpening(false); setMessage(""); setDetailId(null); setPanel(null);
    if (!reduced.current) {
      turning.current = true; setTurn({ direction: direction ?? (world!.pages.indexOf(next) > index ? "next" : "previous"), page });
      animationTimer.current = setTimeout(() => { setTurn(null); turning.current = false; }, 640);
    }
    setPageId(next.id); focusPage();
  }
  function move(amount: -1 | 0 | 1) {
    const next = world?.pages[index + amount];
    if (amount && next) navigate(next, amount > 0 ? "next" : "previous");
  }
  function pointerStart(e: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (e.pointerType === "mouse" || !e.isPrimary || !window.matchMedia("(max-width: 760px)").matches) return;
    const target = e.target as HTMLElement;
    // Photos may be swiped; forms, sticker buttons and the place strip keep native gestures.
    if (target.closest("button, a, input, select, summary") && !target.closest(".travel-passport__enlarge")) return;
    gesture.current = { x: e.clientX, y: e.clientY, at: performance.now(), pointer: e.pointerId, captured: false };
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.pointer !== e.pointerId) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.captured && Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
    if (!start.captured && Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      start.captured = true; suppressClick.current = true; e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  }
  function pointerEnd(e: PointerEvent<HTMLDivElement>) {
    const start = gesture.current; gesture.current = null;
    if (!start || start.pointer !== e.pointerId) return;
    if (start.captured) move(swipePage(e.clientX - start.x, e.clientY - start.y, performance.now() - start.at, dir));
  }
  async function choose(targetId: string) {
    if (!page || !onPhotoSelect || busy) return;
    setBusy(true); setMessage("");
    try { await onPhotoSelect(page.id, targetId); setMessage(copy.saved); }
    catch { setMessage(copy.saveFailed); }
    finally { setBusy(false); }
  }
  const coverArt = <><span className="travel-passport__eyebrow">FIND ME WORLDS</span><div className="travel-passport__crest" aria-hidden="true">✦</div><h2>{copy.title}</h2>{book.avatarUrl ? <div className="travel-passport__avatar">{image(book.avatarUrl, "")}</div> : null}<p className="travel-passport__name">{book.name}</p><p className="travel-passport__motto">{copy.subtitle}</p></>;

  return <section className="travel-passport" aria-label={copy.title} data-mode={mode} data-open={open} dir={dir}>
    {mode === "demo" ? <p className="travel-passport__demo">{copy.demo}</p> : null}
    <div className="travel-passport__reader">
      <header className="travel-passport__toolbar" inert={!open} aria-hidden={!open}>
        <button type="button" className="fm-btn fm-btn--ghost" onClick={() => { stopAnimation(); setOpen(false); requestAnimationFrame(() => coverButton.current?.focus({ preventScroll: true })); }}>{copy.close}</button>
        {/* Worlds are the passport's dividers, so they look like dividers: index
            tabs standing on the head of the book, the current one joined to the
            paper. A <select> floating above the corner read as a form control
            from another page and gave no sense of where you were in the book.
            Plain buttons with aria-current, not a tab/tablist pattern: nothing
            here is a tab panel, and a real tablist would owe arrow-key roving
            that would then argue with the arrow keys that turn pages. */}
        <nav className="travel-passport__tabs" aria-label={copy.worlds}>
          {book.worlds.map(w => <button key={w.id} type="button" className={`travel-passport__tab${w.id === world?.id ? " is-current" : ""}`} aria-current={w.id === world?.id ? "true" : undefined} onClick={() => { if (w.id === world?.id) return; stopAnimation(); setWorldId(w.id); setPageId(""); setMessage(""); setDetailId(null); }}>{w.title}</button>)}
        </nav>
      </header>
      <div className="travel-passport__frame">
        {!open ? <div className="travel-passport__cover">{coverArt}{world ? <button ref={coverButton} className="fm-btn fm-btn--lg" type="button" onClick={openBook}>{copy.open}<Chevron right={dir === "ltr"} /></button> : <p>{book.preparing ? copy.preparing : copy.empty}</p>}</div> : <div className="travel-passport__book" data-opening={opening || undefined} data-turn={turn?.direction} onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={() => { gesture.current = null; }} onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }} onKeyDown={e => {
          if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest("input, select, textarea, [contenteditable=true]")) return;
          const amount = arrowPage(e.key, dir); if (amount) { e.preventDefault(); move(amount); }
        }}>
          {page ? <article key={page.id} className="travel-passport__page" data-state={page.state}>
            <div className="travel-passport__spread">
              <section className="travel-passport__leaf travel-passport__memory" aria-label={copy.memory}>
                <header className="travel-passport__page-head"><p className="travel-passport__eyebrow">{world?.title}</p><h2 ref={heading} tabIndex={-1}>{page.title}</h2><p>{tf(copy.page, { n: index + 1, total: world!.pages.length })}</p></header>
                <div className="travel-passport__photo">{page.photoUrl ? <button type="button" className="travel-passport__enlarge" aria-label={copy.enlarge} onClick={() => setPanel("photo")}>{image(page.photoUrl, page.title)}<span>{copy.enlarge}</span></button> : <div className="travel-passport__photo-wait"><span aria-hidden>✦</span><p>{page.state === "locked" ? copy.locked : copy.photoWait}</p></div>}</div>
                {/* The mark alone. The words went inside the aria-label rather
                    than off the page: a stamp is a picture, and a reader that
                    cannot see it still has to be told the place was visited. */}
                {!["stamped", "complete"].includes(page.state) ? <p className="travel-passport__progress">{tf(copy.progress, { n: page.finds })}</p> : null}
                <div className="travel-passport__memory-actions">
                {["stamped", "complete"].includes(page.state) ? <PassportStamp className="travel-passport__stamp" label={copy.stamped} /> : null}
                {mode === "owner" && page.photoChoices && onPhotoSelect ? <button className="fm-btn fm-btn--ghost travel-passport__choose" type="button" onClick={() => setPanel("choose")}>{copy.choosePhoto}</button> : null}
                {mode === "owner" && page.state !== "locked" ? onPlay ? <button type="button" className="fm-btn fm-btn--secondary travel-passport__play" onClick={() => onPlay(page.id)}>{copy.play}</button> : page.playHref ? <a href={page.playHref} className="fm-btn fm-btn--secondary travel-passport__play">{copy.play}</a> : null : null}
                </div>
                <span className="travel-passport__folio" aria-hidden="true">{index * 2 + 1}</span>
              </section>
              <section className="travel-passport__leaf travel-passport__collection" aria-label={copy.collected}>
                <header className="travel-passport__collection-head"><span className="travel-passport__eyebrow">{copy.keepsakes}</span><h3>{copy.collected}</h3><p>{tf(copy.collectionCount, { n: foundCount, total: page.discoveries.length })}</p></header>
                <ul className="travel-passport__items">{page.discoveries.map((item, n) => <li key={item.id} data-collected={item.collected} style={{ "--item-delay": `${n * 70}ms` } as CSSProperties}>
                  {item.collected ? <button type="button" className="travel-passport__item" aria-haspopup="dialog" aria-label={tf(copy.details, { name: item.name ?? "" })} onClick={() => { setDetailId(item.id); setPanel("detail"); }}>{item.imageUrl ? image(item.imageUrl, "") : null}<strong>{item.name}</strong><span className={`travel-passport__rarity rarity-${item.rarity}`}>{t.game.collection.rarity[item.rarity]}</span></button> : <div className="travel-passport__missing" aria-label={copy.unknown}><span aria-hidden>?</span><span>{copy.unknown}</span></div>}
                </li>)}</ul>
                <p className="travel-passport__collection-note">{copy.collectionHint}</p>
                <span className="travel-passport__folio" aria-hidden="true">{index * 2 + 2}</span>
              </section>
            </div>
          </article> : null}
          {turn ? <div className="travel-passport__turning-leaf" aria-hidden="true"><div className="travel-passport__turn-face"><span className="travel-passport__eyebrow">{world?.title}</span><h3>{turn.page.title}</h3>{turn.page.photoUrl ? <div className="travel-passport__photo">{image(turn.page.photoUrl, "")}</div> : <span className="travel-passport__ghost-crest">✦</span>}</div><div className="travel-passport__turn-back"><span>✦</span></div></div> : null}
          {opening ? <div className="travel-passport__opening-cover" aria-hidden="true"><div className="travel-passport__cover">{coverArt}</div></div> : null}
        </div>}
        {open ? <><button type="button" className="travel-passport__edge travel-passport__edge--previous" aria-label={copy.previous} title={copy.previous} disabled={index === 0 || busy || Boolean(turn)} onClick={() => move(-1)}><span><Chevron right={dir === "rtl"} /></span></button>
        <button type="button" className="travel-passport__edge travel-passport__edge--next" aria-label={copy.next} title={copy.next} disabled={!world || index === world.pages.length - 1 || busy || Boolean(turn)} onClick={() => move(1)}><span><Chevron right={dir === "ltr"} /></span></button></> : null}
      </div>
      <footer className="travel-passport__reader-footer" inert={!open} aria-hidden={!open}><p className="travel-passport__swipe-hint">{copy.swipe}</p><nav className="travel-passport__places" aria-label={copy.places}>{world?.pages.map((p, n) => <button type="button" key={p.id} disabled={busy || Boolean(turn)} aria-label={`${n + 1}. ${p.title}`} aria-current={p.id === page?.id ? "page" : undefined} onClick={() => navigate(p)} className={`travel-passport__place${["stamped", "complete"].includes(p.state) ? " is-stamped" : ""}`}><span>{n + 1}</span></button>)}</nav><p className="travel-passport__reader-status" aria-live="polite" aria-atomic="true">{page ? `${page.title} · ${tf(copy.page, { n: index + 1, total: world!.pages.length })}` : ""}</p></footer>
    </div>
    {open && book.preparing ? <p role="status">{copy.preparing}</p> : null}
    <dialog ref={zoomDialog} className={`travel-passport__zoom travel-passport__zoom--${panel ?? "closed"}`} aria-label={panel === "detail" ? detail?.name : panel === "choose" ? copy.choosePhoto : copy.enlarge} onCancel={e => { e.preventDefault(); setPanel(null); }} onClick={e => { if (e.target === e.currentTarget) setPanel(null); }}>
      <button type="button" className="fm-btn" onClick={() => setPanel(null)} autoFocus>{copy.closePicture}</button>
      {panel === "photo" && page?.photoUrl ? image(page.photoUrl, page.title) : null}
      {panel === "detail" && detail ? <div className="travel-passport__fact" role="region" aria-label={detail.name}>{detail.imageUrl ? image(detail.imageUrl, "") : null}<h3>{detail.name}</h3><p>{detail.description}</p></div> : null}
      {panel === "choose" && mode === "owner" && onPhotoSelect ? <div className="travel-passport__photo-picker"><h3>{copy.choosePhoto}</h3><div>{page?.photoChoices?.map((choice, n) => <button key={choice.id} type="button" disabled={busy} aria-pressed={choice.selected} aria-label={`${tf(copy.photoChoice, { n: n + 1 })}${choice.selected ? ` — ${copy.selected}` : ""}`} onClick={() => void choose(choice.id)}>{image(choice.imageUrl, "")}</button>)}</div><p role="status">{message}</p></div> : null}
    </dialog>
  </section>;
}
