"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdventureBook } from "@/domain/adventure/book-schema";
import type { SceneConfig } from "@/domain/game/config";
import type { DiscoveryHintLevel } from "@/domain/adventure/discovery-guidance";
import { useGameText } from "../i18n";
import { AlbumCrop } from "./Album";
import { discoveryCopy } from "./discovery-copy";
import "./discovery-tray.css";

type Board = AdventureBook["boards"][number];
interface Props {
  board: Board; scene: SceneConfig; collectedIds: readonly string[];
  selectedId: string | null; hintLevel: DiscoveryHintLevel; disabled: boolean; muted: boolean;
  onSelect: (id: string | null) => void; onHint: () => void;
}

/** Selection is guidance only, never permission to collect. No storage or
 * rewards live here: the existing album store remains authoritative. */
export function DiscoveryTray({ board, scene, collectedIds, selectedId, hintLevel, disabled, muted, onSelect, onHint }: Props) {
  const { locale } = useGameText(), copy = discoveryCopy[locale];
  const [open, setOpen] = useState(false), [intro, setIntro] = useState(true), [canSpeak, setCanSpeak] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), id = useId();
  const selected = board.discoveries.find(d => d.id === selectedId && !collectedIds.includes(d.id));
  const count = board.discoveries.filter(d => collectedIds.includes(d.id)).length;
  useEffect(() => { setCanSpeak("speechSynthesis" in window); }, []);
  useEffect(() => {
    if (disabled || !intro) return;
    const t = setTimeout(() => setIntro(false), 7000);
    return () => clearTimeout(t);
  }, [disabled, intro]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  useEffect(() => { if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, [muted]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const speak = (text: string) => {
    if (!canSpeak || muted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "he" ? "he-IL" : "en-US";
    window.speechSynthesis.speak(utterance);
  };
  return <aside className="discovery-tray" aria-label={copy.title}>
    <button ref={trigger} type="button" className="discovery-tray__toggle" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(v => !v); setIntro(false); }}>
      <span aria-hidden>▧</span> {copy.title} <b>{count}/{board.discoveries.length}</b>
    </button>
    {intro && !disabled ? <div className="discovery-tray__intro"><p>{copy.intro}</p><button type="button" onClick={() => setIntro(false)} aria-label={copy.close}>×</button></div> : null}
    {selected && !open ? <div className="discovery-tray__focus">
      <AlbumCrop art={scene.art} crop={selected.cardCrop} className="discovery-tray__thumb" />
      <div><small>{copy.focus}</small><strong>{selected.name}</strong></div>
      <button type="button" disabled={disabled} onClick={onHint}>{copy.hint}</button>
      <button type="button" disabled={disabled} aria-label={copy.clear} onClick={() => onSelect(null)}>×</button>
      {hintLevel > 0 ? <p role="status">{hintLevel === 1 ? selected.hint : hintLevel === 2 ? copy.broad : copy.precise}</p> : null}
      {canSpeak ? <button type="button" disabled={disabled || muted} onClick={() => speak(hintLevel === 1 ? selected.hint : selected.name)}>{copy.listen}</button> : null}
    </div> : null}
    {open ? <div ref={panel} id={id} className="discovery-tray__panel" role="region" aria-label={copy.choose} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header><strong>{copy.choose}</strong><button type="button" aria-label={copy.close} onClick={close}>×</button></header>
      <p>{copy.note}</p>
      {canSpeak ? <button type="button" disabled={muted} onClick={() => speak(copy.intro)}>{copy.listen}</button> : null}
      <ul>{board.discoveries.map(d => {
        const collected = collectedIds.includes(d.id);
        return <li key={d.id}><button type="button" disabled={collected} aria-label={`${d.name}${collected ? ` — ${copy.collected}` : ""}`} aria-pressed={selectedId === d.id} onClick={() => { onSelect(d.id); close(); }}>
          <AlbumCrop art={scene.art} crop={d.cardCrop} className="discovery-tray__picture" />
          <strong>{d.name}</strong>
          {d.rarity ? <small className={`discovery-rarity discovery-rarity--${d.rarity}`}>{copy[d.rarity]}</small> : null}
          {collected ? <span>✓ {copy.collected}</span> : null}
        </button></li>;
      })}</ul>
      {count === board.discoveries.length ? <p className="discovery-tray__complete" role="status">{copy.complete}</p> : null}
    </div> : null}
  </aside>;
}
