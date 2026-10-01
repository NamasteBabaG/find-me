import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "./container";
import { audit } from "./audit.service";
import { LEGAL_VERSION } from "@/domain/legal";

export const SupportInput = z.object({
  requestKey: z.string().uuid(), locale: z.enum(["he", "en"]),
  topic: z.enum(["help", "cancellation", "privacy", "accessibility"]),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  order: z.string().trim().max(160).default(""), message: z.string().trim().max(2500).default(""),
  website: z.literal("").default(""),
}).strict();
type SupportDb = Pick<Container["db"], "auditLog">;
const REQUEST_ACTION = "support:received";

/** Durable acknowledgement. No refund, account lookup, or email is triggered. */
export async function receiveSupportRequest(db: SupportDb, raw: unknown) {
  const input = SupportInput.parse(raw);
  const id = `support_${createHash("sha256").update(input.requestKey).digest("hex").slice(0, 40)}`;
  const { requestKey: _key, website: _trap, ...content } = input;
  const fingerprint = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  let row;
  try {
    row = await db.auditLog.create({ data: { id, actorType: "SYSTEM", action: REQUEST_ACTION,
      entityType: "SupportRequest", entityId: id, metaJson: JSON.stringify({ ...content, fingerprint, version: LEGAL_VERSION }) }, select: { id: true, createdAt: true } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // A response lost in transit can be retried without creating a second notice.
    const existing = await db.auditLog.findUnique({ where: { id }, select: { id: true, createdAt: true, metaJson: true } });
    if (!existing || JSON.parse(existing.metaJson ?? "{}").fingerprint !== fingerprint) throw new Error("SUPPORT_KEY_CONFLICT");
    row = existing;
  }
  return { reference: row.id, receivedAt: row.createdAt.toISOString() };
}

export async function listSupportRequests(db: SupportDb, closed = false, cursor?: string) {
  const fetched = await db.auditLog.findMany({ where: { action: REQUEST_ACTION, entityType: "SupportRequest" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    ...(cursor && /^support_[a-f0-9]{40}$/.test(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const rows = fetched.slice(0, 50);
  const resolutions = await db.auditLog.findMany({ where: { action: "support:resolved", entityType: "SupportRequest", entityId: { in: rows.map(r => r.id) } }, select: { entityId: true } });
  const done = new Set(resolutions.map(r => r.entityId));
  const requests = rows.flatMap(row => {
    const meta = JSON.parse(row.metaJson ?? "{}");
    const content = SupportInput.omit({ requestKey: true, website: true }).safeParse({ locale: meta.locale, topic: meta.topic, email: meta.email, order: meta.order, message: meta.message });
    return content.success && done.has(row.id) === closed ? [{ id: row.id, createdAt: row.createdAt, ...content.data }] : [];
  });
  return { requests, nextCursor: fetched.length > 50 ? rows.at(-1)!.id : null };
}

export async function resolveSupportRequest(c: Container, id: string, adminId: string) {
  if (!/^support_[a-f0-9]{40}$/.test(id)) throw new Error("INVALID_SUPPORT_ID");
  const request = await c.db.auditLog.findFirst({ where: { id, action: REQUEST_ACTION, entityType: "SupportRequest" } });
  if (!request) throw new Error("SUPPORT_NOT_FOUND");
  await audit(c, { type: "ADMIN", id: adminId }, "support:resolved", "SupportRequest", id);
}

/** Keep the receipt time/reference while removing the submitted personal content. */
export async function purgeSupportContent(db: SupportDb, now = new Date()) {
  const cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1);
  return db.auditLog.updateMany({ where: { action: REQUEST_ACTION, entityType: "SupportRequest", createdAt: { lt: cutoff }, NOT: { metaJson: "{\"redacted\":true}" } }, data: { metaJson: "{\"redacted\":true}" } });
}
