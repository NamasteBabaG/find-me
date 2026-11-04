import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { SINGLE_TRANSPORT_CONTINUATION, SINGLE_TRANSPORT_CONTINUATION_ACTION, singleTransportCandidate, singleTransportFaultOf, singleTransportChargeSettled,
} from "../../domain/generation/single-transport-continuation";
import { backgroundRoundOfKey } from "./continuity-background";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";

type Row = { id: string; status: string; lastError: string | null; judgeJson: string | null };

/**
 * single-transport-continuation/v1: logs, on each FAILED single-review appearance, the round its latest question
 * ended in transit, read from that round's own record (its intent names these exact pixels). Free: nothing is
 * reserved, asked or bought, the charge stays as settled, and the row keeps its status, attempts and pixels. The log
 * entry is what lets the appearance's evidence recovery ask its one continuation. True when any row changed.
 */
export async function recordSingleTransportFaults(c: Container, gameId: string, rows: readonly Row[],
  fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<boolean> {
  const worldId = `${gameId}:board-wizard`;
  let changed = false;
  for (const row of rows) {
    const candidate = singleTransportCandidate(row);
    if (!candidate) continue;
    const round = await backgroundRoundOfKey(c.db, gameId, worldId, candidate.requestKey);
    if (!round || round.intent.requestKey !== candidate.requestKey || round.intent.worldId !== worldId
      || round.intent.binding.variantId !== row.id || round.intent.binding.imageSha256 !== candidate.imageSha256) continue;
    const code = singleTransportFaultOf(round);
    if (!code || round.terminal?.kind !== "outcome") continue;
    const entry = { attempt: candidate.attempt, role: "quality", kind: "transport", code, path: null, strategy: "standard/v1",
      at: new Date(round.terminal.at).toISOString(), imageSha256: candidate.imageSha256, single: candidate.single };
    const receipt = JSON.parse(row.judgeJson!);
    const judgeJson = JSON.stringify({ ...receipt, evidenceAttempts: [...(Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts : []), entry] });
    const auditId = "aud_single_transport_" + sha256Bytes(Buffer.from(JSON.stringify([gameId, row.id, candidate.imageSha256, candidate.requestKey, candidate.attempt]))).slice(0, 40);
    changed = await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
      if (!singleTransportChargeSettled(ledger?.snapshot.requests.find(r => r.requestKey === candidate.requestKey), round)) return false;
      if (await tx.auditLog.findUnique({ where: { id: auditId } })) return false;
      const written = await tx.targetVariantAsset.updateMany({ where: { id: row.id, status: "FAILED", judgeJson: row.judgeJson }, data: { judgeJson } });
      if (written.count !== 1) return false;
      await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: SINGLE_TRANSPORT_CONTINUATION_ACTION, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ version: SINGLE_TRANSPORT_CONTINUATION, variantId: row.id, imageSha256: candidate.imageSha256, requestKey: candidate.requestKey,
          responseId: round.submitted?.responseId ?? null, providerStatus: round.terminal!.kind === "outcome" ? round.terminal!.providerStatus : null,
          errorCode: round.terminal!.kind === "outcome" ? round.terminal!.errorCode ?? null : null, cancelAt: round.cancelAt, entry,
          providerCalls: 0, chargesChanged: false }) } });
      return true;
    }) || changed;
  }
  return changed;
}
