import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE_PLACEMENT_RELEASE_SHA256 } from "../../../../content/adventures/source-placement-release";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { sourcePlacementCanonical } from "../../../domain/scene/source-placement-release";
import { leanReleaseAuditId, leanReleaseReceipt, LOCAL_PATCH_LEAN_ACTION } from "../lean-release";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { assertTrustedSourcePlacementContext, pinSourcePlacementRelease, resolveLocalPatchBoardForGame,
  resolveLocalPatchBoardsForGame, sourcePlacementForHide, sourcePlacementReleaseAuditId, sourcePlacementReleaseOf } from "../source-placement-release";

const configuration = vi.hoisted(() => ({ appEnv: "qa", prompt: "v19" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: configuration.appEnv, LOCAL_PATCH_PROMPT_RELEASE: configuration.prompt }) }));

function database() {
  type Row = { id: string; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string; metaJson: string | null };
  const rows = new Map<string, Row>();
  const state = { game: { id: "game_synthetic_source", status: "DRAFT", styleVersion: "local-patch-world-v1",
    deletedAt: null, readyAt: null, configJson: null, paidAt: null }, order: false, job: false, attempt: false };
  const db = {
    auditLog: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Row, "actorId"> & { actorId?: string | null } }) => {
        const row = { actorId: null, ...data }; if (rows.has(row.id)) throw Error("synthetic duplicate audit"); rows.set(row.id, row); return row;
      }),
      upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: Omit<Row, "actorId"> }) => {
        if (!rows.has(where.id)) rows.set(where.id, { actorId: null, ...create }); return rows.get(where.id)!;
      }),
    },
    game: { findUniqueOrThrow: vi.fn(async () => state.game) },
    order: { findFirst: vi.fn(async () => state.order ? { id: "synthetic-order" } : null) },
    generationJob: { findFirst: vi.fn(async () => state.job ? { id: "synthetic-job" } : null) },
    targetVariantAsset: { findFirst: vi.fn(async () => state.attempt ? { id: "synthetic-attempt" } : null) },
  };
  return { rows, state, tx: db as unknown as Prisma.TransactionClient };
}
async function basePins(f: ReturnType<typeof database>) {
  const gameId = f.state.game.id;
  f.rows.set(leanReleaseAuditId(gameId), { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", actorId: null,
    action: LOCAL_PATCH_LEAN_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanReleaseReceipt(gameId)) });
  await pinVisualReviewRelease(f.tx, gameId, DUAL_VISUAL_REVIEW_V3);
}
beforeEach(() => { configuration.appEnv = "qa"; configuration.prompt = "v19"; });

describe("prospective companion pin without activation", () => {
  it("does nothing to an unpinned historical game and returns exact original catalog references", async () => {
    const f = database(), before = sourcePlacementCanonical(localPatchBoardsForVersion(12));
    expect(await sourcePlacementReleaseOf(f.tx, f.state.game.id)).toBeNull();
    const context = await resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12);
    expect(context.release).toBeNull(); expect(context.manifestSha256).toBeNull();
    expect(context.boards).toBe(localPatchBoardsForVersion(12));
    expect(context.boards[0]).toBe(localPatchBoardsForVersion(12)[0]);
    expect(sourcePlacementForHide(context, "greatwall-v12-2")).toBeNull();
    expect(sourcePlacementCanonical(localPatchBoardsForVersion(12))).toBe(before);
    expect(f.tx.auditLog.upsert).not.toHaveBeenCalled();
  });
  it("creates an immutable SYSTEM composite pin and preserves both original policy receipts", async () => {
    const f = database(); await basePins(f);
    const old = [...f.rows.values()].map(r => [r.id, r.metaJson]);
    await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const receipt = await sourcePlacementReleaseOf(f.tx, f.state.game.id);
    expect(receipt).toMatchObject({ manifestSha256: SOURCE_PLACEMENT_RELEASE_SHA256, baseSceneVersion: 12,
      coverage: [{ boardId: "greatwall", hideId: "greatwall-v12-2" }] });
    expect(receipt!.leanPinSha256).toBe(createHash("sha256").update(f.rows.get(leanReleaseAuditId(f.state.game.id))!.metaJson!).digest("hex"));
    for (const [id, json] of old) expect(f.rows.get(id!)!.metaJson).toBe(json);
    const count = f.rows.size; await pinSourcePlacementRelease(f.tx, f.state.game.id);
    expect(f.rows.size).toBe(count);
  });
  it.each(["production", "development"])("does not enroll %s", async appEnv => {
    const f = database(); await basePins(f); configuration.appEnv = appEnv;
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("qualified QA");
    expect(f.rows.has(sourcePlacementReleaseAuditId(f.state.game.id))).toBe(false);
  });
  it.each(["order", "job", "attempt"] as const)("refuses an existing %s", async field => {
    const f = database(); await basePins(f); f.state[field] = true;
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("prospective companion");
  });
  it.each(["PAID", "TARGETS_GENERATING", "READY", "DELIVERED"])("does not enroll a %s world", async status => {
    const f = database(); await basePins(f); f.state.game.status = status;
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("unstarted draft");
  });
  it("requires the exact base lean and dual pins", async () => {
    const f = database();
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("lean pin");
    await basePins(f);
    const original = f.rows.get(leanReleaseAuditId(f.state.game.id))!;
    original.metaJson = original.metaJson!.replace('"worldCapMicroUsd":4000000', '"worldCapMicroUsd":5000000');
    // Any actual drift in exact bytes is invalid regardless of the numeric policy constant.
    original.metaJson += " ";
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("Pinned lean release is invalid");
  });
  it.each(["manifestSha256", "leanPinSha256", "compositeQualificationSha256"] as const)("refuses changed %s with no legacy fallback", async field => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const row = f.rows.get(sourcePlacementReleaseAuditId(f.state.game.id))!;
    const receipt = JSON.parse(row.metaJson!); receipt[field] = "f".repeat(64); row.metaJson = sourcePlacementCanonical(receipt);
    await expect(resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12)).rejects.toThrow("differs");
  });
  it("refuses malformed, non-SYSTEM and foreign pins", async () => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const row = f.rows.get(sourcePlacementReleaseAuditId(f.state.game.id))!, original = { ...row };
    row.metaJson = "{";
    await expect(sourcePlacementReleaseOf(f.tx, f.state.game.id)).rejects.toThrow("encoding");
    Object.assign(row, original, { actorType: "USER" });
    await expect(sourcePlacementReleaseOf(f.tx, f.state.game.id)).rejects.toThrow("invalid companion");
    Object.assign(row, original, { entityId: "game_foreign" });
    await expect(sourcePlacementReleaseOf(f.tx, f.state.game.id)).rejects.toThrow("invalid companion");
  });
});

