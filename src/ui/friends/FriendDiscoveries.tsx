"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestOwnerReport, GuestParticipantSummary } from "@/services/guest-sharing.service";
import { useI18n } from "@/i18n/client";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { FriendDialog } from "./FriendDialog";
import { NICKNAME_ICONS, REACTION_ICONS } from "./icons";
import "./friends.css";
import { friendRequest } from "./request";

export function FriendDiscoveries({ gameId, worldSlug, management = false }: { gameId: string; worldSlug: string; management?: boolean }) {
  const { t, locale } = useI18n(), text = t.friends.owner;
  const [open, setOpen] = useState(false), [report, setReport] = useState<GuestOwnerReport | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [remove, setRemove] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [needsAdult, setNeedsAdult] = useState(false), [emailed, setEmailed] = useState(false);
  const sequence = useRef(0), mounted = useRef(true), acknowledged = useRef(new Set<string>());
  const openRef = useRef(open); openRef.current = open;
  const load = useCallback(async (operation: "read" | "seen" | "remove" = "read", extras: object = {}) => {
    const turn = ++sequence.current; setBusy(true); setFailed(false);
    try {
      const data = await friendRequest("/api/friends/report", { gameId, worldSlug, operation, ...extras });
      if (data.needsAdult) {
        if (mounted.current && turn === sequence.current) { setNeedsAdult(true); setRemove(null); }
        return false;
      }
      if (mounted.current && turn === sequence.current) { setReport(data.report); setRemove(null); setNeedsAdult(false); setEmailed(false); }
      return true;
    } catch { if (mounted.current && turn === sequence.current) setFailed(true); return false; }
    finally { if (mounted.current && turn === sequence.current) setBusy(false); }
  }, [gameId, worldSlug]);
  useEffect(() => {
    mounted.current = true; setReport(null); setSeen(new Set()); setNeedsAdult(false); setEmailed(false); acknowledged.current.clear(); if (!management) void load();
    const focus = () => { if (!document.hidden && (!management || openRef.current)) void load(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; sequence.current++; window.removeEventListener("focus", focus); };
  }, [load, management]);
  const viewed = useCallback((key: string) => setSeen(old => old.has(key) ? old : new Set([...old, key])), []);
  async function reauthenticate() {
    if (busy) return;
    const turn = ++sequence.current; setBusy(true); setFailed(false);
    try {
      await friendRequest("/api/friends/share", { gameId, worldSlug, operation: "reauth", locale });
      if (mounted.current && turn === sequence.current) setEmailed(true);
    } catch { if (mounted.current && turn === sequence.current) setFailed(true); }
    finally { if (mounted.current && turn === sequence.current) setBusy(false); }
  }
  useEffect(() => {
    if (!open || !report) return;
    const cursors = report.shares.filter(share => {
      const key = `${share.id}:${share.revision}`;
      const fresh = report.participants.filter(person => person.shareId === share.id && person.hasNew);
      return share.revision > share.seenRevision && fresh.length > 0 && fresh.every(person => seen.has(`${person.id}:${person.activityRevision}`)) && !acknowledged.current.has(key);
    }).map(share => ({ shareId: share.id, revision: share.revision }));
    if (!cursors.length) return;
    const timer = setTimeout(() => {
      for (const cursor of cursors) acknowledged.current.add(`${cursor.shareId}:${cursor.revision}`);
      void load("seen", { markSeen: cursors }).then(ok => { if (!ok) for (const cursor of cursors) acknowledged.current.delete(`${cursor.shareId}:${cursor.revision}`); });
    }, 400);
    return () => clearTimeout(timer);
  }, [open, report, seen, load]);
  return <>
    <Button type="button" variant="secondary" size={management ? "md" : "kid"} onClick={() => { setOpen(true); void load(); }}>
      {text.title}{report?.hasNew ? <span className="friend-new">{text.new}</span> : null}
    </Button>
    <FriendDialog open={open} title={text.title} onClose={() => setOpen(false)}>
      <div className="friend-report__toolbar"><Button variant="ghost" size="kid" loading={busy} onClick={() => void load()}>{text.refresh}</Button></div>
      {failed ? <p role="status">{text.error}</p> : !report ? <p role="status">{text.loading}</p> : null}
      {management && needsAdult ? <div className="family-friends__adult"><p>{emailed ? text.emailed : text.adult}</p><Button loading={busy} disabled={emailed} onClick={() => void reauthenticate()}>{text.reauth}</Button></div> : null}
      {report ? <div className="friend-report">
        {report.participants.length === 0 ? <p>{text.empty}</p> : report.participants.map(person => <ParticipantCard key={person.id} person={person} visible={open} onViewed={viewed}
          onRemove={management ? () => setRemove(person.id) : undefined} />)}
      </div> : null}
    </FriendDialog>
    <ConfirmDialog open={Boolean(remove)} title={text.removeConfirm} confirmLabel={text.remove} cancelLabel={text.removeCancel} danger pending={busy}
      onCancel={() => setRemove(null)} onConfirm={() => { if (remove && !busy) void load("remove", { removeParticipantId: remove }); }} />
  </>;
}

function ParticipantCard({ person, visible, onViewed, onRemove }: { person: GuestParticipantSummary; visible: boolean; onViewed: (key: string) => void; onRemove?: () => void }) {
  const { t, tf } = useI18n(), text = t.friends.owner;
  const ref = useRef<HTMLElement>(null), key = `${person.id}:${person.activityRevision}`;
  useEffect(() => {
    const element = ref.current; if (!visible || !element || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry?.isIntersecting && !document.hidden) timer = setTimeout(() => { if (!document.hidden) onViewed(key); }, 500);
    }, { threshold: 0.15 });
    observer.observe(element); return () => { clearTimeout(timer); observer.disconnect(); };
  }, [visible, key, onViewed]);
  return <article ref={ref} className={`friend-person${person.hasNew ? " has-new" : ""}`} tabIndex={0} onFocus={() => { if (visible) onViewed(key); }}>
    <header><span className="friend-person__avatar" aria-hidden="true">{NICKNAME_ICONS[person.nicknameId]}</span><div><h3>{t.friends.nicknames[person.nicknameId]}</h3>
      <p>{tf(text.found, { n: person.finds, total: person.totalFinds })}</p></div>{person.hasNew ? <span className="friend-new">{text.new}</span> : null}</header>
    <ol className="friend-person__places">{person.boards.map((board, index) => <li key={board.sceneSlug} className={`is-${board.state}`}>
      <span className="friend-person__number" aria-hidden="true">{index + 1}</span><strong>{board.title}</strong>
      <span>{board.state === "unvisited" ? text.notVisited : board.state === "visited" ? text.visited : tf(text.found, { n: board.finds, total: board.total })}</span>
      <span className="friend-person__stars" aria-hidden="true">{board.state === "unvisited" ? "·" : Array.from({ length: board.total }, (_, i) => i < board.finds ? "★" : "☆").join(" ")}</span>
    </li>)}</ol>
    {person.reactionId ? <p className="friend-person__postcard">{REACTION_ICONS[person.reactionId]} {t.friends.reactions[person.reactionId]}</p> : null}
    {onRemove ? <Button type="button" variant="ghost" onClick={onRemove}>{text.remove}</Button> : null}
  </article>;
}
