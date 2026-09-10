import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { parseGameConfig } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";
import { BOARD_WIZARD_STYLE, readBoardWizard } from "@/services/generation/board-conditioned-wizard";
import { composePartialBoardWizardReview } from "@/services/generation/board-wizard-partial-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "בדיקת משחק פרטית", robots: { index: false, follow: false } };

/** Owner-session preview, not a share token or published READY game. */
export default async function QaGameReview({ params }: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") notFound();
  const user = await currentUser();
  if (!user) notFound();
  const { gameId } = await params, c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  if (!game || game.deletedAt || !game.ownerId || game.styleVersion !== BOARD_WIZARD_STYLE || game.status !== "MANUAL_REVIEW" || (game.ownerId !== user.id && !isAdminEmail(user.email))) notFound();
  const job = game.jobs.find(j => j.id === `job_${gameId}`);
  if (!job || job.status !== "DONE") notFound();
  const record = readBoardWizard(job.stepsJson);
  if (!["review-required", "held"].includes(record.state) || record.gameId !== gameId || record.ownerId !== game.ownerId) notFound();
  const partial = !game.configJson;
  const config = game.configJson ? parseGameConfig(game.configJson) : composePartialBoardWizardReview({
    gameId, ownerId: game.ownerId, locale: game.locale, styleVersion: game.styleVersion,
    record, scenes: game.scenes, composedAt: game.updatedAt,
  });
  if (!config || config.gameId !== gameId || !partial && (!record.boards.every(b => b.state === "geometry-ok") || config.scenes.length !== 9)) notFound();
  const shown = new Set(config.scenes.map(s => s.slug));
  const reviewed = record.boards.filter(b => shown.has(b.boardId)).flatMap(b => b.visual), passed = reviewed.filter(v => v.state === "pass").length;
  return <>{partial && <p role="status" className="fm-small" style={{ margin: 0, padding: "10px 12px", background: "#fff3cd", color: "#41351b" }}>
    בדיקת QA פרטית וחלקית — {config.scenes.length}/9 בורדים, {config.scenes.length * 3}/27 הופעות. היצירה נעצרה; נותרו בעיות חזותיות לבדיקה. זה אינו עולם גמור או מאושר, והוא לא פורסם. ההתקדמות בתצוגה זו אינה נשמרת.
  </p>}<details className="fm-small" style={{ padding: "6px 12px" }}><summary>בדיקת QA פרטית — {passed}/{config.scenes.length * 3} עברו שיפוט חזותי; המשחק לא פורסם.</summary>
    {record.state === "held" && <p>היצירה נעצרה לבירור תקציב או תשובה לא ודאית. זו תצוגה לבדיקה בלבד; הופעות שלא נשפטו אינן מאושרות.</p>}
    <ul>{record.boards.flatMap(b => b.visual.filter(v => v.state !== "pass").map(v => <li key={`${b.boardId}/${v.slotId}`}>{b.boardId}/{v.slotId}: {v.reason ?? "ממתין לשיפוט"}</li>))}</ul>
  </details><GameShell config={config} readOnlyPreview={partial} skipGift={partial} parentZoneHref={`/library/${gameId}`} /></>;
}
