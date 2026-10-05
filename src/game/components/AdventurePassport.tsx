"use client";

import { useEffect, useState } from "react";
import { getDict } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { projectPassport } from "@/domain/passport/passport";
import type { PlayStore } from "../store/play-store";
import { PassportBook } from "@/ui/passport/PassportBook";
import { OwnerPassport } from "@/ui/passport/OwnerPassport";
import type { PassportView } from "@/domain/passport/passport";
import { readPassportPreferences, keepPassportPreference } from "../engine/passport-storage";
import { PassportMemory } from "./PassportMemory";
import { AlbumCrop } from "./Album";
import { warmPassportBook } from "@/ui/passport/image-preload";
import { FriendDiscoveries } from "@/ui/friends/FriendDiscoveries";
import { guestWorldEligible } from "@/domain/guest-sharing";

type RemoteBook = { book: PassportView; childId: string };

/**
 * The owner's book, kept for this page session. The map asks for it in the background, so opening the passport
 * shows it at once and only refreshes it; one request at a time per game. Never stored beyond the page.
 */
const remoteBooks = new Map<string, { at: number; value: RemoteBook | null; pending: Promise<RemoteBook> | null }>();

export function prefetchOwnerPassport(gameId: string, maxAgeMs = 30_000): Promise<RemoteBook> {
  const entry = remoteBooks.get(gameId);
  if (entry?.pending) return entry.pending;
  if (entry?.value && Date.now() - entry.at < maxAgeMs) {
    warmPassportBook(entry.value.book, entry.value.childId);
    return Promise.resolve(entry.value);
  }
  const pending = fetch(`/api/passport?gameId=${encodeURIComponent(gameId)}`, { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new Error("passport-unavailable");
      const data = await response.json();
      const value: RemoteBook = { book: data.book, childId: data.childId };
      remoteBooks.set(gameId, { at: Date.now(), value, pending: null });
      warmPassportBook(value.book, value.childId);
      return value;
    })
    .catch(error => {
      remoteBooks.set(gameId, { at: entry?.at ?? 0, value: entry?.value ?? null, pending: null });
      throw error;
    });
  remoteBooks.set(gameId, { at: entry?.at ?? 0, value: entry?.value ?? null, pending });
  return pending;
}

export function AdventurePassport({ store }: { store: PlayStore }) {
  const owner = store.albumMode === "owner";
  const [remote, setRemote] = useState<RemoteBook | null>(() => owner ? remoteBooks.get(store.config.gameId)?.value ?? null : null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const preferenceKey = store.storageScope ?? store.config.gameId;
  const [preferences, setPreferences] = useState(() => store.demo ? {} : readPassportPreferences(preferenceKey));
  const dict = getDict(store.config.locale), copy = dict.travelPassport;
  useEffect(() => {
    if (!owner) return;
    let live = true;
    setFailed(false);
    // A book already on screen stays while a fresher one arrives; only a missing book shows the failure.
    prefetchOwnerPassport(store.config.gameId, 5_000).then(value => { if (live) setRemote(value); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [store.config.gameId, owner, attempt]);
  const book: PassportView | null = owner ? remote?.book ?? null : store.album ? {
    name: store.config.child.name, avatarUrl: store.config.child.avatarUrl, preparing: 0,
    worlds: projectPassport(store.config, store.album, preferences, (board, kind, id) => `${board}|${kind}|${id}`, true),
  } : null;
  const playHere = (gameId: string, board: string) => {
    if (gameId !== store.config.gameId) return false;
    store.openScene(board);
    return true;
  };
  return <I18nProvider locale={store.config.locale} dict={dict}><div className="adventure-passport"><button type="button" className="fm-btn fm-btn--ghost" onClick={() => store.goToMap()}>{dict.game.complete.map}</button>
    {owner && store.worldSlug && guestWorldEligible(store.config, store.worldSlug) ? <FriendDiscoveries gameId={store.config.gameId} worldSlug={store.worldSlug} /> : null}
    {owner && remote ? <OwnerPassport key={remote.childId} initial={remote.book} childId={remote.childId} onPlayHere={playHere} /> : book ? <PassportBook book={book} cursorKey={preferenceKey} onPlay={id => store.openScene(id)} onPhotoSelect={async (board, id) => {
      if (!store.demo && !keepPassportPreference(preferenceKey, board, { photoTargetId: id })) throw new Error("storage-unavailable");
      setPreferences(p => ({ ...p, [board]: { ...p[board] ?? { stampSeen: false, seenDiscoveries: [] }, photoTargetId: id } }));
    }} renderImage={(src, label) => {
      if (!src.includes("|")) return <img src={src} alt={label} />;
      const [board, kind, id] = src.split("|");
      const scene = store.config.scenes.find(s => s.slug === board);
      const item = store.config.adventure!.boards.find(b => b.boardSlug === board)?.discoveries.find(d => d.id === id);
      return kind === "photo" && store.album ? <PassportMemory config={store.config} progress={store.album} boardSlug={board!} targetId={id!} label={label} /> : scene && item ? <AlbumCrop art={scene.art} crop={item.cardCrop} label={label} /> : null;
    }} /> : <p role="status" className="adventure-passport__wait">{failed ? copy.unavailable : copy.opening}</p>}
    {failed && !remote ? <button className="fm-btn" onClick={() => setAttempt(n => n + 1)}>{copy.retry}</button> : null}
  </div></I18nProvider>;
}
