"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { PassportView } from "@/domain/passport/passport";
import { PassportBook } from "./PassportBook";
import { ConfirmDialog } from "../ConfirmDialog";

/** Adult actions live outside the child's completion flow. Sharing starts off. */
export function PassportSharing({ childId }: { childId: string }) {
  const { t, locale } = useI18n(), copy = t.passportSharing;
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<PassportView | null>(null), [adult, setAdult] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [url, setUrl] = useState<string | null>(null), [message, setMessage] = useState("");
  const [previewToken, setPreviewToken] = useState<string | undefined>();
  const [confirmation, setConfirmation] = useState<"rotate" | "revoke" | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("share") === "1") { setOpen(true); void send("status"); }
  }, []);
  async function send(operation: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/passport/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId, operation, locale, previewToken, consent: confirmed }) });
      if (!response.ok) throw new Error(); const data = await response.json();
      setAdult(Boolean(data.needsAdult));
      if (data.book) { setPreview(data.book); setPreviewToken(data.previewToken); setConfirmed(false); }
      if ("url" in data) setUrl(data.url);
      if (operation === "reauth") setMessage(copy.emailSent);
      if (operation === "revoke") { setPreview(null); setConfirmed(false); setMessage(copy.revoked); }
    } catch { setMessage(copy.failed); } finally { setBusy(false); setConfirmation(null); }
  }
  return <section className="passport-sharing" aria-label={copy.title}>
    <button type="button" className="fm-btn fm-btn--secondary" onClick={() => { setOpen(!open); if (!open) void send("status"); }}>{copy.title}</button>
    {open ? <div className="passport-sharing__panel">
      <h2>{copy.title}</h2><p>{copy.warning}</p>
      {adult ? <><p>{copy.adult}</p><button className="fm-btn" disabled={busy} onClick={() => void send("reauth")}>{copy.verify}</button></> : <>
        {!preview ? <button className="fm-btn fm-btn--secondary" disabled={busy} onClick={() => void send("preview")}>{copy.preview}</button> : <>
          <PassportBook book={preview} mode="shared" />
          <button className="fm-btn fm-btn--ghost" disabled={busy} onClick={() => void send("preview")}>{copy.preview}</button>
          <label className="passport-sharing__consent"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{copy.consent}</label>
          {!url ? <button className="fm-btn" disabled={busy || !confirmed} onClick={() => void send("enable")}>{copy.enable}</button> : null}
        </>}
        {url ? <div className="passport-sharing__links"><p>{copy.active}</p><button className="fm-btn" onClick={() => { void navigator.clipboard.writeText(url).then(() => setMessage(copy.copied)).catch(() => setMessage(copy.copyFailed)); }}>{copy.copy}</button><input aria-label={copy.link} value={url} readOnly onFocus={e => e.currentTarget.select()} /><button className="fm-btn fm-btn--ghost" disabled={busy} onClick={() => setConfirmation("revoke")}>{copy.revoke}</button><button className="fm-btn fm-btn--ghost" disabled={busy || !confirmed || !preview} onClick={() => setConfirmation("rotate")}>{copy.rotate}</button></div> : null}
      </>}
      <p role="status">{message}</p>
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation === "rotate" ? copy.rotate : copy.revoke} confirmLabel={copy.confirm} cancelLabel={copy.cancel} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation && void send(confirmation)}><p>{copy.oldLinkStops}</p></ConfirmDialog>
    </div> : null}
  </section>;
}
