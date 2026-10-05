"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { FriendDialog } from "./FriendDialog";
import { FriendDiscoveries } from "./FriendDiscoveries";
import "./friends.css";
import { friendRequest } from "./request";

type Share = { id: string; active: boolean; stale: boolean; expiresAt: string; revokedAt: string | null };
export function FamilyFriendSharing({ gameId, worlds, initialOpen = false, initialWorld }: { gameId: string; worlds: Array<{ slug: string; name: string }>; initialOpen?: boolean; initialWorld?: string }) {
  const { t, locale, tf } = useI18n(), text = t.friends.owner;
  const [open, setOpen] = useState(initialOpen), [worldSlug, setWorldSlug] = useState(worlds.some(world => world.slug === initialWorld) ? initialWorld! : worlds[0]?.slug ?? "");
  const [share, setShare] = useState<Share | null>(null), [url, setUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [needsAdult, setNeedsAdult] = useState(false), [emailed, setEmailed] = useState(false), [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const scope = `${open}:${gameId}:${worldSlug}`, scopeRef = useRef(scope); scopeRef.current = scope;
  const requestId = useRef(0);
  const urlInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  useEffect(() => {
    if (!open || !worldSlug) return;
    let live = true; const turn = ++requestId.current;
    setBusy(true); setFailed(false); setShare(null); setUrl(null); setConsent(false); setCopied(false); setCopyFailed(false); setNeedsAdult(false); setEmailed(false); setConfirm(null);
    friendRequest("/api/friends/share", { gameId, worldSlug, operation: "status", locale })
      .then(data => { if (live && turn === requestId.current) setShare(data.share); })
      .catch(() => { if (live && turn === requestId.current) setFailed(true); }).finally(() => { if (live && turn === requestId.current) setBusy(false); });
    return () => { live = false; };
  }, [open, gameId, worldSlug, locale, attempt]);
  async function action(operation: "create" | "rotate" | "revoke" | "reauth") {
    if (busy) return;
    const turn = ++requestId.current, actionScope = scope;
    setBusy(true); setFailed(false); setCopied(false); setCopyFailed(false);
    try {
      const data = await friendRequest("/api/friends/share", { gameId, worldSlug, operation, locale, ...(operation === "create" || operation === "rotate" ? { consent } : {}) });
      if (!mounted.current || turn !== requestId.current || actionScope !== scopeRef.current) return;
      if (data.needsAdult) { setNeedsAdult(true); setConfirm(null); return; }
      if (operation === "reauth") { setEmailed(true); return; }
      setShare(data.share); setUrl(data.url ?? null); setNeedsAdult(false); setConfirm(null);
    } catch { if (turn === requestId.current && actionScope === scopeRef.current) setFailed(true); }
    finally { if (turn === requestId.current && actionScope === scopeRef.current) setBusy(false); }
  }
  async function copyLink() {
    if (!url) return;
    const copyScope = scope, copyUrl = url;
    const stillCurrent = () => mounted.current && copyScope === scopeRef.current && urlInput.current?.value === copyUrl;
    try {
      await navigator.clipboard.writeText(copyUrl);
      if (stillCurrent()) { setCopied(true); setCopyFailed(false); }
    } catch {
      if (!stillCurrent()) return;
      setCopied(false); setCopyFailed(true);
      urlInput.current?.focus(); urlInput.current?.select();
    }
  }
  const date = (value: string) => new Date(value).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB");
  const shareStatus = !share ? null : share.active ? text.active
    : share.revokedAt ? tf(text.revoked, { date: date(share.revokedAt) })
      : new Date(share.expiresAt).getTime() <= Date.now() ? tf(text.expired, { date: date(share.expiresAt) })
        : share.stale ? text.stale : text.inactive;
  return <div className="family-friends">
    <Button type="button" variant="secondary" onClick={() => setOpen(true)}>{text.share}</Button>
    {worldSlug ? <FriendDiscoveries gameId={gameId} worldSlug={worldSlug} management /> : null}
    <FriendDialog open={open} title={text.share} onClose={() => { setOpen(false); setConfirm(null); }}>
      {worlds.length > 1 ? <label className="family-friends__world">{text.selectWorld}<select value={worldSlug} disabled={busy} onChange={event => setWorldSlug(event.target.value)}>{worlds.map(world => <option key={world.slug} value={world.slug}>{world.name}</option>)}</select></label>
        : <h3>{worlds[0]?.name}</h3>}
      <p>{text.scope}</p><p className="family-friends__note">{text.lifetime}</p><p className="family-friends__note">{text.cache}</p>
      {failed ? <><p role="status">{text.error}</p><Button disabled={busy} onClick={() => setAttempt(n => n + 1)}>{text.refresh}</Button></> : null}
      {shareStatus ? <p role="status">{shareStatus}</p> : null}
      {share?.active ? <p>{tf(text.expires, { date: date(share.expiresAt) })}</p> : null}
      {url ? <><div className="family-friends__link"><input ref={urlInput} readOnly value={url} aria-label={text.copy} dir="ltr" onFocus={event => event.target.select()} />
        <Button onClick={() => void copyLink()}>{copied ? text.copied : text.copy}</Button></div>
        <p className="family-friends__note">{text.linkOnce}</p>
        {copyFailed ? <p role="status">{text.copyFailed}</p> : null}</> : share?.active ? <p className="family-friends__note">{text.linkHidden}</p> : null}
      {needsAdult ? <div className="family-friends__adult"><p>{emailed ? text.emailed : text.adult}</p><Button loading={busy} disabled={emailed} onClick={() => void action("reauth")}>{text.reauth}</Button></div> : null}
      <div className="family-friends__actions">
        {confirm !== "revoke" ? <div>
          <label className="family-friends__consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />{text.consent}</label>
          {share?.active ? <Button loading={busy} disabled={!consent} onClick={() => setConfirm("rotate")}>{text.rotate}</Button>
            : <Button loading={busy} disabled={!consent || failed} onClick={() => void action("create")}>{text.create}</Button>}
        </div> : null}
        {share?.active ? <Button variant="ghost" disabled={busy} onClick={() => setConfirm("revoke")}>{text.revoke}</Button> : null}
      </div>
    </FriendDialog>
    <ConfirmDialog open={Boolean(confirm)} title={confirm === "rotate" ? text.rotate : text.revoke} confirmLabel={confirm === "rotate" ? text.rotate : text.revoke}
      cancelLabel={t.friends.back} pending={busy} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) void action(confirm); }}><p>{confirm === "rotate" ? text.replaceConfirm : text.cache}</p></ConfirmDialog>
  </div>;
}
