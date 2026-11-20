import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { leanReleaseAuditId, leanReleaseOf } from "./lean-release";
import type { BoardWizardBudgetCeiling } from "./board-wizard-budget";
import { kingdomCostPolicyOf } from "./kingdom-generation-release";

/**
 * world-cost-rule/v1 (Guy, 2026-11-20): the money rule of kingdom-generation/v7, for every NEW operational world that
 * is not a Kingdom Detectives world (new Explorers and new Journey Detectives): about $4 is the target and is never a
 * stop; above $5 the service is told once and the world keeps going; at $6 the world stops, the service is told at
 * once, and nothing is refunded automatically, so a person can try to save it.
 *
 * Chosen once, in the transaction that creates the draft, beside its operational pin. A world without this pin keeps
 * its four-dollar ceiling and its historical park. A Kingdom Detectives world takes its own kingdom-generation pin at
 * checkout, and that pin decides its money instead (worldCostPolicyOf): this one is then inert.
 */
export const WORLD_COST_RULE = "world-cost-rule/v1" as const;
export type WorldCostRule = typeof WORLD_COST_RULE;
export const WORLD_COST_RULE_ACTION = "generation:world-cost-rule/v1";
export const WORLD_COST_RULE_CEILING_MICRO_USD = 6_000_000;
export const WORLD_COST_RULE_ALERT_MICRO_USD = 5_000_000;
export const WORLD_COST_RULE_TARGET_MICRO_USD = 4_000_000;
export const worldCostRuleAuditId = (gameId: string) => "aud_world_cost_rule_" + gameId;

type Reader = Pick<Prisma.TransactionClient, "auditLog">;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function demand(ok: unknown, why: string): asserts ok { if (!ok) throw Error("WORLD_COST_RULE: " + why); }

async function expected(db: Reader, gameId: string) {
  const lean = await db.auditLog.findUnique({ where: { id: leanReleaseAuditId(gameId) } });
  demand(lean?.metaJson && await leanReleaseOf(db, gameId) !== null, "The original lean pin is required");
  return { version: WORLD_COST_RULE, gameId, worldId: gameId + ":board-wizard",
    targetMicroUsd: WORLD_COST_RULE_TARGET_MICRO_USD, alertAboveMicroUsd: WORLD_COST_RULE_ALERT_MICRO_USD,
    ceilingMicroUsd: WORLD_COST_RULE_CEILING_MICRO_USD, ceilingOutcome: "hold" as const,
    automaticBudgetExtension: false as const, includesUnknownReservations: true as const, leanPinSha256: sha(lean.metaJson) };
}
export type WorldCostRuleReceipt = Awaited<ReturnType<typeof expected>>;

/** Called ONLY in the transaction that creates a fresh operational draft, right after its operational pin. */
export async function pinWorldCostRule(tx: Prisma.TransactionClient, gameId: string, rule: WorldCostRule | undefined) {
  if (rule === undefined) return;
  demand(rule === WORLD_COST_RULE && env().APP_ENV === "qa", "Only the QA engine can select this rule");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  demand(game.status === "DRAFT" && game.styleVersion === "local-patch-world-v1" && !game.deletedAt && !game.paidAt && !game.readyAt && !game.configJson,
    "Only an unstarted local-patch draft may take the rule");
  demand(!await tx.order.findFirst({ where: { gameId } }) && !await tx.generationJob.findFirst({ where: { gameId } })
    && !await tx.worldBudgetLedger.findUnique({ where: { worldId: gameId + ":board-wizard" } })
    && !await tx.auditLog.findUnique({ where: { id: "aud_kingdom_generation_" + gameId } }), "Existing work cannot gain a new ceiling");
  await tx.auditLog.create({ data: { id: worldCostRuleAuditId(gameId), actorType: "SYSTEM", action: WORLD_COST_RULE_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(await expected(tx, gameId)) } });
}

/** The exact pinned rule, or null for a world without one. A pin that is not byte-for-byte this rule is refused. */
export async function worldCostRuleOf(db: Reader, gameId: string): Promise<WorldCostRuleReceipt | null> {
  const row = await db.auditLog.findUnique({ where: { id: worldCostRuleAuditId(gameId) } });
  if (!row) return null;
  const receipt = await expected(db, gameId);
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === WORLD_COST_RULE_ACTION && row.entityType === "Game"
    && row.entityId === gameId && row.metaJson === JSON.stringify(receipt), "Invalid or changed rule pin");
  return receipt;
}

/**
 * The money thresholds of one world, from whichever pin decides them: its kingdom-generation pin when it has one (v6
 * refund at $7, v7 hold at $6, null for every older pin, which keeps its historical park), otherwise this rule ($6 hold).
 * Null for every world with neither.
 */
export async function worldCostPolicyOf(db: Reader, gameId: string) {
  if (await db.auditLog.findUnique({ where: { id: "aud_kingdom_generation_" + gameId } })) return kingdomCostPolicyOf(db, gameId);
  const rule = await worldCostRuleOf(db, gameId);
  return rule ? { version: rule.version, ceilingMicroUsd: rule.ceilingMicroUsd, alertAboveMicroUsd: rule.alertAboveMicroUsd,
    targetMicroUsd: rule.targetMicroUsd, ceilingOutcome: rule.ceilingOutcome } : null;
}

/** The pinned hard ceiling ($7 for kingdom v6, $6 for kingdom v7 and this rule), or null: four dollars by default. */
export async function worldCeilingMicroUsdOf(db: Reader, gameId: string): Promise<number | null> {
  return (await worldCostPolicyOf(db, gameId))?.ceilingMicroUsd ?? null;
}

/** The world's ceiling from its own pin: six dollars, never a grant, QA only like the pin itself. */
export async function readWorldCostRuleBudget(c: { db: Reader }, worldId: string): Promise<BoardWizardBudgetCeiling | null> {
  const suffix = ":board-wizard";
  if (env().APP_ENV !== "qa" || !worldId.endsWith(suffix)) return null;
  const gameId = worldId.slice(0, -suffix.length);
  const rule = await worldCostRuleOf(c.db, gameId);
  // A Kingdom pin decides its own world (read before this, in readBoardWizardBudgetAuthority); never both.
  if (!rule || await c.db.auditLog.findUnique({ where: { id: "aud_kingdom_generation_" + gameId } })) return null;
  return { worldId, capMicroUsd: WORLD_COST_RULE_CEILING_MICRO_USD, authorizationSha256: sha(JSON.stringify(rule)) };
}
