"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { GameConfig } from "@/domain/game/config";
import { GUEST_NICKNAME_IDS, GUEST_REACTION_IDS, guestBoardStates, type GuestNickname, type GuestSnapshot } from "@/domain/guest-sharing";
import type { GuestParticipantView, GuestSessionView } from "@/services/guest-sharing.service";
import { useI18n } from "@/i18n/client";
import { GameShell } from "@/game/components/GameShell";
import { FriendProgressSync, friendAlbumSeed, announceFriendParticipant, type FriendSyncState } from "@/game/engine/friend-progress";
import { Button } from "../Button";
import "./friends.css";
import { FriendDialog } from "./FriendDialog";
import { NICKNAME_ICONS, REACTION_ICONS } from "./icons";
import { friendRequest as post } from "./request";
type Play = { config: GameConfig; participant: GuestParticipantView; shareId: string; expiresAt: string };

export function FriendPlay() {
  const { t, tf } = useI18n(), text = t.friends;
  const [token, setToken] = useState("");
  const [view, setView] = useState<GuestSessionView | null>(null), [play, setPlay] = useState<Play | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [nickname, setNickname] = useState<GuestNickname>("guest"), [choosing, setChoosing] = useState(false);
  const joining = useRef<{ key: string; nicknameId: GuestNickname } | null>(null);
  const [joiningNickname, setJoiningNickname] = useState<GuestNickname | null>(null);
  const inspection = useRef(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const inspect = useCallback(async (shareToken: string, chooseAfter = false) => {
    const request = ++inspection.current;
    setBusy(true); setError("");
    try {
      const data = await post("/api/friends/session", { shareToken, operation: "inspect" });
      if (!live.current || request !== inspection.current) return false;
      const current: GuestSessionView = data.view ?? data;
      if (current.participant) announceFriendParticipant(current.shareId, current.participant.id);
      setView(current); setChoosing(chooseAfter);
      return true;
    } catch (e) { if (live.current && request === inspection.current) setError(e instanceof Error ? e.message : "network"); return false; }
    finally { if (live.current && request === inspection.current) setBusy(false); }
  }, []);
  useEffect(() => {
    const shareToken = window.location.hash.slice(1);
    if (!/^gsr_[a-f0-9]{20}\.[A-Za-z0-9_-]{43}$/.test(shareToken)) { setError("unavailable"); setBusy(false); return; }
    setToken(shareToken); void inspect(shareToken);
  }, [inspect]);

  async function enter(resume: boolean) {
    if (busy || !view) return;
    setBusy(true); setError("");
    try {
      if (!resume) {
        joining.current ??= { key: crypto.randomUUID(), nicknameId: nickname };
        setJoiningNickname(joining.current.nicknameId);
      }
      const data = await post("/api/friends/session", { shareToken: token, operation: resume ? "resume" : view.participant ? "another" : "start",
        ...(resume ? { participantId: view.participant!.id } : { nicknameId: joining.current!.nicknameId, joinKey: joining.current!.key }) });
      const next: GuestSessionView = data.view ?? data;
      if (!next.participant) throw new Error("network");
      announceFriendParticipant(next.shareId, next.participant.id);
      const loaded: Play = await post("/api/friends/play", { shareToken: token, participantId: next.participant.id });
      if (live.current) { setView(next); setPlay(loaded); joining.current = null; setJoiningNickname(null); }
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "network"); }
    finally { if (live.current) setBusy(false); }
  }

  async function another() {
    if (busy || !view?.participant) return;
    setBusy(true); setError("");
    let pending: FriendProgressSync | undefined;
    try {
      const current: Play = await post("/api/friends/play", { shareToken: token, participantId: view.participant.id });
      pending = new FriendProgressSync({ config: current.config, shareToken: token, shareId: current.shareId,
        participantId: current.participant.id, initial: current.participant.snapshot, onState: () => {} });
      await pending.flush();
      if (!pending.isSaved()) throw new Error("network");
      if (live.current) setChoosing(true);
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "network"); }
    finally { pending?.stop(); if (live.current) setBusy(false); }
  }

  if (play) return <FriendActive key={play.participant.id} play={play} token={token} switchError={error}
    onAnother={async canLeave => { if (await inspect(token, true) && live.current && canLeave()) setPlay(null); }}
    onExit={() => { setPlay(null); void inspect(token); }} />;
  return <main className="friend-lobby">
    <span className="friend-lobby__brand">Find Me Worlds</span>
    <section className="friend-lobby__card" aria-busy={busy}>
      <span className="friend-lobby__crest" aria-hidden="true">✦</span><h1>{text.title}</h1>
      {view ? <><h2>{view.worldName}</h2><p>{text.intro}</p></> : null}
      {busy && !view ? <p role="status">{text.loading}</p> : null}
      {error ? <p role="status">{error === "unavailable" ? text.unavailable : text.network}</p> : null}
      {error === "unavailable" ? null : view ? <>
        {view.participant && !choosing ? <div className="friend-lobby__actions">
          <Button size="kid" loading={busy} onClick={() => void enter(true)}>{tf(text.continue, { name: text.nicknames[view.participant.nicknameId] })}</Button>
          <Button size="kid" variant="secondary" disabled={busy} onClick={() => void another()}>{text.another}</Button>
        </div> : <>
          <fieldset className="friend-names" disabled={busy || joiningNickname !== null}><legend>{text.chooseName}</legend>
            {GUEST_NICKNAME_IDS.map(id => <button type="button" key={id} className={`friend-names__choice${nickname === id ? " is-selected" : ""}`} disabled={busy || joiningNickname !== null} aria-pressed={nickname === id} onClick={() => setNickname(id)}>
              <span aria-hidden="true">{NICKNAME_ICONS[id]}</span>{text.nicknames[id]}
            </button>)}
          </fieldset>
          <Button size="kid" loading={busy} block onClick={() => void enter(false)}>{joiningNickname ? tf(text.continue, { name: text.nicknames[joiningNickname] }) : text.start}</Button>
          {view.participant ? <Button size="kid" variant="ghost" disabled={busy} onClick={() => { setChoosing(false); if (joiningNickname) void inspect(token); }}>{text.back}</Button> : null}
        </>}
        <p className="friend-lobby__note">{text.localOnly}</p>
      </> : !busy && token ? <Button size="kid" loading={busy} onClick={() => void inspect(token)}>{text.retry}</Button> : null}
    </section>
  </main>;
}

