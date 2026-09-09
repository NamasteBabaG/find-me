import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { parseGameConfig } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";
import { BOARD_WIZARD_STYLE, readBoardWizard } from "@/services/generation/board-conditioned-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "בדיקת משחק פרטית", robots: { index: false, follow: false } };

/** Owner-session preview, not a share token or published READY game. */
export default async function QaGameReview({ params }: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") notFound();
  const user = await currentUser();
  if (!user) notFound();
  const { gameId } = await params, c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true } });
  if (!game || game.deletedAt || game.styleVersion !== BOARD_WIZARD_STYLE || game.status !== "MANUAL_REVIEW" || !game.configJson || (game.ownerId !== user.id && !isAdminEmail(user.email))) notFound();
  const job = game.jobs.find(j => j.id === `job_${gameId}`);
  if (!job || job.status !== "DONE") notFound();
  const record = readBoardWizard(job.stepsJson), config = parseGameConfig(game.configJson);
  if (!["review-required", "held"].includes(record.state) || !record.boards.every(b => b.state === "geometry-ok") || config.gameId !== gameId || config.scenes.length !== 9) notFound();
  const reviewed = record.boards.flatMap(b => b.visual), passed = reviewed.filter(v => v.state === "pass").length;
  return <><details className="fm-small" style={{ padding: "6px 12px" }}><summary>בדיקת QA פרטית — {passed}/27 עברו שיפוט חזותי; המשחק לא פורסם.</summary>
    {record.state === "held" && <p>היצירה נעצרה לבירור תקציב או תשובה לא ודאית. זו תצוגה לבדיקה בלבד; הופעות שלא נשפטו אינן מאושרות.</p>}
    <ul>{record.boards.flatMap(b => b.visual.filter(v => v.state !== "pass").map(v => <li key={`${b.boardId}/${v.slotId}`}>{b.boardId}/{v.slotId}: {v.reason ?? "ממתין לשיפוט"}</li>))}</ul>
  </details><GameShell config={config} parentZoneHref={`/library/${gameId}`} /></>;
}
