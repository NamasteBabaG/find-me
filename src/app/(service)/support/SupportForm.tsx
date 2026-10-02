"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import { serviceCopy } from "@/domain/legal";
type Topic = keyof typeof serviceCopy.en.topics;

export function SupportForm({ locale, initialTopic = "help", initialOrder = "" }: { locale: Locale; initialTopic?: Topic; initialOrder?: string }) {
  const c = serviceCopy[locale];
  const [pending, setPending] = useState(false), [error, setError] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; receivedAt: string } | null>(null);
  const retry = useRef<{ payload: string; requestKey: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const fd = new FormData(event.currentTarget);
    const content = { locale, topic: String(fd.get("topic")), email: String(fd.get("email")), order: String(fd.get("order") ?? ""), message: String(fd.get("message") ?? ""), website: String(fd.get("website") ?? "") };
    const payload = JSON.stringify(content);
    const requestKey = retry.current?.payload === payload ? retry.current.requestKey : crypto.randomUUID();
    retry.current = { payload, requestKey }; setPending(true); setError(false);
    try {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...content, requestKey }) });
      const data = await res.json();
      if (!res.ok || !data.ok || !/^support_[a-f0-9]{40}$/.test(data.reference) || !Number.isFinite(Date.parse(data.receivedAt))) throw Error("not recorded");
      setReceipt({ reference: data.reference, receivedAt: data.receivedAt });
    } catch { setError(true); } finally { setPending(false); }
  }
  if (receipt) return <section className="service-receipt fm-card fm-card--pad-4 fm-stack fm-stack--2" role="status" aria-live="polite">
    <h2>{c.receipt}</h2><p>{c.receiptId}: <strong dir="ltr" className="service-reference">{receipt.reference}</strong></p>
    <p>{c.receivedAt}: <time dateTime={receipt.receivedAt}>{new Date(receipt.receivedAt).toLocaleString(locale === "he" ? "he-IL" : "en-GB", { timeZone: "Asia/Jerusalem", timeZoneName: "short" })}</time></p>
    <p>{c.receiptNote}</p><div className="service-receipt__actions"><button type="button" className="fm-btn fm-btn--secondary" onClick={() => window.print()}>{c.print}</button>
      <button type="button" className="fm-btn fm-btn--secondary" onClick={() => { setReceipt(null); retry.current = null; }}>{c.another}</button></div>
  </section>;
  return <form onSubmit={submit} className="service-form fm-card fm-card--pad-4 fm-stack fm-stack--3" aria-labelledby="request-title">
    <h2 id="request-title">{c.requestTitle}</h2>
    <label className="fm-field"><span className="fm-label">{c.topic}</span><select name="topic" className="fm-input" defaultValue={initialTopic}>{Object.entries(c.topics).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
    <label className="fm-field"><span className="fm-label">{c.contactEmail}</span><input className="fm-input" name="email" type="email" maxLength={254} autoComplete="email" required dir="ltr" /></label>
    <label className="fm-field"><span className="fm-label">{c.order}</span><input className="fm-input" name="order" maxLength={160} autoComplete="off" defaultValue={initialOrder} /></label>
    <label className="fm-field"><span className="fm-label">{c.message}</span><textarea className="fm-input" name="message" maxLength={2500} rows={5} /></label>
    <div className="service-trap" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <p className="fm-hint">{c.minimisation}</p><p className="fm-hint">{c.requestPrivacy} <Link href="/privacy">{c.privacy}</Link></p>
    {error ? <p className="fm-error" role="alert">{c.failure}</p> : null}
    <button type="submit" className="fm-btn" disabled={pending}>{pending ? c.submitting : c.submit}</button>
  </form>;
}
