import { TargetAdjustSchema } from "@/domain/game/config";
import { isCurrency, type Currency } from "@/domain/package";
import { isAwaitingQa, isPlayable, type GameStatus } from "@/domain/order-state";
import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { persistGameConfig } from "./generation/scene-composer";
import { publishGame } from "./publish.service";
import { audit, type Actor } from "./audit.service";
import { deleteAsset, readAssetBuffer, storeAsset } from "./asset.service";
import { AVATAR_SIZE, avatarFromSheet } from "@/infra/generation/avatar-cut";

export type AdminFilter = "new" | "pending_payment" | "generating" | "qa" | "needs_photo" | "ready" | "failed" | "refunded" | "all";

const FILTERS: Record<AdminFilter, GameStatus[] | null> = {
  new: ["PAID"],
  pending_payment: ["CHECKOUT_PENDING", "PAYMENT_FAILED"],
  generating: ["AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING"],
  qa: ["QA_PENDING", "MANUAL_REVIEW", "NEEDS_REGENERATION"],
  needs_photo: ["NEEDS_NEW_PHOTO"],
  ready: ["APPROVED", "READY", "DELIVERED"],
  failed: ["GENERATION_FAILED"],
  refunded: ["REFUNDED", "CANCELLED"],
  all: null,
};

export async function listOrdersForAdmin(c: Container, filter: AdminFilter) {
  const statuses = FILTERS[filter];
  const games = await c.db.game.findMany({
    where: { deletedAt: null, ...(statuses ? { status: { in: statuses } } : { NOT: { status: { in: ["DRAFT", "PHOTO_UPLOADED", "PHOTO_VALIDATING", "PHOTO_REJECTED", "PHOTO_APPROVED", "PACKAGE_SELECTED"] } } }) },
    include: { childProfile: true, owner: true, orders: { orderBy: { createdAt: "desc" }, take: 1 }, scenes: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return games.map((g) => ({
    gameId: g.id,
    orderId: g.orders[0]?.id ?? null,
    childName: g.childProfile?.displayName ?? "",
    email: g.owner?.email ?? "",
    status: statusOf(g),
    packageTier: g.packageTier,
    sceneCount: g.scenes.length,
    amountAgorot: g.orders[0]?.amountAgorot ?? 0,
    currency: g.orders[0]?.currency ?? "ILS",
    paymentStatus: g.orders[0]?.paymentStatus ?? "—",
    updatedAt: g.updatedAt,
    lastError: g.lastError,
  }));
}

export async function countsForAdmin(c: Container): Promise<Record<AdminFilter, number>> {
  const out = {} as Record<AdminFilter, number>;
  for (const key of Object.keys(FILTERS) as AdminFilter[]) {
    const statuses = FILTERS[key];
    out[key] = await c.db.game.count({ where: { deletedAt: null, ...(statuses ? { status: { in: statuses } } : { NOT: { status: { in: ["DRAFT", "PHOTO_UPLOADED", "PHOTO_VALIDATING", "PHOTO_REJECTED", "PHOTO_APPROVED", "PACKAGE_SELECTED"] } } }) } });
  }
  return out;
}

export async function orderDetailForAdmin(c: Container, gameId: string) {
  const game = await c.db.game.findUnique({
    where: { id: gameId },
    include: { childProfile: true, owner: true, orders: { orderBy: { createdAt: "desc" } }, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } }, jobs: { orderBy: { createdAt: "desc" }, take: 3 }, shareLinks: true },
  });
  if (!game) return null;
  const assets = await c.db.asset.findMany({ where: { id: { in: [game.childProfile?.avatarAssetId, game.childProfile?.identityAssetId, game.childProfile?.originalPhotoAssetId, ...game.scenes.flatMap((s) => s.targets.map((t) => t.spriteAssetId))].filter((x): x is string => Boolean(x)) } } });
  const activity = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" }, take: 40 });
  const [failedSpots, paintedSpots] = await Promise.all([failedSpotsForAdmin(c, gameId), paintedSpotsForAdmin(c, gameId)]);
  return { game, status: statusOf(game), costCents: await generationCostCents(c, gameId), assets, activity, failedSpots, paintedSpots, awaitingQa: isAwaitingQa(statusOf(game)), playable: isPlayable(statusOf(game)) };
}

/**
 * Every hiding spot that was accepted, as the cut-out patch on its own.
 *
 * The checks that accept a patch look at its shape — about the right height,
 * taller than wide, solid, near the spot — and never at whether the thing
 * painted is the child. Over one nine-board game that let through a scooter with
 * nobody on it, a horse's head and a pair of legs, alongside twenty good ones.
 * Seen inside the scene each is easy to miss; seen as a row of cut-outs, a
 * horse's head takes a second to spot. Until something can judge identity rather
 * than shape, this row is the check.
 */
export async function paintedSpotsForAdmin(c: Container, gameId: string) {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { in: ["GENERATED", "APPROVED"] }, assetId: { not: null } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true, orderIndex: true } } } } },
    orderBy: [{ targetInstance: { gameScene: { orderIndex: "asc" } } }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    targetInstanceId: r.targetInstanceId,
    assetId: r.assetId as string,
    sceneSlug: r.targetInstance.gameScene.sceneSlug,
    targetId: r.targetInstance.targetId,
    variant: r.variant,
    attempts: r.attempts,
    judge: parseJudge(r.judgeJson),
    history: attemptsForAdmin(r.usageJson),
  }));
}

