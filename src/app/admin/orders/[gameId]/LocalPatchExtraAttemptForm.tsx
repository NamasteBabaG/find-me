import React from "react";
import { env } from "@/lib/env";
import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { localPatchBoardForVersion } from "@/domain/scene/local-patch-catalog";
import { localPatchRecoveryDirectiveForHide } from "@/domain/scene/local-patch-recovery-directive";
import { readLocalPatchExtraAttemptPlan } from "@/services/generation/local-patch-extra-attempt";

export async function LocalPatchExtraAttemptForm({ gameId }: { gameId: string }) {
  if (env().APP_ENV !== "qa" || !(await currentAdmin())) return null;
  const c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: {
    scenes: { include: { targets: { include: { variants: true } } } },
  } });
  if (!game || game.deletedAt || game.status !== "GENERATION_FAILED" || game.styleVersion !== "local-patch-world-v1"
    || game.configJson || game.readyAt || game.deliveredAt || game.scenes.length !== 9
    || game.scenes.some(scene => scene.sceneVersion !== 9) || await readLocalPatchExtraAttemptPlan(c, gameId)) return null;
  const candidates = game.scenes.flatMap(scene => {
    const board = localPatchBoardForVersion(scene.sceneSlug, 9);
    return board?.hides.filter(hide => localPatchRecoveryDirectiveForHide(hide.id) && scene.targets.some(target => target.targetId === hide.targetId
      && target.variants.some(row => row.variant === "A" && row.status === "FAILED" && row.attempts === 3))).map(hide => ({
      hideId: hide.id, boardId: board.board,
    })) ?? [];
  });
  if (!candidates.length) return null;
  return <form method="post" action={`/api/admin/games/${encodeURIComponent(gameId)}/extra-patch-attempt`} className="fm-card fm-stack fm-stack--2">
    <h2>ניסיון תיקון נוסף וממוקד — הרשאה חד־פעמית</h2>
    <p className="fm-small">רינדור אחד נוסף בלבד לכל מחבוא שנבחר. אין איפוס ניסיונות, אין שינוי בתקרת $4, ואין אישור אוטומטי של התוצאה. מחבואים אחרים נשארים ללא שינוי.</p>
    {candidates.map(candidate => <label key={candidate.hideId} className="fm-small">
      <input type="checkbox" name="hideId" value={candidate.hideId} /> {candidate.boardId} — {candidate.hideId}
    </label>)}
    {candidates.some(candidate => candidate.boardId === "amazon") ? <label className="fm-small">
      <input type="checkbox" name="reviewOnlyHideId" value={candidates.find(candidate => candidate.boardId === "amazon")!.hideId} />
      אמזונס: בדיקה חדשה של התמונה הקיימת בלבד, לפי הראש הגלוי. ללא רינדור חדש.
    </label> : null}
    <label className="fm-stack fm-stack--1"><span>האבחנה וסיבת ההרשאה</span>
      <textarea className="fm-input" name="reason" minLength={10} maxLength={1000} required rows={3} />
    </label>
    <label className="fm-small"><input type="checkbox" name="confirm" value="one-scoped-extra-attempt" required />
      המשתמש אישר את הניסיון הנוסף. תמונת תיקון תקבל בדיקה רגילה; בחירה בבדיקה בלבד אינה מתירה רינדור.</label>
    <button className="fm-btn fm-btn--secondary" type="submit">אישור התיקון המוגבל בתור השרת</button>
  </form>;
}
