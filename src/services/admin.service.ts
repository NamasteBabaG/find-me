import { TargetAdjustSchema } from "@/domain/game/config";
import { isCurrency, type Currency } from "@/domain/package";
import { isAwaitingQa, isPlayable, type GameStatus } from "@/domain/order-state";
import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { persistGameConfig } from "./generation/scene-composer";
import { publishGame } from "./publish.service";
import { audit, type Actor } from "./audit.service";

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
  const assets = await c.db.asset.findMany({ where: { id: { in: [game.childProfile?.avatarAssetId, game.childProfile?.originalPhotoAssetId, ...game.scenes.flatMap((s) => s.targets.map((t) => t.spriteAssetId))].filter((x): x is string => Boolean(x)) } } });
  const cost = assets.reduce((n, a) => n + a.costCents, 0);
  const activity = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" }, take: 40 });
  return { game, status: statusOf(game), costCents: cost, assets, activity, awaitingQa: isAwaitingQa(statusOf(game)), playable: isPlayable(statusOf(game)) };
}

export async function approveAndPublish(c: Container, gameId: string, actor: Actor) {
  return publishGame(c, gameId, actor);
}

export async function markTargetForRegeneration(c: Container, targetInstanceId: string, actor: Actor): Promise<void> {
  const t = await c.db.targetInstance.findUniqueOrThrow({ where: { id: targetInstanceId }, include: { gameScene: true } });
  await c.db.targetInstance.update({ where: { id: t.id }, data: { status: "NEEDS_REGENERATION" } });
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
    const ids = [g.childProfile?.avatarAssetId, ...g.scenes.flatMap((s) => s.targets.map((t) => t.spriteAssetId))].filter((x): x is string => Boolean(x));
    const assets = ids.length ? await c.db.asset.findMany({ where: { id: { in: ids } } }) : [];
    const generationCents = assets.reduce((n, a) => n + a.costCents, 0);
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
