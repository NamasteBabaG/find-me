import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { retainedNormalHeadRecoveryCandidate } from "../../domain/generation/retained-normal-head";
import { QA_COMPLETION_CAP } from "../../domain/generation/qa-completion-capacity";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { restoreRetainedNormalHead } from "./retained-normal-head-recovery";
import { auditWorldBudget } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";
import type { LocalPatchHideDeps } from "./local-patch-hide";

export const RETAINED_NORMAL_HEAD_SCAN_VERSION = "retained-normal-head-scan/v1";
export const RETAINED_NORMAL_HEAD_SCAN_ACTION = "local-patch:retained-normal-head-scan";

type Row = { id: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null };
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));

/** Scheduling only: the exact inputs that could turn an unproductive scan into a
 * restore. Each candidate's own row, the completion grant, and every paid review
 * bound to a candidate. Any change re-arms the scan. */
async function scanId(c: Container, gameId: string, authorizationSha256: string, candidates: readonly Row[]) {
  const ids = new Set(candidates.map(row => row.id));
  const intents = await c.db.auditLog.findMany({ where: { actorType: "SYSTEM", action: "generation:sol-background-review", entityType: "Game",
    entityId: gameId, id: { endsWith: "_intent" } }, select: { id: true, metaJson: true } });
  const bound = intents.filter(intent => {
    try { return ids.has(JSON.parse(intent.metaJson ?? "null")?.intent?.binding?.variantId); } catch { return true; }
  }).map(intent => intent.id).sort();
  const rows = [...candidates].sort((a, b) => a.id.localeCompare(b.id))
    .map(row => [row.id, row.status, row.attempts, row.assetId, hash(row.judgeJson)]);
  return "aud_rnh_scan_" + hash([RETAINED_NORMAL_HEAD_SCAN_VERSION, gameId, authorizationSha256, rows, bound]).slice(0, 40);
}

/** The optional retained-normal scan rebuilds every candidate's older paid
 * compositions (~100 s on QA). A repair or painting starts only with its full
 * paid window left (175 s for v13), so repeating an unproductive scan every
 * slice starved all paid work. Run it once per exact candidate state; remember only a scan
 * the restore itself reports complete (every candidate examined against terminal,
 * settled evidence, no early exit or lost race) over a quiet ledger. Never a purchase permission. */
export async function restoreRetainedNormalHeadOnce(c: Container, gameId: string, authorizationSha256: string, rows: readonly Row[],
  fence: (tx: Prisma.TransactionClient) => Promise<void>, readArt?: LocalPatchHideDeps["readBoardArt"]): Promise<boolean> {
  const candidates = rows.filter(retainedNormalHeadRecoveryCandidate);
  // Nothing to rebuild: the scan itself returns at once, as before.
  if (!candidates.length) return restoreRetainedNormalHead(c, gameId, rows, fence, readArt);
  const id = await scanId(c, gameId, authorizationSha256, candidates);
  if (await c.db.auditLog.findUnique({ where: { id }, select: { id: true } })) return false;
  const scan = { complete: false };
  if (await restoreRetainedNormalHead(c, gameId, rows, fence, readArt, scan)) return true;
  // An early exit, a lost race, or a paid answer still pending or running is not remembered.
  if (!scan.complete) return false;
  const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(gameId + ":board-wizard");
  const audit = stored ? auditWorldBudget(stored.snapshot, QA_COMPLETION_CAP) : null;
  if (!audit || audit.held || audit.overCapMicroUsd || audit.pendingRequestKeys.length || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length) return false;
  await c.db.$transaction(async tx => {
    await fence(tx);
    if (await tx.auditLog.findUnique({ where: { id }, select: { id: true } })) return;
    await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: RETAINED_NORMAL_HEAD_SCAN_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ version: RETAINED_NORMAL_HEAD_SCAN_VERSION, outcome: "no-restorable-source", candidates: candidates.length, providerCalls: 0 }) } });
  });
  return false;
}
