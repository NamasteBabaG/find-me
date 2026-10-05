"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/ui/Button";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText, type FlowResult } from "@/i18n/errors";
import { deleteGameAction, rotateLinkAction, updateGiftAction } from "../actions";

interface Props {
  gameId: string;
  playUrl: string | null;
  gift: { fromName?: string; message?: string };
  childName: string;
}

/** The site the link opens, for the eye: "findmeworlds.com", never the token. */
function linkHost(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
}

export function ManageGame({ gameId, playUrl, gift, childName }: Props) {
  const { t, tf } = useI18n();
  const l = t.library;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyGeneration = useRef(0);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateCopy = () => {
    copyGeneration.current += 1;
    if (copyResetTimer.current !== null) {
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = null;
    }
  };
  const [giftState, giftAction, giftPending] = useActionState<FlowResult | null, FormData>(updateGiftAction, null);
  // Replacing the link is a server action; the page comes back with the new link as `playUrl`, and the share and
  // copy buttons use that prop, so they always send the current link. With the address no longer on screen, the
  // change is said in words.
  const [, rotateAction, rotatePending] = useActionState<null, FormData>(async (_, data) => {
    invalidateCopy();
    setCopied(false);
    await rotateLinkAction(data);
    return null;
  }, null);
  const [rotated, setRotated] = useState(false);
  const shownUrl = useRef(playUrl);
  useLayoutEffect(() => {
    if (shownUrl.current === playUrl) return;
    const replaced = shownUrl.current !== null && playUrl !== null;
    invalidateCopy();
    shownUrl.current = playUrl;
    setCopied(false); setCopyFailed(false); setRotated(replaced);
  }, [playUrl]);
  useEffect(() => () => { invalidateCopy(); }, []);
  // The two things that cannot be undone ask first, in the product's own dialog.
  // A submit goes through only once the dialog has armed it.
  const [ask, setAsk] = useState<"rotate" | "delete" | null>(null);
  const armed = useRef<"rotate" | "delete" | null>(null);
  const rotateForm = useRef<HTMLFormElement>(null);
  const deleteForm = useRef<HTMLFormElement>(null);
  const guard = (kind: "rotate" | "delete") => (event: FormEvent<HTMLFormElement>) => {
    if (armed.current === kind) { armed.current = null; return; }
    event.preventDefault();
    setAsk(kind);
  };
  const confirmAsk = () => {
    const kind = ask;
    setAsk(null);
    if (!kind) return;
    armed.current = kind;
    (kind === "rotate" ? rotateForm : deleteForm).current?.requestSubmit();
  };

  const copy = async () => {
    if (!playUrl || rotatePending) return;
    invalidateCopy();
    const generation = copyGeneration.current;
    const requestedUrl = playUrl;
    const isCurrent = () => copyGeneration.current === generation && shownUrl.current === requestedUrl;
    setCopied(false); setCopyFailed(false); setRotated(false);
    try {
      await navigator.clipboard.writeText(requestedUrl);
      if (!isCurrent()) return;
      setCopied(true);
      copyResetTimer.current = setTimeout(() => {
        if (!isCurrent()) return;
        copyResetTimer.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      if (!isCurrent()) return;
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const share = async () => {
    if (!playUrl || rotatePending) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: tf(l.share.shareTitle, { name: childName }), text: tf(l.share.shareText, { name: childName }), url: playUrl });
      } catch {
        /* cancelled */
      }
    } else {
      await copy();
    }
  };

  return (
    <div className="fm-stack fm-stack--4">
      <section className="fm-card fm-card--pad-4 fm-stack fm-stack--2">
        <h2>{l.share.title}</h2>
        <p className="fm-muted">{l.share.lead}</p>
        {playUrl ? (
          <>
            {/* The link as a thing to send, not a long address to read (Guy, 2026-10-05). The address itself appears
                only if copying fails, ready to select by hand. */}
            <div className="share-ticket">
              <span className="share-ticket__icon" aria-hidden>🔗</span>
              <span className="share-ticket__text">
                <strong>{childName ? tf(l.share.linkLabel, { name: childName }) : l.share.linkAria}</strong>
                {/* The ticket's own line says what just happened: ready, copied, or replaced. */}
                <span className={`fm-small${rotated || copied ? " share-ticket__news" : ""}`} role="status">
                  {rotated ? l.share.rotated : <><span className="share-ticket__host"><bdi>{linkHost(playUrl)}</bdi> · </span>{copied ? l.share.copied : l.share.ready}</>}
                </span>
              </span>
            </div>
            <div className="share-actions">
              <Button variant="sea" onClick={share} disabled={rotatePending}>
                {l.share.send}
              </Button>
              <Button variant="secondary" onClick={copy} disabled={rotatePending}>
                {copied ? l.share.copied : l.share.copy}
              </Button>
            </div>
            {copyFailed ? <div className="fm-stack fm-stack--1">
              <p className="fm-small" role="alert">{l.share.copyFailed}</p>
              <input className="fm-input" dir="ltr" value={playUrl} readOnly autoFocus onFocus={(e) => e.currentTarget.select()} aria-label={l.share.linkAria} />
            </div> : null}
            <form ref={rotateForm} action={rotateAction} onSubmit={guard("rotate")} className="share-rotate">
              <input type="hidden" name="gameId" value={gameId} />
              <Button type="submit" variant="ghost" loading={rotatePending}>
                {l.share.rotate}
              </Button>
              <span className="fm-small">{l.share.rotateHint}</span>
            </form>
          </>
        ) : (
          <p className="fm-small">{l.share.pending}</p>
        )}
      </section>

      <section className="fm-card fm-card--pad-4">
        <form action={giftAction} className="fm-stack fm-stack--2">
          <h2>{l.gift.title}</h2>
          <p className="fm-muted">{l.gift.lead}</p>
          <input type="hidden" name="gameId" value={gameId} />
          <div className="fm-field">
            <label htmlFor="fromName" className="fm-label">
              {l.gift.from}
            </label>
            <input id="fromName" name="fromName" className="fm-input" defaultValue={gift.fromName ?? ""} maxLength={40} placeholder={l.gift.fromPlaceholder} aria-describedby="gift-from-hint" />
            <p id="gift-from-hint" className="fm-small">{l.gift.fromHint}</p>
          </div>
          <div className="fm-field">
            <label htmlFor="message" className="fm-label">
              {l.gift.message}
            </label>
            <textarea id="message" name="message" className="fm-input fm-textarea" defaultValue={gift.message ?? ""} maxLength={140} placeholder={l.gift.messagePlaceholder} aria-describedby="gift-message-hint" />
            <p id="gift-message-hint" className="fm-small">{l.gift.messageHint}</p>
          </div>
          {giftState?.ok ? <Notice kind="success">{l.gift.saved}</Notice> : giftState && !giftState.ok ? <p className="fm-error">{errorText(t, giftState)}</p> : null}
          <div>
            <Button type="submit" variant="secondary" loading={giftPending}>
              {l.gift.save}
            </Button>
          </div>
        </form>
      </section>

      <section className="fm-card fm-card--flat fm-card--pad-4 fm-stack fm-stack--2">
        <h2>{l.remove.title}</h2>
        <p className="fm-muted">{l.remove.lead}</p>
        <form ref={deleteForm} action={deleteGameAction} onSubmit={guard("delete")}>
          <input type="hidden" name="gameId" value={gameId} />
          <Button type="submit" variant="danger">
            {l.remove.button}
          </Button>
        </form>
      </section>
      <ConfirmDialog
        open={ask !== null}
        title={ask === "delete" ? tf(l.remove.confirm, { name: childName }) : l.share.rotateTitle}
        confirmLabel={ask === "delete" ? l.remove.button : l.share.rotate}
        cancelLabel={ask === "delete" ? l.remove.keep : l.share.keep}
        danger={ask === "delete"}
        onConfirm={confirmAsk}
        onCancel={() => setAsk(null)}
      >
        {ask === "delete" ? l.remove.lead : l.share.rotateConfirm}
      </ConfirmDialog>
    </div>
  );
}
