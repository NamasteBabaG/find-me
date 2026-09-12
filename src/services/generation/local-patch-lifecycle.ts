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
    private readonly ledger: Pick<PurchaseLedger, "settle" | "markUnknown">) {}

  get(worldId: string, requestKey: string) {
    this.checkWorld(worldId);
    return new PrismaRetainedPurchaseStore(this.c.db).get(worldId, requestKey);
  }

  async put(worldId: string, requestKey: string, value: RetainedPurchase) {
    this.checkWorld(worldId);
    try {
      await this.c.db.$transaction(async tx => {
        await fenceLocalPatchImages(tx, this.gameId);
        await new PrismaRetainedPurchaseStore(tx).put(worldId, requestKey, value);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
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
