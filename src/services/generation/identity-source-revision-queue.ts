import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { GenerationPaused } from "./board-conditioned-wizard";
import { WorldBudgetError } from "./world-budget";
import { IdentitySourceRevisionFailure, advanceIdentitySourceRevision, isIdentityRevisionDatabaseTransient } from "./identity-source-revision";
import { IDENTITY_REVISION_START_ACTION, IDENTITY_REVISION_COMMIT_ACTION, identityRevisionPending, identityRevisionStartOf, identityRevisionHeldOf } from "./identity-source-revision-state";

export const IDENTITY_REVISION_RUN = "generation:identity-source-revision-run";
export const IDENTITY_REVISION_HELD = "generation:identity-source-revision-held";
export const identityRevisionHeldId = (gameId: string) => `aud_identity_revision_held_${gameId}`;
export const IDENTITY_REVISION_LEASE_MS = 6 * 60_000;
export const IDENTITY_REVISION_SPACING_MS = 60_000;

async function available(c: Container, gameId: string, now: number) {
  if (await identityRevisionHeldOf(c.db, gameId)) return false;
  const last = await c.db.auditLog.findFirst({ where: { action: IDENTITY_REVISION_RUN, entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" } });
  if (!last) return true;
  const end = await c.db.auditLog.findUnique({ where: { id: `${last.id}_end` } });
  const wait = end && JSON.parse(end.metaJson ?? "{}").state === "paused" ? 10 * 60_000 : IDENTITY_REVISION_SPACING_MS;
  return end ? now - end.createdAt.getTime() >= wait : now - last.createdAt.getTime() > IDENTITY_REVISION_LEASE_MS;
}

/** The normal scheduled/creating tick sees only explicitly authorized reference repairs. No provider or write. */
export async function nextIdentitySourceRevision(c: Container, gameId: string | null, now = Date.now()): Promise<string | null> {
  if (env().APP_ENV !== "qa") return null;
  if (gameId) return await identityRevisionPending(c.db, gameId) ? gameId : null;
  const starts = await c.db.auditLog.findMany({ where: { action: IDENTITY_REVISION_START_ACTION, entityType: "Game" }, select: { entityId: true }, orderBy: { createdAt: "asc" } });
  if (!starts.length) return null;
  const ended = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: { in: starts.map(s => s.entityId) }, action: IDENTITY_REVISION_COMMIT_ACTION }, select: { entityId: true } });
  const concluded = new Set(ended.map(e => e.entityId));
  for (const start of starts) {
    if (concluded.has(start.entityId) || !await available(c, start.entityId, now)) continue;
    const game = await c.db.game.findUnique({ where: { id: start.entityId }, select: { status: true, deletedAt: true, styleVersion: true } });
    if (game?.status === "TARGETS_GENERATING" && !game.deletedAt && game.styleVersion === "local-patch-world-v1"
      && await identityRevisionPending(c.db, start.entityId)) return start.entityId;
  }
  return null;
}

/** Game lock plus immutable run/end records give a reference repair its own lease without moving the job's bound hold. */
export async function tickIdentitySourceRevision(c: Container, gameId: string, deadlineAt: number, now = Date.now()) {
  if (!await identityRevisionPending(c.db, gameId)) return { pending: false, attention: null };
  const stopped = await identityRevisionHeldOf(c.db, gameId);
  if (stopped) return { pending: false, attention: "Reference repair is safely held; its retained diagnosis requires a service decision" };
  const runId = newId("aud");
  let claimed = false;
  try {
    claimed = await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId);
      if (!await identityRevisionPending(tx, gameId) || !await available({ ...c, db: tx as unknown as Container["db"] }, gameId, now)) return false;
      await tx.auditLog.create({ data: { id: runId, actorType: "SYSTEM", action: IDENTITY_REVISION_RUN, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ version: "identity-source-revision-queue/v1", leaseMs: IDENTITY_REVISION_LEASE_MS }) } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (e) {
    if (!isIdentityRevisionDatabaseTransient(e)) throw e;
  }
  if (!claimed) return { pending: true, attention: null };
  let state: string;
  try {
    const start = await identityRevisionStartOf(c.db, gameId);
    if (!start) throw Error("Reference authorization vanished");
    state = (await advanceIdentitySourceRevision(c, { gameId, operatorId: start.operatorId, deadlineAt })).state;
  } catch (error) {
    if (error instanceof GenerationPaused) {
      state = "paused";
    } else if (isIdentityRevisionDatabaseTransient(error)) {
      state = "deferred";
    } else {
      // Bounded service diagnosis only. Never persist provider text/credentials or keep polling an unchangeable failure.
      state = "held";
      await c.db.auditLog.create({ data: { id: `${identityRevisionHeldId(gameId)}_${runId}`, actorType: "SYSTEM", action: IDENTITY_REVISION_HELD, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ version: "identity-source-revision-queue/v1", runId,
          code: error instanceof IdentitySourceRevisionFailure ? error.code : error instanceof WorldBudgetError ? error.code : "reference-revision-safe-stop",
          reason: error instanceof IdentitySourceRevisionFailure ? error.message.slice(0, 700) : "Reference repair requires a service decision; all retained evidence stays protected" }) } });
      // Keep the original Job hold byte-for-byte: it is the immutable source fence for a safe service retry.
      // The current diagnosis is surfaced by this record and the admin/creating response.
    }
  }
  await c.db.auditLog.create({ data: { id: `${runId}_end`, actorType: "SYSTEM", action: `${IDENTITY_REVISION_RUN}-end`, entityType: "Game", entityId: gameId,
    metaJson: JSON.stringify({ version: "identity-source-revision-queue/v1", state }) } });
  return { pending: state !== "held", attention: state === "held" ? "Reference repair is safely held; historical accounting and the rejected world remain protected" : null };
}
