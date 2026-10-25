import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import type { PurchaseLedger, RetainedPurchase, RetainedPurchaseStore } from "./paid-operation";

export class LocalPatchDeleted extends Error {
  constructor() { super("LOCAL_PATCH_HIDE: this game was deleted; no child imagery may be saved"); }
}

/** Lock Game before any private write, in the same order as deletion. Unlike a
 * job lease, this fence must also cover unlinked, paid evidence from a late worker. */
export async function fenceLocalPatchImages(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
  const live = await tx.game.updateMany({
    where: { id: gameId, deletedAt: null, NOT: { status: "DELETED" } }, data: { deletedAt: null },
  });
  if (live.count !== 1) throw new LocalPatchDeleted();
}

/** A deleted child's bytes are deliberately not retained. A late reply still
 * records its actual bill (or unknown charge) before stopping the pipeline; it
 * must not save a new envelope or start the subsequent judge purchase. */
export class LocalPatchRetainedPurchaseStore implements RetainedPurchaseStore {
  constructor(private readonly c: Container, private readonly gameId: string,
    private readonly ledger: Pick<PurchaseLedger, "settle" | "markUnknown">, private readonly retentionDeadlineAt?: number) {}

  get(worldId: string, requestKey: string) {
    this.checkWorld(worldId);
    return new PrismaRetainedPurchaseStore(this.c.db).get(worldId, requestKey);
  }

  async put(worldId: string, requestKey: string, value: RetainedPurchase) {
    this.checkWorld(worldId);
    try {
      // Retry ONLY the immutable answer's idempotent put. Parallel worlds can
      // contend for a transaction connection; dropping a paid answer at P2028
      // left its reservation pending forever. No provider is called here.
      const until = Math.min(Date.now() + 25_000, this.retentionDeadlineAt ?? Infinity);
      let previous: unknown;
      for (let attempt = 0; ; attempt++) {
        const remaining = until - Date.now();
        if (remaining < 2_000) throw previous ?? new Error("LOCAL_PATCH_RETAIN: no retention window remains");
        const maxWait = Math.min(5_000, Math.floor(remaining / 3));
        try {
          await this.c.db.$transaction(async tx => {
            await fenceLocalPatchImages(tx, this.gameId);
            await new PrismaRetainedPurchaseStore(tx).put(worldId, requestKey, value);
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait, timeout: Math.min(20_000, remaining - maxWait - 1_000) });
          break;
        } catch (error) {
          const transient = error instanceof Prisma.PrismaClientKnownRequestError
            && ["P2028", "P2024", "P2034"].includes(error.code);
          if (!transient || attempt >= 2) throw error;
          previous = error;
        }
      }
    } catch (error) {
      if (!(error instanceof LocalPatchDeleted)) throw error;
      if (value.evidence) await this.ledger.settle(worldId, requestKey, value.evidence);
      else await this.ledger.markUnknown(worldId, requestKey, value.unknownReason ?? "deleted game received an unpriceable reply");
      throw error;
    }
  }

  private checkWorld(worldId: string) {
    if (worldId !== `${this.gameId}:board-wizard`) throw new Error("LOCAL_PATCH_HIDE: retained world does not belong to this game");
  }
}
