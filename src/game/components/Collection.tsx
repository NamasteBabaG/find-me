"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AdventureBook } from "@/domain/adventure/book-schema";
import type { SceneConfig } from "@/domain/game/config";
import type { DiscoveryHintLevel } from "@/domain/adventure/discovery-guidance";
import { useGameText } from "../i18n";
import { useWide } from "../engine/useWide";
import { AlbumCrop } from "./Album";
import { flightLift } from "./StarFlight";
import "./collection.css";

type Board = AdventureBook["boards"][number];
type Discovery = Board["discoveries"][number];
export interface Point { x: number; y: number }
/** A discovery just collected, and where on the scene it was tapped: its sticker flies from there into its slot. */
export interface Arrival { id: string; from: Point; key: number }

/** How long a sticker is in the air. The slot lights when it lands. */
export const STICKER_FLIGHT_MS = 700;
const INTRO_MS = 6000;
const WIGGLE_MS = 600;

interface Props {
  board: Board;
  scene: SceneConfig;
  collectedIds: readonly string[];
  selectedId: string | null;
  hintLevel: DiscoveryHintLevel;
  disabled: boolean;
  muted: boolean;
  arrival?: Arrival | null;
  /** A tap on something already collected: its sticker wiggles instead of a second card. */
  repeat?: { id: string; key: number } | null;
  onSelect: (id: string | null) => void;
  onHint: () => void;
}

/**
 * The board's discoveries as a sticker collection. On a wide screen the six
 * stickers stay in view along the bottom edge: ghosted until found, then
 * full colour with a gold rim. On a phone they fold into one round button
 * with a progress ring, which opens a short sheet of the six. Tapping a
 * missing sticker means "let's look for this one": a small card names it
 * and gives hints in three steps. A sticker just found flies from where it
 * was tapped into its slot.
 *
 * Selection is guidance only, never permission to collect. Hit-testing and
 * storage stay in SceneViewport and the album store.
 */