/** The row's last review: `ok`, `bad`, `unknown` (a reviewer could not decide), or null when nothing reviewed it. */
export function parseJudge(json: string | null): { verdict: string; reason: string; model?: string; version?: string; checks?: Record<string, string> } | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { verdict?: unknown; reason?: unknown; model?: unknown; version?: unknown; checks?: unknown };
    if (typeof raw.verdict !== "string") return null;
    return {
      verdict: raw.verdict,
      reason: typeof raw.reason === "string" ? raw.reason : "",
      model: typeof raw.model === "string" ? raw.model : undefined,
      version: typeof raw.version === "string" ? raw.version : undefined,
      checks: raw.checks && typeof raw.checks === "object" ? (raw.checks as Record<string, string>) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * One attempt as the admin page shows it: what was painted, what pass two
 * answered, what was cut out, what the judge saw, and what each stage said.
 * Everything comes from the ledger in usageJson; an attempt written before
 * a field existed simply lacks it, and the page says so instead of guessing.
 */
export interface AdminAttempt {
  n: number;
  at: string;
  outcome: string;
  /** The stage that rejected it, or "accepted" / "held" / "pending". */
  stage: string;
  problem: string | null;
  cents: number;
  renderAssetId: string | null;
  matteAssetIds: string[];
  patchAssetId: string | null;
  compositeAssetId: string | null;
  judgeImageAssetIds: string[];
  judge: { verdict: string; reason: string; model?: string; policy?: string; checks?: Record<string, string>; reviews?: Array<{ model?: string; verdict: string; reason: string }> } | null;
  hiddenFraction: number | null;
  unchanged: number | null;
}

export function attemptsForAdmin(usageJson: string | null | undefined): AdminAttempt[] {
  try {
    const raw = JSON.parse(usageJson ?? "{}") as { ledger?: { attempts?: unknown[] } };
    const attempts = Array.isArray(raw.ledger?.attempts) ? raw.ledger!.attempts! : [];
    return attempts.map((a, i) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : null);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
      const outcome = str(x.outcome) ?? "";
      const stage = str(x.failedAt) ?? (outcome === "accepted" ? "accepted" : outcome.startsWith("held") ? "judge-unknown" : outcome.startsWith("pending") ? "pending" : outcome.startsWith("rejected") ? "unrecorded" : outcome.startsWith("error") ? "error" : "unknown");
      const j = x.judgement as Record<string, unknown> | undefined;
      const judge = j && typeof j.verdict === "string"
        ? {
            verdict: j.verdict,
            reason: str(j.reason) ?? "",
            model: str(j.model) ?? undefined,
            policy: str(j.policy) ?? undefined,
            checks: j.checks && typeof j.checks === "object" ? (j.checks as Record<string, string>) : undefined,
            reviews: Array.isArray(j.reviews) ? (j.reviews as Array<Record<string, unknown>>).map((r) => ({ model: str(r.model) ?? undefined, verdict: str(r.verdict) ?? "?", reason: str(r.reason) ?? "" })) : undefined,
          }
        : null;
      return {
        n: i + 1,
        at: str(x.at) ?? "",
        outcome,
        stage,
        problem: str(x.problem) ?? str(x.renderProblem) ?? str(x.extractionProblem) ?? null,
        cents: (num(x.rollCents) ?? 0) + (num(x.matteCents) ?? 0) + (num(x.judgeCents) ?? 0),
        renderAssetId: str(x.evidenceAssetId),
        matteAssetIds: list(x.matteEvidenceAssetIds).length ? list(x.matteEvidenceAssetIds) : str(x.matteEvidenceAssetId) ? [str(x.matteEvidenceAssetId)!] : [],
        patchAssetId: str(x.patchAssetId),
        compositeAssetId: str(x.compositeAssetId),
        judgeImageAssetIds: list(x.judgeImageAssetIds),
        judge,
        hiddenFraction: num(x.hiddenFraction),
        unchanged: num(x.unchanged),
      };
    });
  } catch {
    return [];
  }
}

