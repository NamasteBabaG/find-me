"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AdventureBook } from "@/domain/adventure/book-schema";
import type { SceneConfig } from "@/domain/game/config";
import type { DiscoveryHintLevel } from "@/domain/adventure/discovery-guidance";
import { useGameText } from "../i18n";
import { AlbumCrop } from "./Album";
import { ToolIcon } from "./ToolIcon";
import { flightLift } from "./StarFlight";
import "./collection.css";

type Board = AdventureBook["boards"][number];
type Discovery = Board["discoveries"][number];
export interface Point { x: number; y: number }
/** A discovery just collected, and where on the scene it was tapped: its sticker flies from there into its slot. */
export interface Arrival { id: string; from: Point; key: number }

/** How long a sticker is in the air. The slot lights when it lands. */
export const STICKER_FLIGHT_MS = 700;
/** The tray holds itself open once, on arrival, so the button is never a mystery. */
export const PEEK_MS = 2000;
export const REMINDER_MS = 3200;
/** Long enough to read as folding back into the button, short enough not to be a wait. */
const SHEET_OUT_MS = 220;
const WIGGLE_MS = 600;

function stillMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

interface Props {
  board: Board;
  scene: SceneConfig;
  collectedIds: readonly string[];
  selectedId: string | null;
  hintLevel: DiscoveryHintLevel;
  disabled: boolean;
  /** Camera gestures briefly clear the painting without discarding the chosen discovery or its hints. */
  obscured?: boolean;
  muted: boolean;
  searchComplete?: boolean;
  arrival?: Arrival | null;
  /** A tap on something already collected: its sticker wiggles instead of a second card. */
  repeat?: { id: string; key: number } | null;
  onSelect: (id: string | null) => void;
  onHint: () => void;
}

/**
 * The board's discoveries as a sticker collection — ONE shape on every screen:
 * a round button in the bottom-right corner of the board that opens a tray of
 * the six above it. There is no second, wider arrangement to learn (Guy): the
 * six used to lie along the bottom edge of a wide screen and fold away behind a
 * chevron, which made the same collection two different objects.
 *
 * Every sticker is in full colour from the first frame, found or not, so a child
 * can recognise what they are hunting for. What changes when it is found is a
 * green ring and a green tick on its rim — an addition, never the removal of
 * colour, which used to leave five grey discs a child could not read.
 *
 * The tray holds itself open for two seconds when the board opens and then folds
 * back into its button, so the child sees where it lives and what the button
 * does without being told. That peek is decoration: it takes no focus, it is not
 * a dialog, and it never happens for a reader who asked for less motion.
 *
 * Tapping a sticker means "let's look for this one": a card names it and gives
 * hints in three steps. Selection is guidance only, never permission to collect
 * — hit-testing and storage stay in SceneViewport and the album store.
 */
