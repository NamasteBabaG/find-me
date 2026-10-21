import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const config = vi.hoisted(() => ({ APP_ENV: "qa", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }));
vi.mock("../../../lib/env", () => ({ env: () => config }));
import { IDENTITY_SOURCE_ACTION, IDENTITY_SOURCE_RELEASE, identitySourceAuditId, identitySourceReceipt, identitySourceReleaseOf, pinIdentitySourceRelease } from "../identity-source-release";

function fixture(patch = {}, order: unknown = null, job: unknown = null) {
  const create = vi.fn(), tx = { game: { findUniqueOrThrow: vi.fn(async () => ({ status: "DRAFT", styleVersion: "local-patch-world-v1", ...patch })) },
    order: { findFirst: vi.fn(async () => order) }, generationJob: { findFirst: vi.fn(async () => job) }, auditLog: { create } } as unknown as Prisma.TransactionClient;
  return { tx, create };
}
afterEach(() => Object.assign(config, { APP_ENV: "qa", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }));
describe("prospective full-source identity pin", () => {
  it("pins exactly once at a fresh draft boundary and reads only its immutable receipt", async () => {
    const f = fixture(); await pinIdentitySourceRelease(f.tx, "synthetic-draft");
    const data = f.create.mock.calls[0]![0].data;
    expect(data).toEqual({ id: identitySourceAuditId("synthetic-draft"), actorType: "SYSTEM", action: IDENTITY_SOURCE_ACTION,
      entityType: "Game", entityId: "synthetic-draft", metaJson: JSON.stringify(identitySourceReceipt("synthetic-draft")) });
    const db = { auditLog: { findUnique: async () => ({ ...data, actorId: null }) } } as unknown as Prisma.TransactionClient;
    expect(await identitySourceReleaseOf(db, "synthetic-draft")).toBe(IDENTITY_SOURCE_RELEASE);
    data.metaJson = JSON.stringify({ ...identitySourceReceipt("synthetic-draft"), styleVersion: "board-matched-identity/v5" });
    await expect(identitySourceReleaseOf(db, "synthetic-draft")).rejects.toThrow("invalid");
  });
  it.each([{ status: "AVATAR_GENERATING" }, { paidAt: new Date() }, { readyAt: new Date() }, { configJson: "{}" }, { deletedAt: new Date() }, { styleVersion: "collage-v1" }])("cannot repin a started/paid or foreign game: %j", async patch => {
    const f = fixture(patch); await expect(pinIdentitySourceRelease(f.tx, "existing")).rejects.toThrow("unstarted"); expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["order", "job"])("does not retrofit a draft with a retained %s", async kind => {
    const f = fixture({}, kind === "order" ? {} : null, kind === "job" ? {} : null);
    await expect(pinIdentitySourceRelease(f.tx, "existing")).rejects.toThrow("unstarted"); expect(f.create).not.toHaveBeenCalled();
  });
  it("is off by default and refuses production rather than silently activating it", async () => {
    config.LOCAL_PATCH_IDENTITY_SOURCE = "legacy";
    const f = fixture(); await pinIdentitySourceRelease(f.tx, "existing"); expect(f.tx.game.findUniqueOrThrow).not.toHaveBeenCalled();
    config.LOCAL_PATCH_IDENTITY_SOURCE = "full-source-v1"; config.APP_ENV = "production";
    await expect(pinIdentitySourceRelease(f.tx, "existing")).rejects.toThrow("QA only"); expect(f.create).not.toHaveBeenCalled();
  });
  it("an unpinned world remains legacy even while the flag is enabled", async () => {
    const db = { auditLog: { findUnique: async () => null } } as unknown as Prisma.TransactionClient;
    expect(await identitySourceReleaseOf(db, "existing")).toBeNull();
  });
});
