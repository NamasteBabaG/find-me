"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { PassportView } from "@/domain/passport/passport";
import { PassportBook } from "./PassportBook";

function SharedPicture({ source, token, label, onUnavailable }: { source: string; token: string; label: string; onUnavailable: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | null = null;
    setUrl(null); setFailed(false);
    fetch("/api/passport/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, media: source.replace("passport-media:", "") }), cache: "no-store", signal: controller.signal })
      .then(async response => { if (response.status === 404) { onUnavailable(); throw new Error(); } if (!response.ok) throw new Error(); return response.blob(); })
      .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, token]);
  return url ? <img src={url} alt={label} /> : <span className="travel-passport__photo-wait" role="status">{failed ? t.travelPassport.photoUnavailable : t.passportSharing.loading}</span>;
}
export function SharedPassport() {
  const { t } = useI18n();
  const [book, setBook] = useState<PassportView | null>(null), [token, setToken] = useState(""), [unavailable, setUnavailable] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const secret = window.location.hash.slice(1); setToken(secret);
    if (!secret) { setUnavailable(true); return; }
    const controller = new AbortController();
    const load = () => {
      if (document.hidden) return;
      fetch("/api/passport/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: secret }), cache: "no-store", signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => { setBook(data.book); setUnavailable(false); }).catch(() => { if (!controller.signal.aborted) { setBook(null); setUnavailable(true); } });
    };
    load(); window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [attempt]);
  return <main className="shared-passport"><span className="shared-passport__brand">Find Me Worlds</span><p>{t.passportSharing.readOnly}</p>
    {book && !unavailable ? <PassportBook book={book} mode="shared" renderImage={(source, label) => <SharedPicture source={source} token={token} label={label} onUnavailable={() => { setUnavailable(true); setBook(null); }} />} /> : <div role="status"><p>{unavailable ? t.passportSharing.unavailable : t.passportSharing.loading}</p>{unavailable ? <button className="fm-btn" onClick={() => setAttempt(n => n + 1)}>{t.travelPassport.retry}</button> : null}</div>}
  </main>;
}