/**
 * The hiding spots that did not come out, and the pictures that show why.
 *
 * A rejection reason ("painted 40px tall") says a roll was wrong; only the
 * render says how — an adult, a second child, a repainted crop, a child hidden
 * so well the rule could not see her. Before these were kept, the only way to
 * find out was to pay for another roll.
 */
export async function failedSpotsForAdmin(c: Container, gameId: string) {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { notIn: ["GENERATED", "APPROVED"] } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    targetInstanceId: r.targetInstanceId,
    sceneSlug: r.targetInstance.gameScene.sceneSlug,
    targetId: r.targetInstance.targetId,
    variant: r.variant,
    status: r.status,
    attempts: r.attempts,
    costCents: r.costCents,
    lastError: r.lastError,
    rejectedAssetIds: parseIds(r.rejectedAssetIdsJson),
    history: attemptsForAdmin(r.usageJson),
  }));
}

function parseIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * What a game cost to make, in USD cents.
 *
 * The hiding spots are the money, and they are not where this used to look: a
 * slot patch belongs to a TargetVariantAsset, so summing the assets hanging off
 * TargetInstance.spriteAssetId reported a real game as very nearly free. The
 * variant rows are also the only place a rejected roll is counted, and rejected
 * rolls are about half of what a game spends.
 *
 * Counted from the variant rows plus the identity sheet, never from both sides:
 * the asset created from a successful roll carries the same cents again.
 */
export async function generationCostCents(c: Container, gameId: string): Promise<number> {
  const [variants, child] = await Promise.all([
    c.db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, select: { costCents: true } }),
    c.db.game.findUnique({ where: { id: gameId }, select: { childProfile: { select: { identityAssetId: true, avatarAssetId: true } }, scenes: { select: { targets: { select: { spriteAssetId: true, variants: { select: { id: true } } } } } } } }),
  ]);
  let cents = variants.reduce((n, v) => n + v.costCents, 0);
  // The identity sheet is drawn once and every spot is painted from it.
  const oneOff = [child?.childProfile?.identityAssetId, child?.childProfile?.avatarAssetId].filter((x): x is string => Boolean(x));
  // Targets drawn the old way (a whole sprite, no patch) still keep their cost on the asset.
  const legacy = (child?.scenes ?? []).flatMap((s) => s.targets.filter((t) => t.variants.length === 0).map((t) => t.spriteAssetId)).filter((x): x is string => Boolean(x));
  const ids = [...oneOff, ...legacy];
  if (ids.length > 0) {
    const assets = await c.db.asset.findMany({ where: { id: { in: ids } }, select: { costCents: true } });
    cents += assets.reduce((n, a) => n + a.costCents, 0);
  }
  return cents;
}

export async function approveAndPublish(c: Container, gameId: string, actor: Actor) {
  return publishGame(c, gameId, actor);
}

export async function markTargetForRegeneration(c: Container, targetInstanceId: string, actor: Actor): Promise<void> {
  const t = await c.db.targetInstance.findUniqueOrThrow({ where: { id: targetInstanceId }, include: { gameScene: true } });
  await c.db.targetInstance.update({ where: { id: t.id }, data: { status: "NEEDS_REGENERATION" } });
  // A spot that ran out of attempts is refused by the painter until someone with
  // a reason overrides it. Asking for it again IS that reason — without this the
  // button would look like it worked and quietly change nothing.
  await c.db.targetVariantAsset.updateMany({
    where: { targetInstanceId: t.id, status: { notIn: ["GENERATED", "APPROVED"] } },
    data: { attempts: 0, status: "PENDING" },
  });
  await c.db.gameScene.update({ where: { id: t.gameSceneId }, data: { generationStatus: "NEEDS_REGENERATION" } });
  const game = await c.db.game.findUniqueOrThrow({ where: { id: t.gameScene.gameId }, select: { status: true } });
  const s = statusOf(game);
  if (s !== "NEEDS_REGENERATION") await transitionGame(c, t.gameScene.gameId, "NEEDS_REGENERATION", actor, { targetInstanceId });
  await c.jobs.enqueue("generate-game", { gameId: t.gameScene.gameId });
}

