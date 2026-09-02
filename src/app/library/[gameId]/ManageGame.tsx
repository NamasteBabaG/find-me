"use client";

import { useActionState, useState } from "react";
import { Button } from "@/ui/Button";
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

export function ManageGame({ gameId, playUrl, gift, childName }: Props) {
  const { t, tf } = useI18n();
  const l = t.library;
  const [copied, setCopied] = useState(false);
  const [giftState, giftAction, giftPending] = useActionState<FlowResult | null, FormData>(updateGiftAction, null);

  const copy = async () => {
    if (!playUrl) return;
    try {
      await navigator.clipboard.writeText(playUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the input stays selectable */
    }
  };

  const share = async () => {
    if (!playUrl) return;
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
            <div className="fm-copy">
              <input className="fm-input" value={playUrl} readOnly onFocus={(e) => e.currentTarget.select()} aria-label={l.share.linkAria} />
              <Button variant="secondary" onClick={copy}>
                {copied ? t.common.copied : t.common.copy}
              </Button>
            </div>
            <div className="fm-row">
              <Button variant="sea" onClick={share}>
                {l.share.send}
              </Button>
              <form
                action={rotateLinkAction}
                onSubmit={(e) => {
                  if (!confirm(l.share.rotateConfirm)) e.preventDefault();
                }}
              >
                <input type="hidden" name="gameId" value={gameId} />
                <Button type="submit" variant="ghost">
                  {l.share.rotate}
                </Button>
              </form>
            </div>
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
            <input id="fromName" name="fromName" className="fm-input" defaultValue={gift.fromName ?? ""} maxLength={40} placeholder={l.gift.fromPlaceholder} />
          </div>
          <div className="fm-field">
            <label htmlFor="message" className="fm-label">
              {l.gift.message}
            </label>
            <textarea id="message" name="message" className="fm-input fm-textarea" defaultValue={gift.message ?? ""} maxLength={140} placeholder={l.gift.messagePlaceholder} />
          </div>
          {giftState?.ok ? <Notice kind="success">{t.common.saved}</Notice> : giftState && !giftState.ok ? <p className="fm-error">{errorText(t, giftState)}</p> : null}
          <div>
            <Button type="submit" variant="secondary" loading={giftPending}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </section>

      <section className="fm-card fm-card--flat fm-card--pad-4 fm-stack fm-stack--2">
        <h2>{l.remove.title}</h2>
        <p className="fm-muted">{l.remove.lead}</p>
        <form
          action={deleteGameAction}
          onSubmit={(e) => {
            if (!confirm(tf(l.remove.confirm, { name: childName }))) e.preventDefault();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <Button type="submit" variant="danger">
            {l.remove.button}
          </Button>
        </form>
      </section>
    </div>
  );
}
