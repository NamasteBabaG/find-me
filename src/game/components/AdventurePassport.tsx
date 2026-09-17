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

export function AdventurePassport({ store }: { store: PlayStore }) {
  const [remote, setRemote] = useState<{ book: PassportView; childId: string } | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [preferences, setPreferences] = useState(() => store.demo ? {} : readPassportPreferences(store.config.gameId));
  const dict = getDict(store.config.locale), copy = dict.travelPassport;
  useEffect(() => {
    if (store.albumMode !== "owner") return;
    const abort = new AbortController(); setFailed(false);
    fetch(`/api/passport?gameId=${encodeURIComponent(store.config.gameId)}`, { cache: "no-store", signal: abort.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(setRemote).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [store.config.gameId, store.albumMode, attempt]);
  const book: PassportView | null = store.albumMode === "owner" ? remote?.book ?? null : store.album ? {
    name: store.config.child.name, avatarUrl: store.config.child.avatarUrl, preparing: 0,
    worlds: projectPassport(store.config, store.album, preferences, (board, kind, id) => `${board}|${kind}|${id}`, true),
  } : null;
  return <I18nProvider locale={store.config.locale} dict={dict}><div className="adventure-passport"><button type="button" className="fm-btn fm-btn--ghost" onClick={() => store.goToMap()}>{dict.game.complete.map}</button>
    {store.albumMode === "owner" && remote ? <OwnerPassport initial={remote.book} childId={remote.childId} /> : book ? <PassportBook book={book} cursorKey={store.config.gameId} onPlay={id => store.openScene(id)} onPhotoSelect={async (board, id) => {
      if (!store.demo && !keepPassportPreference(store.config.gameId, board, { photoTargetId: id })) throw new Error("storage-unavailable");
      setPreferences(p => ({ ...p, [board]: { ...p[board] ?? { stampSeen: false, seenDiscoveries: [] }, photoTargetId: id } }));
    }} renderImage={(src, label) => {
      if (!src.includes("|")) return <img src={src} alt={label} />;
      const [board, kind, id] = src.split("|");
      const scene = store.config.scenes.find(s => s.slug === board);
      const item = store.config.adventure!.boards.find(b => b.boardSlug === board)?.discoveries.find(d => d.id === id);
      return kind === "photo" && store.album ? <PassportMemory config={store.config} progress={store.album} boardSlug={board!} targetId={id!} label={label} /> : scene && item ? <AlbumCrop art={scene.art} crop={item.cardCrop} label={label} /> : null;
    }} /> : <p role="status">{failed ? copy.unavailable : copy.saving}</p>}
    {failed ? <button className="fm-btn" onClick={() => setAttempt(n => n + 1)}>{copy.retry}</button> : null}
  </div></I18nProvider>;
}
