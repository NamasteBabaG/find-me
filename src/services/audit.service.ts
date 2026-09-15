import { newId } from "@/lib/ids";
import type { Prisma } from "@prisma/client";
import type { Container } from "./container";

export type Actor = { type: "SYSTEM" | "WEBHOOK" } | { type: "USER" | "ADMIN"; id: string };

export const SYSTEM: Actor = { type: "SYSTEM" };
export const WEBHOOK: Actor = { type: "WEBHOOK" };

/** Enough of a client to write the trail, so an audit can join the transaction it describes. */
export type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;

export async function audit(c: Container, actor: Actor, action: string, entityType: string, entityId: string, meta?: Record<string, unknown>, db: AuditDb = c.db): Promise<void> {
  await db.auditLog.create({
    data: {
      id: newId("aud"),
      actorType: actor.type,
      actorId: "id" in actor ? actor.id : null,
      action,
      entityType,
      entityId,
      metaJson: meta ? JSON.stringify(meta) : null,
    },
  });
}
