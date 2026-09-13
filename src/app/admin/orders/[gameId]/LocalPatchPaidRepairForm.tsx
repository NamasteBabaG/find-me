import React from "react";
import { env } from "@/lib/env";
import { currentAdmin } from "@/lib/server/session";
import { LOCAL_PATCH_STYLE } from "@/services/generation/local-patch-world";
import { isLocalPatchStrictVersion } from "@/domain/scene/local-patch-catalog";

type Candidate = {
  id: string; status: string; styleVersion: string | null; configJson: string | null;
  readyAt: Date | null; deliveredAt: Date | null; scenes: { sceneVersion: number }[];
};

/** Visibility is deliberately narrower than general retry. The mutation service
 * independently rechecks all eligibility and frozen-byte constraints. */
export async function LocalPatchPaidRepairForm({ game }: { game: Candidate }) {
  if (env().APP_ENV !== "qa" || !(await currentAdmin()) || game.status !== "GENERATION_FAILED"
    || game.styleVersion !== LOCAL_PATCH_STYLE || game.configJson || game.readyAt || game.deliveredAt
    || game.scenes.length !== 9 || !game.scenes.every(scene => isLocalPatchStrictVersion(scene.sceneVersion))) return null;
  return <form method="post" action={`/api/admin/games/${encodeURIComponent(game.id)}/paid-patch-repair`} className="fm-card fm-stack fm-stack--2">
    <h2>תיקון מקומי מתמונות ששולמו — בדיקה בלבד, ללא רינדור נוסף</h2>
    <p className="fm-small">הפעולה משתמשת רק בתמונות שכבר נשמרו ונרכשו. היא אינה מאשרת תמונה או מפרסמת משחק: המועמדים חוזרים לבדיקות הרגילות, שיכולות עדיין לדחות אותם. בדיקת השופט עשויה להיות כרוכה בעלות מתוך התקציב הקיים.</p>
    <label className="fm-stack fm-stack--1">
      <span>שני מניפסטים של תיקון מאומת (JSON, כולל alphaBase64)</span>
      <textarea className="fm-input" name="repairs" rows={8} dir="ltr" required maxLength={240_000} spellCheck={false} autoComplete="off" aria-describedby="paid-repair-limit" />
    </label>
    <p className="fm-small" id="paid-repair-limit">נדרשים שני תיעודי מקור מדויקים; גוף הבקשה מוגבל ל־250KB. אין כאן העלאה חופשית של תמונה חלופית.</p>
    <label className="fm-stack fm-stack--1">
      <span>סיבת ההרשאה</span>
      <textarea className="fm-input" name="authorizationReason" rows={3} required minLength={10} maxLength={1_000} />
    </label>
    <label className="fm-small"><input type="checkbox" name="confirm" value="review-existing-paid-images-only" required /> מאשר/ת בדיקה של התמונות שכבר שולמו בלבד, ללא יצירת תמונה נוספת וללא עקיפת הבדיקות.</label>
    <button className="fm-btn fm-btn--secondary" type="submit">שליחת התיקון המקומי לבדיקה בתור</button>
  </form>;
}