export function Collection({ board, scene, collectedIds, selectedId, hintLevel, disabled, muted, arrival = null, repeat = null, onSelect, onHint }: Props) {
  const { g, tf, locale } = useGameText();
  const c = g.collection;
  const root = useRef<HTMLElement>(null);
  const wide = useWide(root);
  const sheetId = useId();
  const total = board.discoveries.length;
  const count = board.discoveries.filter((d) => collectedIds.includes(d.id)).length;
  const complete = total > 0 && count === total;
  const selected = board.discoveries.find((d) => d.id === selectedId && !collectedIds.includes(d.id)) ?? null;
  // On a bounded phone camera, a low-edge item cannot be panned above the
  // bottom hint card. Once the camera focuses it, use the opposite edge.
  const seekAbove = !wide && hintLevel >= 2 && !!selected && selected.hitRect.y + selected.hitRect.h / 2 > 0.5;
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(true);
  const [canSpeak, setCanSpeak] = useState(false);
  // Stickers that have landed in their slot. One that is still in the air stays ghosted until it lands.
  const [landed, setLanded] = useState<string[]>(() => [...collectedIds]);
  const landedAtMount = useRef(new Set(collectedIds));
  const [flight, setFlight] = useState<{ id: string; from: Point; to: Point; key: number } | null>(null);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());

  useEffect(() => { setCanSpeak("speechSynthesis" in window); }, []);
  useEffect(() => {
    if (disabled || !intro || complete) return;
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, [disabled, intro, complete]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) sheet.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [open]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  useEffect(() => { if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, [muted]);

  // The sticker just collected flies into its slot (the round button on a phone), then the slot lights.
  useLayoutEffect(() => {
    if (!arrival) return;
    const land = () => { setLanded((l) => (l.includes(arrival.id) ? l : [...l, arrival.id])); setBump((b) => b + 1); };
    // The tap point arrives in the scene's pixels; the flight is drawn inside
    // this strip, so both ends are moved into the strip's own frame.
    const own = root.current?.getBoundingClientRect();
    const sceneBox = root.current?.closest(".scene")?.getBoundingClientRect() ?? root.current?.parentElement?.getBoundingClientRect();
    const target = slots.current.get(arrival.id) ?? trigger.current;
    const r = target?.getBoundingClientRect();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (!own || !sceneBox || !r || r.width === 0 || still) { land(); return; }
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

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const speak = (text: string) => {
    if (!canSpeak || muted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "he" ? "he-IL" : "en-US";
    window.speechSynthesis.speak(utterance);
  };
  const latest = [...board.discoveries].reverse().find((d) => landed.includes(d.id)) ?? null;

  const sticker = (d: Discovery, size: "sm" | "lg") => {
    const got = collectedIds.includes(d.id);
    const shown = got && landed.includes(d.id);
    const fresh = shown && !landedAtMount.current.has(d.id);
    const seeking = selected?.id === d.id;
    const className = ["sticker", `sticker--${size}`, shown ? "sticker--got" : got ? "sticker--arriving" : "", fresh ? "sticker--fresh" : "", seeking ? "sticker--seeking" : "", wiggle === d.id ? "sticker--wiggle" : ""].filter(Boolean).join(" ");
    return (
      <li key={d.id} className="collect__item">
        <button
          ref={(el) => { if (el) slots.current.set(d.id, el); else slots.current.delete(d.id); }}
          type="button"
          className={className}
          disabled={disabled || got}
          aria-pressed={seeking}
          aria-label={got ? tf(c.collectedAria, { name: d.name }) : d.name}
          data-discovery={d.id}
          data-collected={got}
          onClick={() => { onSelect(seeking ? null : d.id); setOpen(false); setIntro(false); }}
        >
          <span className="sticker__face"><AlbumCrop art={scene.art} crop={d.cardCrop} className="sticker__picture" /></span>
          {d.rarity ? <span className={`sticker__rarity sticker__rarity--${d.rarity}`}>{c.rarity[d.rarity]}</span> : null}
          {size === "lg" ? <span className="sticker__name">{d.name}</span> : null}
        </button>
      </li>
    );
  };

  const tally = tf(c.tally, { found: count, total });
  const countAria = tf(c.countAria, { found: count, total });
  const ring = 2 * Math.PI * 21;
  return (
    <aside ref={root} className={`collect${wide ? " collect--wide" : " collect--compact"}${complete ? " collect--complete" : ""}${seekAbove ? " collect--seek-above" : ""}`} aria-label={c.title}>
      {wide ? (
        <div className="collect__strip" role="group" aria-label={countAria}>
          <span key={bump} className={`collect__tally${bump ? " collect__tally--bump" : ""}`} aria-hidden>{tally}</span>
          <ul className="collect__slots">{board.discoveries.map((d) => sticker(d, "sm"))}</ul>
          {complete ? <span className="collect__done" aria-hidden>✨</span> : null}
        </div>
      ) : (
        <button ref={trigger} type="button" className="collect__fab" disabled={disabled} aria-expanded={open} aria-controls={sheetId} aria-label={countAria} onClick={() => { setOpen((v) => !v); setIntro(false); }}>
          <svg className="collect__ring" viewBox="0 0 48 48" aria-hidden>
            <circle className="collect__ring-track" cx="24" cy="24" r="21" />
            <circle className="collect__ring-fill" cx="24" cy="24" r="21" style={{ strokeDasharray: ring, strokeDashoffset: ring * (1 - (total ? count / total : 0)) }} />
          </svg>
          <span className="collect__fab-face">
            {latest ? <AlbumCrop art={scene.art} crop={latest.cardCrop} className="sticker__picture" /> : <span aria-hidden>✦</span>}
          </span>
          <b key={bump} className={`collect__count${bump ? " collect__count--bump" : ""}`} aria-hidden>{tally}</b>
        </button>
      )}

      {intro && !disabled && !complete && !selected && !open ? (
        <p className="collect__intro" role="status"><span aria-hidden>✨</span> {tf(c.intro, { count: total })}</p>
      ) : null}

      {selected && !open ? (
        <div className="collect__seek" role="status">
          <AlbumCrop art={scene.art} crop={selected.cardCrop} className="collect__seek-thumb" />
          <div className="collect__seek-body">
            <small className="collect__seek-label">{c.seeking}</small>
            <strong className="collect__seek-name">{selected.name}</strong>
            {hintLevel > 0 ? <p className="collect__seek-hint">{hintLevel === 1 ? selected.hint : hintLevel === 2 ? c.hintBroad : c.hintPrecise}</p> : null}
          </div>
          <div className="collect__seek-actions">
            <button type="button" className="collect__hint" disabled={disabled || hintLevel >= 3} onClick={onHint}>{hintLevel === 0 ? c.hint : hintLevel === 1 ? c.hintArea : c.hintShow}</button>
            {canSpeak ? <button type="button" className="collect__speak" disabled={disabled || muted} aria-label={c.listen} onClick={() => speak(hintLevel === 1 ? selected.hint : selected.name)}><span aria-hidden>🔊</span></button> : null}
            <button type="button" className="collect__close" aria-label={c.stopSeeking} onClick={() => onSelect(null)}><span aria-hidden>×</span></button>
          </div>
        </div>
      ) : null}

      {open && !wide ? (
        <div ref={sheet} id={sheetId} className="collect__sheet" role="dialog" aria-label={tf(c.sheetTitle, { place: scene.name })} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
          <header className="collect__sheet-head">
            <h2 className="collect__sheet-title">{tf(c.sheetTitle, { place: scene.name })}</h2>
            <span className="collect__tally" aria-label={countAria}>{tally}</span>
            <button type="button" className="collect__close" aria-label={c.close} onClick={close}><span aria-hidden>×</span></button>
          </header>
          <ul className="collect__grid">{board.discoveries.map((d) => sticker(d, "lg"))}</ul>
          <p className="collect__note">{complete ? c.complete : c.note}</p>
          {canSpeak && !complete ? <button type="button" className="collect__speak collect__speak--wide" disabled={muted} onClick={() => speak(`${tf(c.sheetTitle, { place: scene.name })}. ${c.note}`)}><span aria-hidden>🔊</span> {c.listen}</button> : null}
        </div>
      ) : null}

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
