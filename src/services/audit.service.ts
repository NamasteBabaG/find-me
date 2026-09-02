import { newId } from "@/lib/ids";
import type { Container } from "./container";

export type Actor = { type: "SYSTEM" | "WEBHOOK" } | { type: "USER" | "ADMIN"; id: string };

export const SYSTEM: Actor = { type: "SYSTEM" };
export const WEBHOOK: Actor = { type: "WEBHOOK" };

export async function audit(c: Container, actor: Actor, action: string, entityType: string, entityId: string, meta?: Record<string, unknown>): Promise<void> {
  await c.db.auditLog.create({
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
