import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { creationStep, isPlayable } from "@/domain/order-state";
import { creationProgress, type CreationSignals } from "@/domain/creation-progress";
import { statusOf } from "@/services/game-status";
import { RESUMABLE_STATUSES } from "@/services/generation/pipeline";
import { ensurePlayerLink } from "@/services/share-link.service";
import { signedAssetUrl } from "@/services/asset.service";
import { FIXED_WORLD_STYLE_VERSION, isFixedWorldStyle, readFixedWorldStage, fixedWorldConfigSha256 } from "@/services/generation/fixed-world-stage-record";
import { findScene } from "../../../../../../content/scenes";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { pick } from "@/i18n";
import { BOARD_WIZARD_STYLE, readBoardWizard } from "@/services/generation/board-conditioned-wizard";
import { characterNeedsApproval, identityApprovedForDisplay } from "@/services/generation/board-wizard-identity-gate";
import { env } from "@/lib/env";
import { auditWorldBudget } from "@/services/generation/world-budget";

export const runtime = "nodejs";

const PAINTED = new Set(["GENERATED", "APPROVED"]);

/**
 * Polled by /creating. Visible to the draft owner (cookie), the account owner, or an admin.
 *
 * Carries the pipeline's own bookkeeping — the character, the count of painted
 * hiding spots, the board being painted now — so the page can show a real
 * percentage instead of a spinner that moves three times in twenty minutes.
 * The avatar is a GAME asset (the illustrated sticker, never the photograph),
 * so a signed URL for it is safe to hand out.
 */
