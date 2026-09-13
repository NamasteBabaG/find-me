import React from "react";
import { env } from "@/lib/env";
import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { localPatchBoardForVersion } from "@/domain/scene/local-patch-catalog";

/** Read-only eligibility preview. The publication service revalidates the full
 * retained image inventory, identity, worker fence and budget on submission. */
export async function LocalPatchPartialReleaseForm({ gameId }: { gameId: string }) {
  if (env().APP_ENV !== "qa" || !(await currentAdmin())) return null;
  const game = await getContainer().db.game.findUnique({ where: { id: gameId }, include: {
    jobs: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { include: { variants: true } } } },
  } });
  if (!game || game.deletedAt || game.status !== "GENERATION_FAILED" || game.styleVersion !== "local-patch-world-v1"
    || game.configJson || game.readyAt || game.deliveredAt || game.scenes.length !== 9
    || new Set(game.scenes.map(scene => scene.sceneSlug)).size !== 9 || game.scenes.some(scene => scene.sceneVersion !== 9)
    || !game.jobs.some(job => job.id === `job_${gameId}` && job.status === "DONE" && job.currentStep === "local-patch:quality-failed")
    || game.jobs.some(job => job.status !== "DONE")) return null;

  const boards: { boardId: string; kept: number; omitted: string[] }[] = [];
  let unreviewed = 0;
  for (const scene of game.scenes) {
    const board = localPatchBoardForVersion(scene.sceneSlug, 9);
    if (!board || board.hides.length !== 5 || scene.targets.length !== 5) return null;
    const omitted: string[] = []; let kept = 0;
    for (const hide of board.hides) {
      const target = scene.targets.find(target => target.targetId === hide.targetId);
      if (!target || target.variants.length !== 1) return null;
      const row = target.variants[0]!;
      if (row.variant !== "A" || row.provider !== "local-patch") return null;
      // A failed later attempt may retain an older image pointer as evidence.
      // Omitting the failed hide excludes that image too; it is never counted.
      if (row.status === "FAILED" && row.attempts > 0) { omitted.push(hide.id); continue; }
      if (row.status !== "GENERATED" || !row.assetId || !row.rectJson || !row.hitRectJson || !row.headAnchorJson) return null;
      kept++;
      try {
        if (JSON.parse(row.judgeJson ?? "null")?.reviewState !== "board-review-complete") unreviewed++;
      } catch { unreviewed++; }
    }
    if (kept < 4) return null;
    boards.push({ boardId: board.board, kept, omitted });
  }
  const omittedHideIds = boards.flatMap(board => board.omitted), targets = boards.reduce((sum, board) => sum + board.kept, 0);
  if (!omittedHideIds.length) return null;
  return <form method="post" action={`/api/admin/games/${encodeURIComponent(gameId)}/partial-release`} className="fm-card fm-stack fm-stack--2">
    <h2>פרסום המשחק עם המחבואים הזמינים</h2>
    <p>{targets} מתוך 45 מחבואים יופיעו במשחק. בכל לוח יהיו 4 או 5 מחבואים וכוכבים; מציאת 3 תפתח את הלוח הבא.</p>
    <p className="fm-small">המחבואים שנכשלו ונבחרו להחרגה לא יופיעו במשחק ולא ייספרו בכוכבים. הפרסום ישתמש בתמונות הקיימות, ללא רינדור או חיוב נוסף.</p>
    <ul className="fm-small">{boards.map(board => <li key={board.boardId}>{board.boardId}: {board.kept} מחבואים וכוכבים</li>)}</ul>
    <fieldset className="fm-stack fm-stack--1">
      <legend>אישור מפורש של כל מחבוא שיוחרג</legend>
      {omittedHideIds.map(hideId => <label key={hideId} className="fm-row fm-small" style={{ minHeight: "var(--touch-min)" }}>
        <input type="checkbox" name="omittedHideId" value={hideId} required /> החרגת {hideId} מהמשחק
      </label>)}
    </fieldset>
    <p className="fm-small">{unreviewed} מהתמונות שיופיעו במשחק עדיין ללא בדיקת לוח שהושלמה. זהו אישור אנושי לפרסום כל התמונות שנשארו כפי שהן; דוחות השופט והסתייגויותיו נשמרים.</p>
    <label className="fm-stack fm-stack--1"><span>סיבת הפרסום והחלטת המשתמש</span>
      <textarea className="fm-input" name="reason" minLength={10} maxLength={1000} required rows={3} />
    </label>
    <label className="fm-row fm-small" style={{ minHeight: "var(--touch-min)" }}><input type="checkbox" name="confirm" value="publish-retained-subset-by-human-decision" required />
      קיבלתי אישור מהמשתמש להחריג את המחבואים המסומנים ולפרסם את כל {targets} התמונות שנשארו כפי שהן, כולל תמונות שלא נבדקו והסתייגויות קיימות.</label>
    <button className="fm-btn" type="submit">פרסום עם {targets} המחבואים הזמינים</button>
  </form>;
}
