"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { PassportStamp } from "@/ui/passport/StampMark";
import { getDict } from "@/i18n";
import { passportCeremony, passportPhoto, type PassportPreference } from "@/domain/passport/passport";
import type { PlayStore } from "../store/play-store";
import type { GameConfig, SceneConfig } from "@/domain/game/config";
import { readPassportPreferences, keepPassportPreference } from "../engine/passport-storage";
import { PassportMemory } from "./PassportMemory";
import { AlbumCrop } from "./Album";
import { sounds } from "../audio/sounds";
import { useGameText } from "../i18n";
import { CelebrationOverlay } from "./CelebrationOverlay";
import "@/ui/passport/passport.css";

type Delta = { stamp: boolean; discoveryIds: string[] };
// Demo rewards survive replay only inside this mounted example, never in a real account.
const demoSeen = new WeakMap<GameConfig, Record<string, PassportPreference>>();
function sendSeen(childId: string, gameId: string, board: string, delta: Delta) {
  if (!delta.stamp && !delta.discoveryIds.length) return;
  // The local seen journal also retries on the next completion if offline.
  void fetch("/api/passport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId, gameId, board, choice: { kind: "seen", ...delta } }), keepalive: true }).catch(() => undefined);
}
/** Earned progress drives the celebration; account persistence is reported separately. */
export function PassportCompletion({ store, scene, onStay }: { store: PlayStore; scene: SceneConfig; onStay: () => void }) {
  const { g } = useGameText(), copy = getDict(store.config.locale).travelPassport;
  const [delta, setDelta] = useState<Delta | null>(null), [childId, setChildId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"waiting" | "playing" | "settled">("waiting");
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), acknowledged = useRef(false);
  const finishRef = useRef<() => void>(() => undefined);
  const board = store.config.adventure!.boards.find(b => b.boardSlug === scene.slug)!;
  const reduced = useRef(false);
  const mutedRef = useRef(store.muted);
  mutedRef.current = store.muted;
  const deltaRef = useRef(delta);
  deltaRef.current = delta;
  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const el = dialog.current; if (!el) return;
    if (el.showModal) el.showModal(); else el.setAttribute("open", "");
    return () => { if (el.open && el.close) el.close(); };
  }, []);
  useEffect(() => {
    if (!store.album || delta) return;
    // Earned local progress can celebrate immediately. Persistence is reported
    // separately below; neither AlbumSync nor the preference GET is an animation gate.
    const preference = store.demo ? demoSeen.get(store.config)?.[scene.slug] : readPassportPreferences(store.config.gameId)[scene.slug];
    const next = passportCeremony(store.album, scene.slug, preference);
    setPhotoTargetId(preference?.photoTargetId ?? null);
    setDelta(next); setPhase(reduced.current || !next.stamp && !next.discoveryIds.length ? "settled" : "playing");
  }, [store.album, store.config, scene.slug, store.demo, delta]);
  useEffect(() => {
    // Seen acknowledgements must still wait for confirmed account persistence.
    if (store.albumMode !== "owner" || store.albumState !== "saved") return;
    let active = true;
    setFailed(false);
      fetch(`/api/passport?${new URLSearchParams({ gameId: store.config.gameId, board: scene.slug })}`, { cache: "no-store" })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(data => {
          if (!active) return;
          if (!data.pending || !data.childId) throw new Error();
          const local = readPassportPreferences(store.config.gameId)[scene.slug];
          if (local) sendSeen(data.childId, store.config.gameId, scene.slug, { stamp: local.stampSeen, discoveryIds: local.seenDiscoveries });
          setPhotoTargetId(data.photoTargetId ?? null); setChildId(data.childId);
          // Reconcile an earlier visit on another device, but never restart a
          // settled ceremony when a slow response finally arrives.
          if (!acknowledged.current) {
            setDelta(current => current ? { stamp: current.stamp && data.pending.stamp,
              discoveryIds: current.discoveryIds.filter(id => data.pending.discoveryIds.includes(id)) } : current);
          }
        })
        .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [store.albumMode, store.albumState, store.config.gameId, scene.slug, attempt]);

  function acknowledge() {
    if (!delta || acknowledged.current) return;
    acknowledged.current = true;
    if (store.demo) {
      const all = demoSeen.get(store.config) ?? {}, old = all[scene.slug];
      all[scene.slug] = { photoTargetId, stampSeen: Boolean(old?.stampSeen || delta.stamp), seenDiscoveries: [...new Set([...old?.seenDiscoveries ?? [], ...delta.discoveryIds])] };
      demoSeen.set(store.config, all); return;
    }
    keepPassportPreference(store.config.gameId, scene.slug, { stampSeen: delta.stamp, seenDiscoveries: delta.discoveryIds });
    if (store.albumMode === "owner" && childId) {
      sendSeen(childId, store.config.gameId, scene.slug, delta);
    }
  }
  function settle() { setPhase("settled"); acknowledge(); }
  finishRef.current = settle;
  useEffect(() => {
    if (phase === "settled") { finishRef.current(); return; }
    if (phase !== "playing") return;
    // Impact aligns with the 65% press of the 280ms CSS stamp at +40ms.
    const cues = [setTimeout(() => { if (!mutedRef.current && deltaRef.current?.stamp) sounds().play("stamp"); }, 220)];
    const timer = setTimeout(() => finishRef.current(), 850);
    return () => { clearTimeout(timer); cues.forEach(clearTimeout); };
  }, [phase]);
  function leave(action: () => void) { acknowledge(); action(); }
  const photo = store.album ? passportPhoto(store.album, scene.slug, photoTargetId) : null;
  const found = new Set(store.album?.discoveries.filter(d => d.boardSlug === scene.slug).map(d => d.discoveryId));
  const next = store.nextScene();
  const saving = store.albumMode === "owner" && ["idle", "loading", "saving"].includes(store.albumState);
  const saveIssue = store.albumState === "unsaved" ? g.album.unsaved
    : store.albumState === "unreadable" ? g.album.unreadable
    : store.albumMode === "owner" && ["offline", "refused"].includes(store.albumState) ? g.album.offline : null;
  return <dialog ref={dialog} className={`passport-finale${store.demo ? " passport-finale--demo" : ""}`} data-phase={phase} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); leave(onStay); }}>
    <div className="passport-finale__inside">
      {phase === "playing" ? <CelebrationOverlay kind={scene.celebration.kind} small seed={store.visitId} /> : null}
      <header><p className="travel-passport__eyebrow">{scene.name}</p><h2 id={titleId}>{!delta ? copy.saving : delta.stamp ? copy.ceremony : delta.discoveryIds.length ? copy.newItems : g.replay.complete}</h2></header>
      <div className="passport-finale__page">
        <div className="passport-finale__memory">
          <div className="passport-finale__photo" data-new={Boolean(delta?.stamp)}>{photo && store.album ? <PassportMemory config={store.config} progress={store.album} boardSlug={scene.slug} targetId={photo.targetId} label={scene.name} /> : null}</div>
          <PassportStamp className="passport-finale__stamp" isNew={Boolean(delta?.stamp)} label={copy.stamped} />
        </div>
        <div><h3>{copy.collected}</h3><ul className="passport-finale__items">{board.discoveries.map((item, i) => <li key={item.id} data-new={delta?.discoveryIds.includes(item.id) ?? false} data-collected={found.has(item.id)} style={{ "--arrival": `${80 + i * 45}ms` } as CSSProperties}>{found.has(item.id) ? <><AlbumCrop art={scene.art} crop={item.cardCrop} label={item.name} /><span>{item.name}</span></> : <span aria-label={copy.unknown}>?</span>}</li>)}</ul></div>
      </div>
      <p className="passport-finale__status" role="status">{store.demo ? copy.demo : saveIssue ?? (saving ? copy.saving : failed ? copy.unavailable : store.albumMode === "owner" ? copy.savedAccount : copy.savedLocal)}</p>
      {failed ? <button className="fm-btn fm-btn--ghost" onClick={() => setAttempt(n => n + 1)}>{copy.retry}</button> : null}
      <div className="passport-finale__actions">
        {!store.demo ? <button className="fm-btn fm-btn--lg" autoFocus onClick={() => leave(next ? () => store.openScene(next) : store.goToWorlds)}>{next ? g.complete.next : g.hub.back}</button> : <button className="fm-btn fm-btn--lg" autoFocus onClick={() => leave(() => store.replayScene())}>{g.complete.again}</button>}
        <button className="fm-btn fm-btn--secondary" onClick={() => leave(onStay)}>{g.collection.keep}</button>
        {!store.demo ? <button className="fm-btn fm-btn--ghost" onClick={() => leave(store.openPassport)}>{copy.open}</button> : null}
        <button className="fm-btn fm-btn--ghost passport-finale__skip" onClick={settle} disabled={phase !== "playing"}>{copy.skip}</button>
      </div>
    </div>
  </dialog>;
}
