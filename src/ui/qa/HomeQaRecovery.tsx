"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { useQaImageRecovery } from "@/ui/passport/useQaImageRecovery";
import "./qa-recovery.css";

const Context = createContext<{ required: boolean; epoch: number; report: () => void } | null>(null);
export const QA_HOME_SIGN_IN = "/qa-access?next=%2F";

/** One failure-triggered gate check for the public QA home, never private readers.
 * Children stay mounted: signing in must not erase game or passport progress. */
export function HomeQaRecovery({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <ActiveHomeQaRecovery>{children}</ActiveHomeQaRecovery> : <>{children}</>;
}

function ActiveHomeQaRecovery({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false), [epoch, setEpoch] = useState(0);
  const images = useRef(new Set<HTMLImageElement>());
  const report = useCallback(() => setFailed(true), []);
  const required = useQaImageRecovery(failed, () => {
    // Retry only failed, still-mounted public images. No speculative downloads.
    for (const img of images.current) if (img.isConnected) {
      img.src = img.src;
      const sources = img.parentElement?.tagName === "PICTURE" ? img.parentElement.querySelectorAll("source") : [];
      for (const source of sources) source.srcset = source.srcset;
    }
    images.current.clear(); setFailed(false); setEpoch(n => n + 1);
  });
  return <Context.Provider value={{ required, epoch, report }}><div onErrorCapture={event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.currentSrc || img.src;
    if (!src || new URL(src, location.href).origin !== location.origin) return;
    images.current.add(img); report();
  }}>
    {children}
    {required ? <aside className="qa-home-recovery" aria-label={t.travelPassport.qaSignIn}>
      <p role="status">{t.travelPassport.qaHomeExpired}</p>
      <a className="fm-btn fm-btn--sm" href={QA_HOME_SIGN_IN} target="_blank" rel="noopener noreferrer">{t.travelPassport.qaSignIn} ↗</a>
    </aside> : null}
  </div></Context.Provider>;
}

/** Off-DOM board decoders report here too; without the home provider this is inert. */
export function useHomeQaRecovery(enabled: boolean, failed: boolean, onRecovered: () => void) {
  const context = useContext(Context), recover = useRef(onRecovered), seen = useRef(context?.epoch ?? 0);
  recover.current = onRecovered;
  const report = context?.report;
  useEffect(() => { if (enabled && failed) report?.(); }, [enabled, failed, report]);
  useEffect(() => {
    if (!context || seen.current === context.epoch) return;
    seen.current = context.epoch;
    if (enabled) recover.current();
  }, [context?.epoch, enabled]);
  return enabled ? context : null;
}
