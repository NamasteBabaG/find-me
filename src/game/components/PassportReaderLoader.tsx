"use client";

import { useEffect, useState, type ComponentType } from "react";
import { getDict } from "@/i18n";
import { useGameText } from "../i18n";
import type { PlayStore } from "../store/play-store";

type ReaderKind = "legacy" | "adventure";
type Reader = ComponentType<{ store: PlayStore }>;
type ReaderLoader = (kind: ReaderKind) => Promise<Reader>;
// Only component code is cached: never owner books, props or private pixels.
const readers: Record<ReaderKind, { reader?: Reader; pending?: Promise<Reader> }> = { legacy: {}, adventure: {} };

async function loadPassportReader(kind: ReaderKind): Promise<Reader> {
  const entry = readers[kind];
  if (entry.reader) return entry.reader;
  if (entry.pending) return entry.pending;
  const pending = (kind === "adventure"
    ? import("./AdventurePassport").then(module => module.AdventurePassport)
    : import("./Passport").then(module => {
      const Passport = module.Passport;
      return function LegacyReader({ store }: { store: PlayStore }) {
        return <Passport config={store.config} progress={store.progress} onMap={store.goToMap} onOpen={store.openScene}
          onReplay={store.replayScene} album={store.album} albumMode={store.albumMode} albumState={store.albumState} />;
      };
    })).then(reader => { entry.reader = reader; return reader; });
  entry.pending = pending;
  try { return await pending; }
  finally { if (entry.pending === pending) delete entry.pending; }
}

/** Import only the selected reader. A failed import is retryable and never
 * owns navigation, saved progress or the game shell's browser history. */
export function PassportReaderLoader({ kind, store, loadReader = loadPassportReader }: {
  kind: ReaderKind;
  store: PlayStore;
  loadReader?: ReaderLoader;
}) {
  const { g, locale } = useGameText();
  const copy = getDict(locale).travelPassport;
  const [loaded, setLoaded] = useState<{ kind: ReaderKind; reader: Reader } | null>(null);
  const [failed, setFailed] = useState<ReaderKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(null);
    setLoaded(null);
    // Catch a loader's synchronous failure as well as an import rejection.
    void Promise.resolve().then(() => loadReader(kind)).then(reader => {
      if (live) setLoaded({ kind, reader });
    }).catch(() => { if (live) setFailed(kind); });
    return () => { live = false; };
  }, [kind, loadReader, attempt]);
  const Reader = loaded?.kind === kind ? loaded.reader : null;
  if (Reader) return <Reader store={store} />;
  const unavailable = failed === kind;
  return <div className="passport-loader" aria-busy={!unavailable}>
    <p className="fm-lead" role="status">{unavailable ? copy.unavailable : copy.opening}</p>
    <div className="fm-row fm-row--center">
      {unavailable ? <button type="button" className="fm-btn" onClick={() => { setFailed(null); setAttempt(value => value + 1); }}>{copy.retry}</button> : null}
      <button type="button" className="fm-btn fm-btn--ghost" onClick={() => store.goToMap()}>{g.passport.map}</button>
    </div>
  </div>;
}