function FriendActive({ play, token, switchError, onAnother, onExit }: { play: Play; token: string; switchError: string; onAnother: (canLeave: () => boolean) => Promise<void>; onExit: () => void }) {
  const { t, tf } = useI18n(), text = t.friends;
  const [status, setStatus] = useState<FriendSyncState>("saved");
  const [snapshot, setSnapshot] = useState(play.participant.snapshot);
  const [reaction, setReaction] = useState<GuestSnapshot["reactionId"]>(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const saveStatusId = useId();
  const [switching, setSwitching] = useState(false), switchPending = useRef(false), mounted = useRef(true);
  const [sync] = useState<FriendProgressSync>(() => new FriendProgressSync({ config: play.config, shareToken: token, shareId: play.shareId, participantId: play.participant.id,
    initial: play.participant.snapshot, onState: state => { setStatus(state); setSnapshot(sync.current()); } }));
  const [seed] = useState(() => friendAlbumSeed(sync.current()));
  useEffect(() => {
    mounted.current = true;
    sync.start(); const unload = () => { void sync.flush(); };
    window.addEventListener("pagehide", unload);
    return () => { mounted.current = false; window.removeEventListener("pagehide", unload); sync.stop(); };
  }, [sync]);
  const progress = useCallback((next: GuestSnapshot) => { sync.push(next); setSnapshot(sync.current()); }, [sync]);
  const visit = useCallback((slug: string) => { sync.visit(slug); setSnapshot(sync.current()); }, [sync]);
  const terminal = status === "unavailable" || status === "switched" || status === "sync-error";
  const complete = guestBoardStates(play.config, snapshot).every(board => board.state === "complete");
  const savedReaction = snapshot.reactionId && status === "saved";
  async function exitSaved() {
    if (switchPending.current || status !== "saved") return;
    switchPending.current = true; setSwitching(true);
    try { await sync.flush(); if (sync.isSaved()) await onAnother(() => sync.isSaved()); }
    finally { switchPending.current = false; if (mounted.current) setSwitching(false); }
  }
  return <div className="friend-play">
    <div className="friend-play__identity"><span>{NICKNAME_ICONS[play.participant.nicknameId]} {tf(text.player, { name: text.nicknames[play.participant.nicknameId] })}</span>
      <button type="button" disabled={status !== "saved" || switching} aria-busy={switching || undefined} aria-describedby={!terminal ? saveStatusId : undefined} onClick={() => void exitSaved()}>{text.another}</button>
      {complete && !terminal ? <button type="button" onClick={() => setReactionOpen(true)}>{savedReaction ? text.reactionSent : text.reactionSend}</button> : null}
      <span id={saveStatusId} className="friend-play__save" role="status">{terminal ? "" : switching ? text.loading : status === "saving" ? text.saving : status === "saved" ? text.saved : text.offline}</span>
      {switchError ? <span role="status">{switchError === "unavailable" ? text.unavailable : text.network}</span> : null}
    </div>
    {terminal ? <section className="friend-lobby__card"><p role="status">{status === "switched" ? text.switching : status === "sync-error" ? text.saveError : text.unavailable}</p><Button size="kid" onClick={onExit}>{status === "sync-error" ? text.retry : text.back}</Button></section>
      : <GameShell config={play.config} skipGift initialAlbum={seed} friend={{ shareId: play.shareId, participantId: play.participant.id, onProgress: progress, onBoardReady: visit }} />}
    {complete && !terminal ? <FriendDialog open={reactionOpen} title={text.reactionTitle} onClose={() => setReactionOpen(false)}><section className="friend-reaction" aria-label={text.reactionTitle}>
      <h2>{savedReaction ? text.reactionSent : text.reactionTitle}</h2>
      {!savedReaction ? <><p>{text.reactionHelp}</p><div className="friend-reaction__choices">{GUEST_REACTION_IDS.map(id => <button type="button" key={id}
        aria-pressed={(snapshot.reactionId ?? reaction) === id} disabled={Boolean(snapshot.reactionId)} onClick={() => setReaction(id)}>{REACTION_ICONS[id]} {text.reactions[id]}</button>)}</div>
        <Button size="kid" disabled={!reaction || Boolean(snapshot.reactionId)} loading={Boolean(snapshot.reactionId) && status === "saving"} onClick={() => { sync.react(reaction); setSnapshot(sync.current()); }}>{text.reactionSend}</Button>
        {snapshot.reactionId && status === "offline" ? <p role="status">{text.offline}</p> : null}
      </> : <p>{REACTION_ICONS[snapshot.reactionId!]} {text.reactions[snapshot.reactionId!]}</p>}
    </section></FriendDialog> : null}
  </div>;
}
