import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { receiveSupportRequest, listSupportRequests, resolveSupportRequest, purgeSupportContent } from "../support.service";
import type { Container } from "../container";

let db: PrismaClient, scratch: string;
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "findme-support-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "support.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
});
afterAll(async () => { await db.$disconnect(); const root = realpathSync(tmpdir()); if (!scratch.startsWith(root + path.sep)) throw Error("Unsafe test cleanup"); rmSync(scratch, { recursive: true, force: true }); });
beforeEach(async () => { await db.auditLog.deleteMany(); });
const input = { requestKey: "4e22144e-36ce-450b-8924-56f6af43fe4b", locale: "he", topic: "cancellation", email: "fixture@example.com", order: "", message: "" };
describe("durable public support notices", () => {
  it("records an anonymous cancellation without a reason or order number, and retries return the same receipt", async () => {
    const first = await receiveSupportRequest(db, input);
    expect(await receiveSupportRequest(db, input)).toEqual(first);
    expect(await db.auditLog.count()).toBe(1);
    expect((await listSupportRequests(db)).requests).toMatchObject([{ id: first.reference, topic: "cancellation", email: input.email }]);
  });
  it("refuses reusing a receipt key for different content without modifying the notice", async () => {
    await receiveSupportRequest(db, input);
    await expect(receiveSupportRequest(db, { ...input, email: "other@example.com" })).rejects.toThrow("SUPPORT_KEY_CONFLICT");
    expect((await listSupportRequests(db)).requests[0]?.email).toBe(input.email);
  });
  it("resolution adds an admin record and keeps the original receipt intact", async () => {
    const receipt = await receiveSupportRequest(db, input);
    await resolveSupportRequest({ db } as Container, receipt.reference, "synthetic-admin");
    expect((await listSupportRequests(db)).requests).toHaveLength(0);
    expect((await listSupportRequests(db, true)).requests).toHaveLength(1);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: receipt.reference } })).createdAt.toISOString()).toBe(receipt.receivedAt);
  });
  it("removes old support personal content without changing game or other audit records", async () => {
    const receipt = await receiveSupportRequest(db, input);
    await db.auditLog.update({ where: { id: receipt.reference }, data: { createdAt: new Date("2024-09-01") } });
    await db.auditLog.create({ data: { id: "unrelated", actorType: "SYSTEM", action: "game:test", entityType: "Game", entityId: "fixture", metaJson: "{}", createdAt: new Date("2024-09-01") } });
    expect((await purgeSupportContent(db, new Date("2026-10-01"))).count).toBe(1);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: receipt.reference } })).metaJson).toBe('{"redacted":true}');
    expect(await db.auditLog.findUnique({ where: { id: "unrelated" } })).not.toBeNull();
    expect((await purgeSupportContent(db, new Date("2026-10-01"))).count).toBe(0);
  });
  it("paginates without losing older notices", async () => {
    for (let i = 0; i < 52; i++) await db.auditLog.create({ data: { id: `support_${i.toString(16).padStart(40, "0")}`, actorType: "SYSTEM", action: "support:received", entityType: "SupportRequest", entityId: "synthetic", metaJson: JSON.stringify(input) } });
    const first = await listSupportRequests(db);
    expect(first.requests).toHaveLength(50); expect(first.nextCursor).not.toBeNull();
    const second = await listSupportRequests(db, false, first.nextCursor!);
    expect(second.requests).toHaveLength(2); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.requests, ...second.requests].map(r => r.id)).size).toBe(52);
  });
});
