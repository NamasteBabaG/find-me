import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { parseGameConfig } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";
import { BOARD_WIZARD_STYLE, readBoardWizard } from "@/services/generation/board-conditioned-wizard";
import { composePartialBoardWizardReview } from "@/services/generation/board-wizard-partial-review";
import { LOCAL_PATCH_STYLE } from "@/services/generation/local-patch-world";
import { isLocalPatchStrictVersion, localPatchBoardForVersion } from "@/domain/scene/local-patch-catalog";
import { withFreshAssetUrls } from "@/services/asset.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "בדיקת משחק פרטית", robots: { index: false, follow: false } };

/** Private owner/admin review. The local-patch branch never persists play. */
export default async function QaGameReview({ params }: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") notFound();
  const user = await currentUser();
  if (!user) notFound();
  const { gameId } = await params, c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true, scenes: { orderBy: { orderIndex: "asc" } },
    childProfile: { select: { ownerId: true, deletedAt: true } } } });
  if (!game || game.deletedAt || !game.ownerId || (game.ownerId !== user.id && !isAdminEmail(user.email))) notFound();
  const job = game.jobs.find(j => j.id === `job_${gameId}`);
  if (!job || job.status !== "DONE") notFound();
  if (game.styleVersion === LOCAL_PATCH_STYLE) {
    if (!["READY", "DELIVERED"].includes(game.status) || !game.configJson || !game.readyAt
      || !game.childProfile || game.childProfile.deletedAt || game.childProfile.ownerId !== game.ownerId
      || game.scenes.length !== 9 || new Set(game.scenes.map(scene => scene.sceneSlug)).size !== 9
      || new Set(game.scenes.map(scene => scene.sceneVersion)).size !== 1
      || game.scenes.some(scene => !isLocalPatchStrictVersion(scene.sceneVersion) || scene.generationStatus !== "GENERATED" || !scene.configJson)) notFound();
    let published;
    try { published = parseGameConfig(game.configJson); } catch { notFound(); }
    const gameAsset = (url: string) => /^\/api\/assets\/[A-Za-z0-9_-]+(?:\?|$)/.test(url);
    if (published.gameId !== gameId || published.styleVersion !== LOCAL_PATCH_STYLE || published.packageTier !== "ONE_WORLD"
      || !gameAsset(published.child.avatarUrl)
      || published.scenes.length !== 9 || new Set(published.scenes.map(scene => scene.slug)).size !== 9 || published.scenes.some(scene => {
        const row = game.scenes.find(item => item.sceneSlug === scene.slug);
        const board = row ? localPatchBoardForVersion(scene.slug, row.sceneVersion) : null;
        return !row || !board || scene.version !== row.sceneVersion || scene.playMode !== "find-any" || scene.appearancesPerBoard !== 5
          || scene.findsRequiredToAdvance !== 3 || scene.targets.length !== 5
          || board.hides.some(hide => !scene.targets.some(target => target.id === hide.targetId))
          || scene.targets.some(target => target.sprite.kind !== "image" || !gameAsset(target.sprite.url)
            || !target.sprite.rect || !target.sprite.hitRect || !target.sprite.anchor);
      })) notFound();
    const config = withFreshAssetUrls(c, published);
    return <><p role="status" className="fm-small fm-container">
      תצוגת QA פרטית של המשחק שפורסם — 9 לוחות ו־45 מחבואים. ההתקדמות ואירועי המשחק בתצוגה זו אינם נשמרים; המשחק של המשפחה אינו משתנה.
    </p><GameShell config={config} readOnlyPreview parentZoneHref={`/library/${gameId}`} /></>;
  }
  if (game.styleVersion !== BOARD_WIZARD_STYLE || game.status !== "MANUAL_REVIEW") notFound();
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