export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const { gameId } = await ctx.params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([
    c.db.game.findUnique({
      where: { id: gameId },
      include: { childProfile: { select: { avatarAssetId: true, identityAssetId: true, originalPhotoAssetId: true, ageYears: true } }, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { select: { status: true } } } } },
    }),
    currentUser(),
    draftTokenFromCookie(),
  ]);
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const status = statusOf(game);
  const step = creationStep(status);
  const locale = game.locale === "he" ? "he" : "en";

  // The character: the sticker cut from the identity sheet. A stale id (a
  // purged asset after a new photo) must not put a broken picture on the page.
  //
  // READY says the file is saved. It does not say the drawing was approved, and
  // the two were being treated as one: the character appeared the moment its
  // asset landed - before the style review had run - and stayed on the page
  // after a review that refused it. The first character a parent sees is meant
  // to be their child already drawn in the language of the boards, so an
  // unreviewed one is a result nobody has stood behind yet.
  //
  // The question is whether there is a DRAWING to approve, not which engine the
  // game will eventually route to. Keying this on the board-wizard style skipped
  // the entire window it exists for: the style is only set by a successful
  // enrolment, which happens after the identity is approved, so a character that
  // was pending review - or had just been refused - was still `collage-v1` and
  // sailed straight past the gate.
  const avatarId = game.childProfile?.avatarAssetId ?? null;
  const avatar = avatarId ? await c.db.asset.findUnique({ where: { id: avatarId }, select: { status: true } }) : null;
  const reviewed = characterNeedsApproval(game.childProfile)
    ? await identityApprovedForDisplay(c, game.childProfile!)
    : true;
  const characterReady = avatar?.status === "READY" && reviewed;
  const avatarUrl = characterReady && avatarId ? signedAssetUrl(c, avatarId) : null;

  // Hiding spots: the catalog says how many there are, the rows say how many landed.
  let spotsTotal = 0;
  let spotsDone = 0;
  let place: { slug: string; name: string } | null = null;
  for (const gs of game.scenes) {
    const def = findScene(gs.sceneSlug);
    const total = def?.targets.length ?? 0;
    const done = gs.targets.filter((t) => PAINTED.has(t.status)).length;
    spotsTotal += total;
    spotsDone += Math.min(done, total);
    if (!place && def && done < total) place = { slug: def.slug, name: pick(def.name, locale) };
  }

  const boardWizard = game.styleVersion === BOARD_WIZARD_STYLE;
  const loadStatusJob = () => c.db.generationJob.findUnique({ where: { id: `job_${gameId}` }, select: { gameId: true, status: true, stepsJson: true } });
  let statusJobRead: ReturnType<typeof loadStatusJob> | undefined;
  const readStatusJob = () => statusJobRead ??= loadStatusJob();
  let qaPreviewUrl: string | null = null;
  let qaBoards: { boardId: string; name: string; state: string; attempts: number; slots: { slotId: string; state: string; reason: string | null }[] }[] | null = null;
  let qaCost: { spentCents: number; reservedCents: number; capCents: number; held: boolean } | null = null;
  let boardWizardPending = false;
  let boardWizardState: CreationSignals["boardWizardState"] = boardWizard ? "unavailable" : undefined;
  let fixedAssemblyReady: boolean | undefined = boardWizard ? false : undefined;
  if (boardWizard) { spotsTotal = 27; spotsDone = 0; place = null; }
  if (boardWizard && env().APP_ENV === "qa") {
    const job = await readStatusJob();
    if (job) {
      try {
        const record = readBoardWizard(job.stepsJson);
        qaBoards = record.boards.map(b => ({ boardId: b.boardId, name: pick(findScene(b.boardId)?.name ?? { he: b.boardId, en: b.boardId }, locale), state: b.state, attempts: b.attempts,
          slots: record.catalog.boards.find(c => c.boardId === b.boardId)!.slots.map(slot => { const visual = b.visual.find(v => v.slotId === slot.slot.id); return { slotId: slot.slot.id, state: visual?.state ?? b.state, reason: visual?.reason ?? b.reason }; }) }));
        const ledger = await c.db.worldBudgetLedger.findUnique({ where: { worldId: `${gameId}:board-wizard` } });
        if (ledger) { const audit = auditWorldBudget(JSON.parse(ledger.snapshotJson)); qaCost = { spentCents: audit.settledMicroUsd / 10_000, reservedCents: audit.reservedMicroUsd / 10_000, capCents: record.capMicroUsd / 10_000, held: audit.held }; }
        spotsTotal = record.catalog.boards.reduce((total, board) => total + board.slots.length, 0);
        spotsDone = record.boards.filter(b => b.state === "geometry-ok")
          .reduce((total, board) => total + record.catalog.boards.find(c => c.boardId === board.boardId)!.slots.length, 0);
        boardWizardPending = record.state === "running" && !qaCost?.held && RESUMABLE_STATUSES.includes(status);
        boardWizardState = record.state === "running" && !boardWizardPending ? "held" : record.state;
        // DONE is a completed queue slice, not a completed game. Require the
        // actual full assembly before advancing the progress milestones.
        fixedAssemblyReady = spotsTotal > 0 && spotsDone === spotsTotal && !!game.configJson && job.status === "DONE" && !game.deletedAt;
        const nextBoard = record.boards.find(b => b.state === "pending") ?? record.boards.find(b => b.visual.some(v => v.state === "pending"));
        const nextDefinition = nextBoard ? findScene(nextBoard.boardId) : null;
        place = boardWizardPending && nextDefinition ? { slug: nextDefinition.slug, name: pick(nextDefinition.name, locale) } : null;
        if (["review-required", "held"].includes(record.state) && fixedAssemblyReady && (user?.id === game.ownerId || isAdminEmail(user?.email))) qaPreviewUrl = `/qa-review/${gameId}`;
      } catch { /* A corrupt capsule is not progress or a playable preview. */ }
    }
  }
  const fixed = isFixedWorldStyle(game.styleVersion);
  if (fixed && !boardWizard) {
    fixedAssemblyReady = false;
    const job = await readStatusJob();
    try {
      const proof = job && job.gameId === gameId && job.status === "DONE" ? readFixedWorldStage(job.stepsJson) : null;
      fixedAssemblyReady = !!(game.styleVersion === FIXED_WORLD_STYLE_VERSION && !game.deletedAt && proof?.state === "staged" &&
        proof.gameId === game.id && proof.ownerId === game.ownerId && proof.childProfileId === game.childProfileId &&
        game.configJson && fixedWorldConfigSha256(JSON.parse(game.configJson)) === proof.configSha256);
    } catch { /* Missing or corrupt private proof must never announce a ready game. */ }
  }
  // Identity review can stop BEFORE enrollment changes styleVersion. Only the
  // explicit lifecycle marker reclassifies that legacy-looking manual review;
  // an ordinary legacy MANUAL_REVIEW retains its existing progress semantics.
  if (!fixed && env().APP_ENV === "qa" && status === "MANUAL_REVIEW") {
    const job = await readStatusJob();
    try {
      const marker = (JSON.parse(job?.stepsJson ?? "{}") as { boardWizardIdentity?: { version?: unknown; state?: unknown; reason?: unknown } } | null)?.boardWizardIdentity;
      if (job?.gameId === gameId && job.status === "DONE" && marker?.version === "board-wizard-identity-lifecycle/v1" && marker.state === "held"
        && ["unresolved-identity", "identity-enrollment-failed", "identity-style-review-required"].includes(String(marker.reason))) {
        boardWizardState = "held"; fixedAssemblyReady = false;
        spotsDone = 0; spotsTotal = 27; place = null;
      }
    } catch { /* Malformed/unrelated legacy metadata is not an identity hold marker. */ }
  }
  const progress = creationProgress({ status, characterReady, spotsDone, spotsTotal, fixedAssemblyReady, boardWizardState });
  const playUrl = isPlayable(status) && progress.done ? (await ensurePlayerLink(c, gameId)).url : null;
  return NextResponse.json(
    {
      status,
      ...step,
      ...(fixedAssemblyReady === false ? { step: characterReady ? 2 : 1 } : {}),
      ...progress,
      playUrl,
      qaPreviewUrl,
      qaBoards,
      qaCost,
      awaitingQa: progress.state === "awaiting_review" || progress.state === "held",
      pending: progress.state === "held" ? false : boardWizard ? boardWizardPending : !fixed && RESUMABLE_STATUSES.includes(status),
      // "Ready" and "sent" are different facts: DELIVERED means a real recipient
      // got the mail. On a box whose mail provider is the console, nothing was.
      delivered: status === "DELIVERED" && progress.done,
      mailSimulated: c.email.id === "console",
      newPhotoUrl: progress.state === "needs_new_photo" ? `/creating/${gameId}/photo` : null,
      characterReady,
      avatarUrl,
      spotsDone,
      spotsTotal,
      place: progress.current === "hiding" ? place : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