export function Collection({ board, scene, collectedIds, selectedId, hintLevel, disabled, obscured = false, muted, searchComplete = false, arrival = null, repeat = null, onSelect, onHint }: Props) {
  const { g, tf, locale, dir } = useGameText();
  const c = g.collection;
  const root = useRef<HTMLElement>(null);
  const sheetId = useId();
  const previewTitleId = useId();
  const total = board.discoveries.length;
  const count = board.discoveries.filter((d) => collectedIds.includes(d.id)).length;
  const complete = total > 0 && count === total;
  const selected = board.discoveries.find((d) => d.id === selectedId) ?? null;
  const selectedCollected = !!selected && collectedIds.includes(selected.id);
  // On a bounded phone camera, a low-edge item cannot be panned above the
  // bottom hint card. Once the camera focuses it, use the opposite edge.
  const seekAbove = hintLevel >= 2 && !!selected && selected.hitRect.y + selected.hitRect.h / 2 > 0.5;
  /** null = shut. "peek" = the two-second welcome, which takes no focus. "user" = they asked for it. */
  const [open, setOpen] = useState<null | "peek" | "user">(null);
  const [closing, setClosing] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = board.discoveries.find(d => d.id === inspectedId) ?? null;
  const preview = useRef<HTMLDialogElement>(null);
  const inspectTrigger = useRef<HTMLButtonElement>(null);
  // Stickers that have landed in their slot. One that is still in the air stays plain until it lands.
  const [landed, setLanded] = useState<string[]>(() => [...collectedIds]);
  const landedAtMount = useRef(new Set(collectedIds));
  const [flight, setFlight] = useState<{ id: string; from: Point; to: Point; key: number } | null>(null);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peeked = useRef(false);
  const reminded = useRef(false);

  // What is open, readable from a timer that was armed several renders ago: the
  // peek's own closer fires two seconds after the render that armed it, and a
  // closure over `open` from that render would still read null.
  const openRef = useRef<null | "peek" | "user">(null);
  openRef.current = open;

  const cancelPeek = () => { if (peekTimer.current) { clearTimeout(peekTimer.current); peekTimer.current = null; } };
  /** Shut it the way it opened: folding back into the button, not blinking out. */
  const shut = (focusBack: boolean) => {
    cancelPeek();
    // Nothing is open — a board that went busy before the tray ever showed must
    // not play the fold-away of a tray nobody saw.
    if (openRef.current === null) return;
    setOpen(null);
    if (focusBack) trigger.current?.focus();
    if (stillMotion()) return;
    setClosing(true);
    if (outTimer.current) clearTimeout(outTimer.current);
    outTimer.current = setTimeout(() => { setClosing(false); outTimer.current = null; }, SHEET_OUT_MS);
  };
  /**
   * A tap during the welcome peek takes the tray over instead of dismissing it:
   * a hand reaching for the button while the tray is showing wants the tray, and
   * closing it a moment before it would have closed itself is a wasted tap.
   */
  const toggle = () => {
    if (disabled || obscured) return;
    cancelPeek();
    if (open === "user") shut(true); else setOpen("user");
  };
  /**
   * Picking one is not dismissing the tray, it is replacing it: the seek card
   * takes the same place, so the tray gives way at once instead of folding away
   * first. Folding is for "I am done here" — the button, the ×, Escape, the peek.
   */
  const pick = (id: string | null) => {
    cancelPeek();
    if (outTimer.current) { clearTimeout(outTimer.current); outTimer.current = null; }
    setOpen(null);
    setClosing(false);
    onSelect(id);
  };
  const closePreview = () => {
    preview.current?.close?.();
    setInspectedId(null);
    if (!obscured && !disabled) inspectTrigger.current?.focus();
  };

  useEffect(() => {
    if (disabled || obscured || inspectedId !== selectedId) setInspectedId(null);
  }, [disabled, obscured, inspectedId, selectedId]);
  useEffect(() => {
    const dialog = preview.current;
    if (!dialog || !inspected || disabled || obscured) return;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    return () => { if (dialog.open) dialog.close?.(); };
  }, [inspected, disabled, obscured]);

  useEffect(() => { setCanSpeak("speechSynthesis" in window); }, []);
  useEffect(() => () => { if (outTimer.current) clearTimeout(outTimer.current); cancelPeek(); }, []);
  // The welcome peek, once, the moment the board is actually playable — never
  // behind the cloud curtain, never on a board already finished, never for a
  // reader who asked for less motion.
  useEffect(() => {
    if (peeked.current || disabled || obscured || complete || selectedId) return;
    peeked.current = true;
    if (stillMotion()) return;
    setOpen("peek");
    peekTimer.current = setTimeout(() => { peekTimer.current = null; shut(false); }, PEEK_MS);
    return cancelPeek;
  }, [disabled, obscured, complete, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Let the last-star celebration finish first. Returning to the board then
  // reminds the player once; taking over the tray cancels its automatic closer.
  useEffect(() => {
    if (reminded.current || !searchComplete || disabled || obscured || complete || !total || selectedId) return;
    const timer = setTimeout(() => {
      if (openRef.current === "user") { reminded.current = true; return; }
      reminded.current = true;
      if (stillMotion()) return;
      cancelPeek();
      setBump((b) => b + 1);
      setOpen("peek");
      peekTimer.current = setTimeout(() => { peekTimer.current = null; shut(false); }, REMINDER_MS);
    }, 1200);
    return () => clearTimeout(timer);
  }, [searchComplete, disabled, obscured, complete, total, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The board went busy (a page turn, the curtain): fold away, do not take focus.
  useEffect(() => {
    if (obscured) {
      if (openRef.current === "peek") {
        if (searchComplete) reminded.current = false; else peeked.current = false;
      }
      cancelPeek();
      if (outTimer.current) { clearTimeout(outTimer.current); outTimer.current = null; }
      setOpen(null); setClosing(false);
      return;
    }
    if (disabled) shut(false);
  }, [disabled, obscured, searchComplete]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only a tray they opened takes the focus; the peek must not steal it mid-search.
  useEffect(() => { if (open === "user" && !obscured) sheet.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [open, obscured]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  useEffect(() => { if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, [muted]);

  // The sticker just collected flies into its slot (or the button, when the tray is shut), then the slot lights.
  useLayoutEffect(() => {
    if (!arrival) return;
    const land = () => { setLanded((l) => (l.includes(arrival.id) ? l : [...l, arrival.id])); setBump((b) => b + 1); };
    // The tap point arrives in the scene's pixels; the flight is drawn inside
    // this tray, so both ends are moved into the tray's own frame.
    const own = root.current?.getBoundingClientRect();
    const sceneBox = root.current?.closest(".scene")?.getBoundingClientRect() ?? root.current?.parentElement?.getBoundingClientRect();
    const target = slots.current.get(arrival.id) ?? trigger.current;
    const r = target?.getBoundingClientRect();
    if (!own || !sceneBox || !r || r.width === 0 || stillMotion()) { land(); return; }
    const from = { x: arrival.from.x + sceneBox.left - own.left, y: arrival.from.y + sceneBox.top - own.top };
    setFlight({ id: arrival.id, from, to: { x: r.left - own.left + r.width / 2, y: r.top - own.top + r.height / 2 }, key: arrival.key });
    const t = setTimeout(() => { setFlight(null); land(); }, STICKER_FLIGHT_MS);
    return () => clearTimeout(t);
  }, [arrival]);
  // Collected some other way (a refresh, the account): shown at once.
  useEffect(() => {
    const missing = collectedIds.filter((x) => !landed.includes(x) && x !== arrival?.id && x !== flight?.id);
    if (missing.length) setLanded((l) => [...l, ...missing]);
  }, [collectedIds, landed, arrival, flight]);
  useEffect(() => {
    if (!repeat) return;
    setWiggle(repeat.id);
    const t = setTimeout(() => setWiggle(null), WIGGLE_MS);
    return () => clearTimeout(t);
  }, [repeat]);

  const speak = (text: string) => {
    if (!canSpeak || muted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "he" ? "he-IL" : "en-US";
    window.speechSynthesis.speak(utterance);
  };
  const latest = [...board.discoveries].reverse().find((d) => landed.includes(d.id)) ?? null;

  const sticker = (d: Discovery) => {
    const got = collectedIds.includes(d.id);
    const shown = got && landed.includes(d.id);
    const fresh = shown && !landedAtMount.current.has(d.id);
    const seeking = selected?.id === d.id;
    const className = ["sticker", shown ? "sticker--got" : got ? "sticker--arriving" : "", fresh ? "sticker--fresh" : "", seeking ? "sticker--seeking" : "", wiggle === d.id ? "sticker--wiggle" : ""].filter(Boolean).join(" ");
    return (
      <li key={d.id} className="collect__item">
        <button
          ref={(el) => { if (el) slots.current.set(d.id, el); else slots.current.delete(d.id); }}
          type="button"
          className={className}
          disabled={disabled}
          aria-pressed={seeking}
          aria-label={got ? tf(c.collectedAria, { name: d.name }) : tf(c.pending, { name: d.name })}
          data-discovery={d.id}
          data-collected={got}
          onClick={() => pick(seeking ? null : d.id)}
        >
          <span className="sticker__face">
            <AlbumCrop art={scene.art} crop={d.cardCrop} className="sticker__picture" />
            {/* The one difference between found and not: an addition, never a colour taken away. */}
            {shown ? (
              <span className="sticker__check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4.5 4.5L19 7" /></svg>
              </span>
            ) : null}
          </span>
          {d.rarity ? <span className={`sticker__rarity sticker__rarity--${d.rarity}`}>{c.rarity[d.rarity]}</span> : null}
          <span className="sticker__name">{d.name}</span>
        </button>
      </li>
    );
  };

  const tally = tf(c.tally, { found: count, total });
  const countAria = tf(c.countAria, { found: count, total });
  const ring = 2 * Math.PI * 21;
  const showSheet = !obscured && (open !== null || closing);
  const asDialog = !obscured && open === "user";
  // The still cue that more is waiting here. The peek and the reminder are motion and skip a reader who
  // asked for less of it; this badge is for everyone, once the hiding spots are done.
  const leftBadge = searchComplete && !complete && total > 0 && !showSheet && !selected;
  return (
    <aside ref={root} className={`collect${complete ? " collect--complete" : ""}${seekAbove ? " collect--seek-above" : ""}${obscured ? " collect--obscured" : ""}`} aria-label={c.title} aria-hidden={obscured || undefined} inert={obscured || undefined}>
      {/* The box is laid out left-to-right so the button keeps its physical corner (collection.css); each part
          carries the game's own direction for its words and marks. */}
      <button ref={trigger} type="button" className="collect__fab" dir={dir} data-game-cue="drawer" disabled={disabled || obscured} aria-expanded={asDialog} aria-controls={sheetId} aria-label={countAria} onClick={toggle}>
        <svg className="collect__ring" viewBox="0 0 48 48" aria-hidden>
          <circle className="collect__ring-track" cx="24" cy="24" r="21" />
          <circle className="collect__ring-fill" cx="24" cy="24" r="21" style={{ strokeDasharray: ring, strokeDashoffset: ring * (1 - (total ? count / total : 0)) }} />
        </svg>
        <span className="collect__fab-face">
          {latest ? <AlbumCrop art={scene.art} crop={latest.cardCrop} className="sticker__picture" /> : <span aria-hidden>✦</span>}
        </span>
        <b key={bump} className={`collect__count${bump ? " collect__count--bump" : ""}`} aria-hidden>{tally}</b>
        {leftBadge ? <span className="collect__left" aria-hidden><span>✦</span> {tf(c.left, { n: total - count })}</span> : null}
      </button>

      {selected && !showSheet ? (
        <div className="collect__seek" dir={dir} role="status" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onSelect(null); trigger.current?.focus(); } }}>
          <button ref={inspectTrigger} type="button" className="collect__inspect" disabled={disabled} aria-haspopup="dialog" aria-label={tf(c.inspectPicture, { name: selected.name })} onClick={() => setInspectedId(selected.id)}>
            <AlbumCrop art={scene.art} crop={selected.cardCrop} className="collect__seek-thumb" />
            <span className="collect__inspect-mark" aria-hidden="true"><ToolIcon name="zoom-in" /></span>
          </button>
          <div className="collect__seek-body">
            <small className="collect__seek-label">{selectedCollected ? c.foundLabel : c.seeking}</small>
            <strong className="collect__seek-name">{selected.name}</strong>
            {!selectedCollected && hintLevel > 0 ? <p className="collect__seek-hint">{hintLevel === 1 ? selected.hint : hintLevel === 2 ? c.hintBroad : c.hintPrecise}</p> : null}
          </div>
          <button type="button" className="collect__close collect__seek-close" aria-label={c.stopSeeking} onClick={() => onSelect(null)}><span aria-hidden>×</span></button>
          <div className="collect__seek-actions">
            {!selectedCollected ? <button type="button" className="collect__hint" disabled={disabled || hintLevel >= 3} onClick={onHint}>{hintLevel === 0 ? c.hint : hintLevel === 1 ? c.hintArea : c.hintShow}</button> : null}
            {canSpeak ? <button type="button" className="collect__speak" disabled={disabled || muted} aria-label={c.listen} onClick={() => speak(hintLevel === 1 ? selected.hint : selected.name)}><span aria-hidden>🔊</span></button> : null}
          </div>
        </div>
      ) : null}

      {showSheet ? (
        <div
          ref={sheet}
          id={sheetId}
          dir={dir}
          className={`collect__sheet${closing ? " collect__sheet--closing" : ""}${open === "peek" ? " collect__sheet--peek" : ""}`}
          role={asDialog ? "dialog" : undefined}
          aria-label={asDialog ? tf(c.sheetTitle, { place: scene.name }) : undefined}
          aria-hidden={asDialog ? undefined : true}
          inert={asDialog ? undefined : true}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); shut(true); } }}
        >
          <header className="collect__sheet-head">
            {/* The place is in the dialog's name, not on its face: "Discoveries in
                A day at the beach" truncated to "…at th…" on a phone, and a child
                who is standing on the board already knows which board it is. */}
            <h2 className="collect__sheet-title">{c.title}</h2>
            <span className="collect__tally" aria-label={countAria}>{tally}</span>
            {canSpeak ? <button type="button" className="collect__speak" disabled={muted} aria-label={c.listen} onClick={() => speak(`${tf(c.sheetTitle, { place: scene.name })}. ${complete ? c.complete : c.note}`)}><span aria-hidden>🔊</span></button> : null}
            <button type="button" className="collect__close" aria-label={c.close} onClick={() => shut(true)}><span aria-hidden>×</span></button>
          </header>
          <ul className="collect__grid">{board.discoveries.map(sticker)}</ul>
          <p className="collect__note">{complete ? c.complete : c.note}</p>
        </div>
      ) : null}

      {inspected && !obscured && !disabled ? <dialog ref={preview} className="collect__preview" dir={dir} aria-labelledby={previewTitleId}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); closePreview(); }}
        onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
        <header className="collect__preview-head"><h2 id={previewTitleId}>{inspected.name}</h2>
          <button type="button" className="collect__close" autoFocus onClick={closePreview} aria-label={c.closePicture}><span aria-hidden="true">×</span></button>
        </header>
        <AlbumCrop art={scene.art} crop={inspected.cardCrop} className="collect__preview-picture" label={inspected.name} />
        {!selectedCollected && hintLevel > 0 ? <p className="collect__preview-hint">{hintLevel === 1 ? inspected.hint : hintLevel === 2 ? c.hintBroad : c.hintPrecise}</p> : null}
        {canSpeak ? <button type="button" className="collect__speak" disabled={muted} aria-label={c.listen} onClick={() => speak(hintLevel === 1 ? inspected.hint : inspected.name)}><span aria-hidden="true">🔊</span></button> : null}
      </dialog> : null}

      {flight ? (
        <div
          key={flight.key}
          className="collect__fly"
          aria-hidden
          style={{ "--x0": `${Math.round(flight.from.x)}px`, "--y0": `${Math.round(flight.from.y)}px`, "--x1": `${Math.round(flight.to.x)}px`, "--y1": `${Math.round(flight.to.y)}px`, "--lift": `${-flightLift({ from: flight.from, to: flight.to })}px`, "--fly-ms": `${STICKER_FLIGHT_MS}ms` } as CSSProperties}
        >
          <div className="collect__fly-arc">
            <div className="collect__fly-sticker">
              {(() => { const d = board.discoveries.find((x) => x.id === flight.id); return d ? <AlbumCrop art={scene.art} crop={d.cardCrop} className="sticker__picture" /> : null; })()}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
