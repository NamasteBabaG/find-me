import type { PrismaClient } from "@prisma/client";
import { auditWorldBudget, type WorldBudgetSnapshot } from "./world-budget";
import { retainedPurchaseKey, RetainedPurchaseError } from "../../infra/db/prisma-retained-purchase-store";

type AssetCost = { provider: string | null; providerRequestId: string | null; costCents: number };
type SpotCost = { provider: string | null; costCents: number; gameId: string };
/** Ledger-backed charges are mirrored on display rows, not additional purchases.
 * Immutable retained-purchase creation dates locate individual paid responses.
 * Pending/unknown reservations remain counted across midnight. */
export function sumDailyGenerationSpend(input: { assets: AssetCost[]; spots: SpotCost[]; ledgers: WorldBudgetSnapshot[];
  since?: Date; until?: Date; purchaseDates?: ReadonlyMap<string, Date>; legacyLedgerDates?: ReadonlyMap<string, Date> }) {
  const receipts = new Map<string, number>(), receiptIds = new Set<string>(), imageWorlds = new Set<string>();
  const purchaseDate = (worldId: string, requestKey: string) => {
    if (!input.purchaseDates) return undefined;
    try { return input.purchaseDates.get(retainedPurchaseKey(worldId, requestKey)); }
    catch (error) {
      // Historical checkpoint/import keys have a wider alphabet than this
      // retained store. They still have real bills; use the conservative fallback.
      if (error instanceof RetainedPurchaseError && error.code === "invalid-scope") return undefined;
      throw error;
    }
  };
  const receiptDates = new Map<string, Date>();
  for (const snapshot of input.ledgers) for (const request of snapshot.requests) {
    if (request.state !== "settled" && request.state !== "linked") continue;
    const date = purchaseDate(snapshot.worldId, request.requestKey);
    const key = JSON.stringify([request.evidence.providerNamespace, request.evidence.providerRequestId]);
    if (date && (!receiptDates.has(key) || date < receiptDates.get(key)!)) receiptDates.set(key, date);
  }
  let reservationsMicroUsd = 0;
  for (const snapshot of input.ledgers) {
    auditWorldBudget(snapshot);
    if (snapshot.worldId.endsWith(":board-wizard") && snapshot.requests.some(r => r.scope === "image"))
      imageWorlds.add(snapshot.worldId.slice(0, -":board-wizard".length));
    for (const request of snapshot.requests) {
      if (request.state === "pending" || request.state === "unknown") reservationsMicroUsd += request.reserveMicroUsd;
      if (request.state !== "settled") continue;
      const bill = request.evidence, key = JSON.stringify([bill.providerNamespace, bill.providerRequestId]);
      receiptIds.add(bill.providerRequestId);
      const paidAt = receiptDates.get(key)
        ?? input.legacyLedgerDates?.get(snapshot.worldId);
      // Historical imported bills may have no retained purchase. Keep that
      // fallback conservative; never invent a purchase timestamp or zero cost.
      if (paidAt && (input.since && paidAt < input.since || input.until && paidAt >= input.until)) continue;
      receipts.set(key, Math.max(receipts.get(key) ?? 0, bill.amountMicroUsd));
    }
  }
  const assetCovered = (asset: AssetCost) => !!asset.providerRequestId && (receiptIds.has(asset.providerRequestId)
    || asset.provider === "local-patch" && imageWorlds.has(asset.providerRequestId));
  const spotCovered = (spot: SpotCost) => spot.provider === "local-patch" && imageWorlds.has(spot.gameId);
  const legacyAssetCents = input.assets.filter(a => !assetCovered(a)).reduce((sum, a) => sum + a.costCents, 0);
  const legacySpotCents = input.spots.filter(s => !spotCovered(s)).reduce((sum, s) => sum + s.costCents, 0);
  const ledgerMicroUsd = reservationsMicroUsd + [...receipts.values()].reduce((sum, cost) => sum + cost, 0);
  if (!Number.isSafeInteger(ledgerMicroUsd)) throw Error("Daily generation accounting exceeds safe precision");
  return { totalCents: legacyAssetCents + legacySpotCents + ledgerMicroUsd / 10_000, ledgerMicroUsd,
    reservationsMicroUsd, legacyAssetCents, legacySpotCents,
    coveredAssets: input.assets.filter(assetCovered).length, coveredSpots: input.spots.filter(spotCovered).length };
}
export async function dailyGenerationSpend(db: PrismaClient, now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const [assets, spots, ledgers, purchases] = await Promise.all([
    db.asset.findMany({ where: { createdAt: { gte: start }, costCents: { gt: 0 } }, select: { provider: true, providerRequestId: true, costCents: true } }),
    db.targetVariantAsset.findMany({ where: { updatedAt: { gte: start }, costCents: { gt: 0 } }, select: { provider: true, costCents: true,
      targetInstance: { select: { gameScene: { select: { gameId: true } } } } } }),
    // A ledger untouched today can still carry an unresolved reservation.
    db.worldBudgetLedger.findMany({ select: { worldId: true, snapshotJson: true, updatedAt: true } }),
    db.fileBlob.findMany({ where: { contentType: "application/vnd.findme.retained-purchase+json" }, select: { key: true, createdAt: true } }),
  ]);
  return sumDailyGenerationSpend({ assets, spots: spots.map(s => ({ provider: s.provider, costCents: s.costCents, gameId: s.targetInstance.gameScene.gameId })),
    ledgers: ledgers.map(l => JSON.parse(l.snapshotJson) as WorldBudgetSnapshot), since: start, until: end,
    purchaseDates: new Map(purchases.map(p => [p.key, p.createdAt])), legacyLedgerDates: new Map(ledgers.map(l => [l.worldId, l.updatedAt])) });
}