describe("runtime-authoritative effective placement context", () => {
  it("materializes54 hides, changes only the one effective envelope and claims only one coverage entry", async () => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const original = sourcePlacementCanonical(localPatchBoardsForVersion(12));
    const context = await resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12);
    expect(context.boards).not.toBe(localPatchBoardsForVersion(12));
    expect(context.boards).toHaveLength(18);
    expect(context.boards.flatMap(b => b.hides)).toHaveLength(54);
    const changed = context.boards.find(b => b.board === "greatwall")!.hides.find(h => h.id === "greatwall-v12-2")!;
    expect(changed.mask).toEqual({ left: 108, top: 208, width: 256, height: 350 });
    expect(changed.returnRect).toEqual({ left: 66, top: 136, width: 312, height: 632 });
    for (const board of context.boards) for (const hide of board.hides) {
      const base = localPatchBoardsForVersion(12).find(b => b.board === board.board)!.hides.find(h => h.id === hide.id)!;
      if (hide.id !== changed.id) expect(hide).toEqual(base);
      expect(hide.pose).toBe(base.pose); expect(hide.placement).toEqual(base.placement);
      expect(sourcePlacementForHide(context, hide.id)!.sourceNeighbors !== null).toBe(hide.id === changed.id);
    }
    expect(sourcePlacementCanonical(localPatchBoardsForVersion(12))).toBe(original);
    expect(Object.isFrozen(changed.mask)).toBe(true);
    expect(Object.isFrozen(localPatchBoardsForVersion(12)[0])).toBe(false);
  });
  it("rejects JSON clones, object spreads and fabricated trusted contexts", async () => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const context = await resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12);
    expect(() => assertTrustedSourcePlacementContext(context)).not.toThrow();
    expect(() => assertTrustedSourcePlacementContext({ ...context })).toThrow("untrusted");
    expect(() => assertTrustedSourcePlacementContext(JSON.parse(JSON.stringify(context)))).toThrow("untrusted");
    expect(() => assertTrustedSourcePlacementContext(null)).toThrow("untrusted");
  });
  it("does no DB work while looking up hide contracts from a loaded world context", async () => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    const context = await resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12);
    vi.mocked(f.tx.auditLog.findUnique).mockClear();
    for (const board of context.boards) for (const hide of board.hides) expect(sourcePlacementForHide(context, hide.id)).not.toBeNull();
    expect(f.tx.auditLog.findUnique).not.toHaveBeenCalled();
  });
  it("never resolves a pinned contract under another scene version", async () => {
    const f = database(); await basePins(f); await pinSourcePlacementRelease(f.tx, f.state.game.id);
    await expect(resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 11)).rejects.toThrow("another scene");
    const result = await resolveLocalPatchBoardForGame(f.tx, f.state.game.id, "greatwall", 12);
    expect(result.board!.board).toBe("greatwall");
  });
});
