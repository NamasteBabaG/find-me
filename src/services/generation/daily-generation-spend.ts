import type { PrismaClient } from "@prisma/client";
import { auditWorldBudget, type WorldBudgetSnapshot } from "./world-budget";

type AssetCost = { provider: string | null; providerRequestId: string | null; costCents: number };
type SpotCost = { provider: string | null; costCents: number; gameId: string };
/** Ledger-backed charges are mirrored on display rows, not additional purchases.
 * Uncovered historical costs and the entire history of touched ledgers still
 * count conservatively. Pending/unknown reservations never expire here. */
export function sumDailyGenerationSpend(input: { assets: AssetCost[]; spots: SpotCost[]; ledgers: WorldBudgetSnapshot[] }) {
  const receipts = new Map<string, number>(), receiptIds = new Set<string>(), imageWorlds = new Set<string>();
  let reservationsMicroUsd = 0;
  for (const snapshot of input.ledgers) {
    auditWorldBudget(snapshot);
    if (snapshot.worldId.endsWith(":board-wizard") && snapshot.requests.some(r => r.scope === "image"))
      imageWorlds.add(snapshot.worldId.slice(0, -":board-wizard".length));
    for (const request of snapshot.requests) {
      if (request.state === "pending" || request.state === "unknown") reservationsMicroUsd += request.reserveMicroUsd;
      if (request.state !== "settled") continue;
      const bill = request.evidence, key = JSON.stringify([bill.providerNamespace, bill.providerRequestId]);
      receipts.set(key, Math.max(receipts.get(key) ?? 0, bill.amountMicroUsd));
      receiptIds.add(bill.providerRequestId);
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
  const [assets, spots, ledgers] = await Promise.all([
    db.asset.findMany({ where: { createdAt: { gte: start }, costCents: { gt: 0 } }, select: { provider: true, providerRequestId: true, costCents: true } }),
    db.targetVariantAsset.findMany({ where: { updatedAt: { gte: start }, costCents: { gt: 0 } }, select: { provider: true, costCents: true,
      targetInstance: { select: { gameScene: { select: { gameId: true } } } } } }),
    db.worldBudgetLedger.findMany({ where: { updatedAt: { gte: start } }, select: { snapshotJson: true } }),
  ]);
  return sumDailyGenerationSpend({ assets, spots: spots.map(s => ({ provider: s.provider, costCents: s.costCents, gameId: s.targetInstance.gameScene.gameId })),
    ledgers: ledgers.map(l => JSON.parse(l.snapshotJson) as WorldBudgetSnapshot) });
}