export async function adjustTarget(c: Container, targetInstanceId: string, adjust: unknown, actor: Actor): Promise<void> {
  const parsed = TargetAdjustSchema.parse(adjust);
  const t = await c.db.targetInstance.findUniqueOrThrow({ where: { id: targetInstanceId }, include: { gameScene: true } });
  await c.db.targetInstance.update({ where: { id: t.id }, data: { adjustJson: JSON.stringify(parsed) } });
  await audit(c, actor, "target:adjusted", "TargetInstance", t.id, parsed);
  const game = await c.db.game.findUniqueOrThrow({ where: { id: t.gameScene.gameId } });
  if (game.configJson) await persistGameConfig(c, game.id);
}

/**
 * Cut the round face sticker again from the child's identity sheet.
 *
 * For games made before the sticker was cut around the head: the old sticker
 * showed the whole portrait quadrant, the face small in a big white circle.
 * The new sticker replaces it everywhere the game shows it: the stored config
 * is pointed at the new asset (its URLs are re-signed on the way out anyway),
 * and the old one is dropped.
 */
export async function recutAvatar(c: Container, gameId: string, actor: Actor): Promise<{ ok: true } | { ok: false; code: "NO_SHEET" }> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  const child = game.childProfile;
  if (!child?.identityAssetId) return { ok: false, code: "NO_SHEET" };
  const sheetAsset = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!sheetAsset || sheetAsset.status !== "READY") return { ok: false, code: "NO_SHEET" };
  const sheet = await readAssetBuffer(c, child.identityAssetId);
  const png = await avatarFromSheet(sheet, Math.min(sheetAsset.width ?? 1024, sheetAsset.height ?? 1024));
  const asset = await storeAsset(c, { ownerId: child.ownerId, type: "AVATAR", visibility: "GAME", buffer: png, mimeType: "image/png", width: AVATAR_SIZE, height: AVATAR_SIZE, provider: sheetAsset.provider });
  const previous = child.avatarAssetId;
  await c.db.childProfile.update({ where: { id: child.id }, data: { avatarAssetId: asset.id } });
  if (previous) {
    const games = await c.db.game.findMany({ where: { childProfileId: child.id, configJson: { contains: `/api/assets/${previous}` } }, select: { id: true, configJson: true } });
    for (const g of games) {
      if (!g.configJson) continue;
      await c.db.game.update({ where: { id: g.id }, data: { configJson: g.configJson.replaceAll(`/api/assets/${previous}`, `/api/assets/${asset.id}`) } });
    }
    await deleteAsset(c, previous);
  }
  await audit(c, actor, "avatar:recut", "ChildProfile", child.id, { assetId: asset.id, previous });
  return { ok: true };
}

export async function requestNewPhoto(c: Container, gameId: string, actor: Actor, note: string): Promise<void> {
  await c.db.game.update({ where: { id: gameId }, data: { lastError: note || "נדרשת תמונה חדשה" } });
  await transitionGame(c, gameId, "NEEDS_NEW_PHOTO", actor, { note });
}

export async function retryGeneration(c: Container, gameId: string, actor: Actor): Promise<void> {
  await audit(c, actor, "generation:retry", "Game", gameId);
  await c.jobs.enqueue("generate-game", { gameId });
}

/** Rough FX used only for the margin estimate on the cost dashboard (not for billing). */
const APPROX_ILS_PER_USD = 3.7;

export async function costDashboard(c: Container) {
  const games = await c.db.game.findMany({ where: { deletedAt: null, status: { in: ["READY", "DELIVERED", "QA_PENDING", "MANUAL_REVIEW", "APPROVED"] } }, include: { orders: true, childProfile: true, scenes: { include: { targets: true } } } });
  const rows = [];
  for (const g of games) {
    const generationCents = await generationCostCents(c, g.id);
    const paid = g.orders.find((o) => o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED");
    const attempts = g.scenes.reduce((n, s) => n + s.targets.reduce((m, t) => m + t.attempts, 0), 0);
    const currency: Currency = paid && isCurrency(paid.currency) ? paid.currency : "ILS";
    const priceMinor = paid?.amountAgorot ?? 0;
    // Generation costs are tracked in USD cents; ILS revenue is converted with a rough rate so the margin column stays comparable.
    const priceUsdCents = currency === "USD" ? priceMinor : priceMinor / APPROX_ILS_PER_USD;
    rows.push({ gameId: g.id, childName: g.childProfile?.displayName ?? "", priceMinor, currency, generationCents, attempts, marginPct: paid && priceUsdCents > 0 ? Math.round(((priceUsdCents - generationCents) / priceUsdCents) * 100) : null });
  }
  return rows;
}
