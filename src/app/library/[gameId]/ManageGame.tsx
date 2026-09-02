"use client";

import { useActionState, useState } from "react";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Shell";
import type { ActionResult } from "../../create/actions";
import { deleteGameAction, rotateLinkAction, updateGiftAction } from "../actions";

interface Props {
  gameId: string;
  playUrl: string | null;
  gift: { fromName?: string; message?: string };
  childName: string;
}

export function ManageGame({ gameId, playUrl, gift, childName }: Props) {
  const [copied, setCopied] = useState(false);
  const [giftState, giftAction, giftPending] = useActionState<ActionResult | null, FormData>(updateGiftAction, null);

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
        await navigator.share({ title: `איפה ${childName}?`, text: `מצליחים למצוא את ${childName}?`, url: playUrl });
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
        <h2>שיתוף</h2>
        <p className="fm-muted">הקישור פרטי ולא מופיע במנועי חיפוש. מי שמקבל אותו יכול לשחק — לא לשנות. אפשר להחליף אותו בכל רגע.</p>
        {playUrl ? (
          <>
            <div className="fm-copy">
              <input className="fm-input" value={playUrl} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="קישור למשחק" />
              <Button variant="secondary" onClick={copy}>
                {copied ? "הועתק ✓" : "העתקה"}
              </Button>
            </div>
            <div className="fm-row">
              <Button variant="sea" onClick={share}>
                שלחו לסבא וסבתא 💌
              </Button>
              <form
                action={rotateLinkAction}
                onSubmit={(e) => {
                  if (!confirm("להחליף את הקישור? הקישור הישן יפסיק לעבוד מיד.")) e.preventDefault();
                }}
              >
                <input type="hidden" name="gameId" value={gameId} />
                <Button type="submit" variant="ghost">
                  החלפת קישור
                </Button>
              </form>
            </div>
          </>
        ) : (
          <p className="fm-small">הקישור יופיע כאן כשהמשחק יהיה מוכן.</p>
        )}
      </section>

      <section className="fm-card fm-card--pad-4">
        <form action={giftAction} className="fm-stack fm-stack--2">
          <h2>עטיפת מתנה</h2>
          <p className="fm-muted">לא חובה. יופיע על העטיפה הדיגיטלית כשפותחים את המשחק.</p>
          <input type="hidden" name="gameId" value={gameId} />
          <div className="fm-field">
            <label htmlFor="fromName" className="fm-label">
              ממי המתנה?
            </label>
            <input id="fromName" name="fromName" className="fm-input" defaultValue={gift.fromName ?? ""} maxLength={40} placeholder="סבא וסבתא" />
          </div>
          <div className="fm-field">
            <label htmlFor="message" className="fm-label">
              משפט קצר
            </label>
            <textarea id="message" name="message" className="fm-input fm-textarea" defaultValue={gift.message ?? ""} maxLength={140} placeholder="יום הולדת שמח! בואו נראה כמה מהר תמצאו את עצמך…" />
          </div>
          {giftState?.ok ? <Notice kind="success">נשמר.</Notice> : giftState && !giftState.ok ? <p className="fm-error">{giftState.reason}</p> : null}
          <div>
            <Button type="submit" variant="secondary" loading={giftPending}>
              שמירה
            </Button>
          </div>
        </form>
      </section>

      <section className="fm-card fm-card--flat fm-card--pad-4 fm-stack fm-stack--2">
        <h2>מחיקה</h2>
        <p className="fm-muted">מוחק את המשחק, את הדמות המאוירת ואת התמונה. הקישור יפסיק לעבוד. אי אפשר לבטל.</p>
        <form
          action={deleteGameAction}
          onSubmit={(e) => {
            if (!confirm(`למחוק את המשחק של ${childName}? אי אפשר לבטל.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <Button type="submit" variant="danger">
            מחיקת המשחק
          </Button>
        </form>
      </section>
    </div>
  );
}
