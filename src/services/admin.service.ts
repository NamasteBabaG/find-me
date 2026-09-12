import { TargetAdjustSchema } from "@/domain/game/config";
import { isCurrency, type Currency } from "@/domain/package";
import { isAwaitingQa, isPlayable, type GameStatus } from "@/domain/order-state";
import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { persistGameConfig } from "./generation/scene-composer";
import { publishGame } from "./publish.service";
import { audit, type Actor } from "./audit.service";
import { deleteAsset, readAssetBuffer, storeAsset } from "./asset.service";
import { AVATAR_SIZE, avatarDisplayFromSheet, avatarFromSheet } from "@/infra/generation/avatar-cut";
import { sha256Bytes } from "./generation/fixed-sprite";
import { FixedWorldStageError, fixedStageAssert, isFixedWorldStyle, readFixedWorldStage } from "./generation/fixed-world-stage-record";
import { fixedWorldJsonSha256 } from "./generation/fixed-world-materializer";
import { auditWorldBudget } from "./generation/world-budget";
import { PrismaWorldBudgetStore } from "@/infra/db/prisma-world-budget-store";
import { boardWizardWorldId } from "./generation/board-conditioned-wizard";
import { rebindLocalPatchNotificationAvatar } from "./local-patch-notifications";

async function assertLegacyMutation(c: Container, gameId: string) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { styleVersion: true, childProfileId: true } });
  fixedStageAssert(!isFixedWorldStyle(game.styleVersion), "unsupported", "A fixed world cannot be changed by legacy generation or placement controls");
  return game;
}

async function assertNoFixedChildGames(c: Container, childProfileId: string) {
  const games = await c.db.game.findMany({ where: { childProfileId, deletedAt: null }, select: { styleVersion: true } });
  fixedStageAssert(!games.some(game => isFixedWorldStyle(game.styleVersion)), "unsupported", "This child is bound to a fixed world; its reviewed identity assets cannot be changed");
  return games;
}

export type AdminFilter = "new" | "pending_payment" | "generating" | "qa" | "needs_photo" | "ready" | "failed" | "refunded" | "all";

const FILTERS: Record<AdminFilter, GameStatus[] | null> = {
  new: ["PAID"],
  pending_payment: ["CHECKOUT_PENDING", "PAYMENT_FAILED"],
  generating: ["AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING"],
  qa: ["QA_PENDING", "MANUAL_REVIEW", "NEEDS_REGENERATION"],
  needs_photo: ["NEEDS_NEW_PHOTO"],
  ready: ["APPROVED", "READY", "DELIVERED"],
  failed: ["GENERATION_FAILED"],
  refunded: ["REFUNDED", "CANCELLED"],
  all: null,
};

export async function listOrdersForAdmin(c: Container, filter: AdminFilter) {
  const statuses = FILTERS[filter];
  const games = await c.db.game.findMany({
    where: { deletedAt: null, ...(statuses ? { status: { in: statuses } } : { NOT: { status: { in: ["DRAFT", "PHOTO_UPLOADED", "PHOTO_VALIDATING", "PHOTO_REJECTED", "PHOTO_APPROVED", "PACKAGE_SELECTED"] } } }) },
    include: { childProfile: true, owner: true, orders: { orderBy: { createdAt: "desc" }, take: 1 }, scenes: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return games.map((g) => ({
    gameId: g.id,
    orderId: g.orders[0]?.id ?? null,
    childName: g.childProfile?.displayName ?? "",
    email: g.owner?.email ?? "",
    status: statusOf(g),
    packageTier: g.packageTier,
    sceneCount: g.scenes.length,
    amountAgorot: g.orders[0]?.amountAgorot ?? 0,
    currency: g.orders[0]?.currency ?? "ILS",
    paymentStatus: g.orders[0]?.paymentStatus ?? "—",
    updatedAt: g.updatedAt,
    lastError: g.lastError,
  }));
}

export async function countsForAdmin(c: Container): Promise<Record<AdminFilter, number>> {
  const out = {} as Record<AdminFilter, number>;
  for (const key of Object.keys(FILTERS) as AdminFilter[]) {
    const statuses = FILTERS[key];
    out[key] = await c.db.game.count({ where: { deletedAt: null, ...(statuses ? { status: { in: statuses } } : { NOT: { status: { in: ["DRAFT", "PHOTO_UPLOADED", "PHOTO_VALIDATING", "PHOTO_REJECTED", "PHOTO_APPROVED", "PACKAGE_SELECTED"] } } }) } });
  }
  return out;
}

export async function orderDetailForAdmin(c: Container, gameId: string) {
  const game = await c.db.game.findUnique({
    where: { id: gameId },
    include: { childProfile: true, owner: true, orders: { orderBy: { createdAt: "desc" } }, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } }, jobs: { orderBy: { createdAt: "desc" }, take: 3 }, shareLinks: true },
  });
  if (!game) return null;
  const assets = await c.db.asset.findMany({ where: { id: { in: [game.childProfile?.avatarAssetId, game.childProfile?.identityAssetId, game.childProfile?.originalPhotoAssetId, ...game.scenes.flatMap((s) => s.targets.map((t) => t.spriteAssetId))].filter((x): x is string => Boolean(x)) } } });
  const activity = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" }, take: 40 });
  const [failedSpots, paintedSpots] = await Promise.all([failedSpotsForAdmin(c, gameId), paintedSpotsForAdmin(c, gameId)]);
  return { game, status: statusOf(game), costCents: await generationCostForDisplay(c, gameId),
    localPatchCost: game.styleVersion === "local-patch-world-v1" ? await localPatchCostForDisplay(c, gameId) : null,
    assets, activity, failedSpots, paintedSpots, awaitingQa: isAwaitingQa(statusOf(game)), playable: isPlayable(statusOf(game)) };
}

/**
 * Every hiding spot that was accepted, as the cut-out patch on its own.
 *
 * The checks that accept a patch look at its shape — about the right height,
 * taller than wide, solid, near the spot — and never at whether the thing
 * painted is the child. Over one nine-board game that let through a scooter with
 * nobody on it, a horse's head and a pair of legs, alongside twenty good ones.
 * Seen inside the scene each is easy to miss; seen as a row of cut-outs, a
 * horse's head takes a second to spot. Until something can judge identity rather
 * than shape, this row is the check.
 */
export async function paintedSpotsForAdmin(c: Container, gameId: string) {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { in: ["GENERATED", "APPROVED"] }, assetId: { not: null } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true, orderIndex: true } } } } },
    orderBy: [{ targetInstance: { gameScene: { orderIndex: "asc" } } }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    targetInstanceId: r.targetInstanceId,
    assetId: r.assetId as string,
    sceneSlug: r.targetInstance.gameScene.sceneSlug,
    targetId: r.targetInstance.targetId,
    variant: r.variant,
    attempts: r.attempts,
    judge: parseJudge(r.judgeJson),
    history: attemptsForAdmin(r.usageJson),
  }));
}

/** The row's last review: `ok`, `bad`, `unknown` (a reviewer could not decide), or null when nothing reviewed it. */
export function parseJudge(json: string | null): { verdict: string; reason: string; model?: string; version?: string; checks?: Record<string, string>; claimedVerdict?: string; faults?: { check: string; where: string }[] } | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { verdict?: unknown; reason?: unknown; model?: unknown; version?: unknown; checks?: unknown };
    if (raw.verdict && typeof raw.verdict === "object") {
      const nested = raw.verdict as Record<string, unknown>;
      if (typeof nested.verdict === "string") return {
        verdict: nested.verdict, reason: typeof nested.reason === "string" ? nested.reason : "",
        ...(typeof nested.claimedVerdict === "string" ? { claimedVerdict: nested.claimedVerdict } : {}),
        faults: Array.isArray(nested.faults) ? nested.faults.filter((fault): fault is { check: string; where: string } =>
          !!fault && typeof fault === "object" && typeof fault.check === "string" && typeof fault.where === "string") : [],
        checks: Object.fromEntries(Object.entries(nested).filter((entry): entry is [string, string] => !["verdict", "reason"].includes(entry[0]) && typeof entry[1] === "string")),
      };
    }
    if (typeof raw.verdict !== "string") return null;
    return {
      verdict: raw.verdict,
      reason: typeof raw.reason === "string" ? raw.reason : "",
      model: typeof raw.model === "string" ? raw.model : undefined,
      version: typeof raw.version === "string" ? raw.version : undefined,
      checks: raw.checks && typeof raw.checks === "object" ? (raw.checks as Record<string, string>) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * One attempt as the admin page shows it: what was painted, what pass two
 * answered, what was cut out, what the judge saw, and what each stage said.
 * Everything comes from the ledger in usageJson; an attempt written before
 * a field existed simply lacks it, and the page says so instead of guessing.
 */
export interface AdminAttempt {
  n: number;
  at: string;
  outcome: string;
  /** The stage that rejected it, or "accepted" / "held" / "pending". */
  stage: string;
  problem: string | null;
  cents: number;
  renderAssetId: string | null;
  matteAssetIds: string[];
  patchAssetId: string | null;
  compositeAssetId: string | null;
  /** What the judge was shown, in wire order: role, hash, and the private copy when one was kept. */
  judgeImages: Array<{ role: string; sha256: string; assetId: string | null }>;
  judge: { verdict: string; reason: string; model?: string; policy?: string; checks?: Record<string, string>; reviews?: Array<{ model?: string; verdict: string; reason: string }> } | null;
  hiddenFraction: number | null;
  unchanged: number | null;
}

export function attemptsForAdmin(usageJson: string | null | undefined): AdminAttempt[] {
  try {
    const raw = JSON.parse(usageJson ?? "{}") as { ledger?: { attempts?: unknown[] } };
    const attempts = Array.isArray(raw.ledger?.attempts) ? raw.ledger!.attempts! : [];
    return attempts.map((a, i) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : null);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
      const outcome = str(x.outcome) ?? "";
      const stage = str(x.failedAt) ?? (outcome === "accepted" ? "accepted" : outcome.startsWith("held") ? "judge-unknown" : outcome.startsWith("pending") ? "pending" : outcome.startsWith("rejected") ? "unrecorded" : outcome.startsWith("error") ? "error" : "unknown");
      const j = x.judgement as Record<string, unknown> | undefined;
      const judge = j && typeof j.verdict === "string"
        ? {
            verdict: j.verdict,
            reason: str(j.reason) ?? "",
            model: str(j.model) ?? undefined,
            policy: str(j.policy) ?? undefined,
            checks: j.checks && typeof j.checks === "object" ? (j.checks as Record<string, string>) : undefined,
            reviews: Array.isArray(j.reviews) ? (j.reviews as Array<Record<string, unknown>>).map((r) => ({ model: str(r.model) ?? undefined, verdict: str(r.verdict) ?? "?", reason: str(r.reason) ?? "" })) : undefined,
          }
        : null;
      return {
        n: i + 1,
        at: str(x.at) ?? "",
        outcome,
        stage,
        problem: str(x.problem) ?? str(x.renderProblem) ?? str(x.extractionProblem) ?? null,
        cents: (num(x.rollCents) ?? 0) + (num(x.matteCents) ?? 0) + (num(x.judgeCents) ?? 0),
        renderAssetId: str(x.evidenceAssetId),
        matteAssetIds: list(x.matteEvidenceAssetIds).length ? list(x.matteEvidenceAssetIds) : str(x.matteEvidenceAssetId) ? [str(x.matteEvidenceAssetId)!] : [],
        patchAssetId: str(x.patchAssetId),
        compositeAssetId: str(x.compositeAssetId),
        judgeImages: Array.isArray(x.judgeImages)
          ? (x.judgeImages as Array<Record<string, unknown>>).map((r) => ({ role: str(r?.role) ?? "unknown", sha256: str(r?.sha256) ?? "", assetId: str(r?.assetId) }))
          // Rows written on 8 September before the records existed carried two parallel
          // arrays whose indexes could disagree; their ids are shown without a role.
          : list(x.judgeImageAssetIds).map((id) => ({ role: "unknown", sha256: "", assetId: id })),
        judge,
        hiddenFraction: num(x.hiddenFraction),
        unchanged: num(x.unchanged),
      };
    });
  } catch {
    return [];
  }
}

/**
 * The hiding spots that did not come out, and the pictures that show why.
 *
 * A rejection reason ("painted 40px tall") says a roll was wrong; only the
 * render says how — an adult, a second child, a repainted crop, a child hidden
 * so well the rule could not see her. Before these were kept, the only way to
 * find out was to pay for another roll.
 */
export async function failedSpotsForAdmin(c: Container, gameId: string) {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { notIn: ["GENERATED", "APPROVED"] } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    targetInstanceId: r.targetInstanceId,
    sceneSlug: r.targetInstance.gameScene.sceneSlug,
    targetId: r.targetInstance.targetId,
    variant: r.variant,
    status: r.status,
    attempts: r.attempts,
    costCents: r.costCents,
    lastError: r.lastError,
    rejectedAssetIds: parseIds(r.rejectedAssetIdsJson),
    history: attemptsForAdmin(r.usageJson),
  }));
}

function parseIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * What a game cost to make, in USD cents.
 *
 * The hiding spots are the money, and they are not where this used to look: a
 * slot patch belongs to a TargetVariantAsset, so summing the assets hanging off
 * TargetInstance.spriteAssetId reported a real game as very nearly free. The
 * variant rows are also the only place a rejected roll is counted, and rejected
 * rolls are about half of what a game spends.
 *
 * Counted from the variant rows plus the identity sheet, never from both sides:
 * the asset created from a successful roll carries the same cents again.
 */
export async function generationCostCents(c: Container, gameId: string): Promise<number> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { styleVersion: true, ownerId: true, childProfileId: true } });
  if (game.styleVersion === "local-patch-world-v1") {
    const summary = await localPatchCostForDisplay(c, gameId);
    fixedStageAssert(summary && !summary.unresolved, "budget", "Local-patch accounting is unavailable or unresolved; it must not appear free");
    return summary.settledMicroUsd / 10_000;
  }
  if (isFixedWorldStyle(game.styleVersion)) {
    const job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
    const record = job ? readFixedWorldStage(job.stepsJson) : null;
    fixedStageAssert(record && record.state === "staged" && record.gameId === gameId && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId, "integrity", "Fixed-world cost requires its complete bound capsule");
    const budget = await new PrismaWorldBudgetStore(c.db).read(record.worldId);
    fixedStageAssert(budget && fixedWorldJsonSha256(budget.snapshot) === record.budgetSnapshotSha256, "budget", "Fixed-world cost ledger changed or is unavailable");
    const cost = auditWorldBudget(budget.snapshot);
    fixedStageAssert(!cost.held && cost.reservedMicroUsd === 0 && cost.pendingRequestKeys.length === 0, "budget", "Fixed-world cost is unresolved; it must not appear free");
    return cost.settledMicroUsd / 10_000;
  }
  const [variants, child] = await Promise.all([
    c.db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, select: { costCents: true } }),
    c.db.game.findUnique({ where: { id: gameId }, select: { childProfile: { select: { identityAssetId: true, avatarAssetId: true } }, scenes: { select: { targets: { select: { spriteAssetId: true, variants: { select: { id: true } } } } } } } }),
  ]);
  let cents = variants.reduce((n, v) => n + v.costCents, 0);
  // The identity sheet is drawn once and every spot is painted from it.
  const oneOff = [child?.childProfile?.identityAssetId, child?.childProfile?.avatarAssetId].filter((x): x is string => Boolean(x));
  // Targets drawn the old way (a whole sprite, no patch) still keep their cost on the asset.
  const legacy = (child?.scenes ?? []).flatMap((s) => s.targets.filter((t) => t.variants.length === 0).map((t) => t.spriteAssetId)).filter((x): x is string => Boolean(x));
  const ids = [...oneOff, ...legacy];
  if (ids.length > 0) {
    const assets = await c.db.asset.findMany({ where: { id: { in: ids } }, select: { costCents: true } });
    cents += assets.reduce((n, a) => n + a.costCents, 0);
  }
  return cents;
}

/** The world ledger includes renders, grouped/per-hide judges and identity reviews.
 * Variant/Asset cents are projections of the same bills and must not be added. */
export async function localPatchCostForDisplay(c: Container, gameId: string) {
  try {
    const ledger = await new PrismaWorldBudgetStore(c.db).read(boardWizardWorldId(gameId));
    if (!ledger) return null;
    const cost = auditWorldBudget(ledger.snapshot);
    return { settledMicroUsd: cost.settledMicroUsd, reservedMicroUsd: cost.reservedMicroUsd,
      unresolved: cost.held || cost.reservedMicroUsd > 0 || cost.pendingRequestKeys.length > 0,
      unknownCharges: cost.unknownRequestKeys.length, byScope: cost.byScope,
      estimated: ledger.snapshot.requests.some(request => request.state === "settled" && request.evidence.costBasis === "conservative-upper-estimate") };
  } catch { return null; }
}

/** Display-only: unavailable or held accounting is unknown, never zero/free. */
export async function generationCostForDisplay(c: Container, gameId: string): Promise<number | null> {
  try { return await generationCostCents(c, gameId); }
  catch { return null; }
}

export async function approveAndPublish(c: Container, gameId: string, actor: Actor) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { styleVersion: true, status: true } });
  if (game.styleVersion === "local-patch-world-v1" && game.status === "MANUAL_REVIEW") {
    const { approveLocalPatchAsIs } = await import("./generation/local-patch-human-approval");
    await approveLocalPatchAsIs(c, gameId, actor);
  }
  return publishGame(c, gameId, actor);
}

export async function markTargetForRegeneration(c: Container, targetInstanceId: string, actor: Actor): Promise<void> {
  const t = await c.db.targetInstance.findUniqueOrThrow({ where: { id: targetInstanceId }, include: { gameScene: true } });
  await assertLegacyMutation(c, t.gameScene.gameId);
  await c.db.targetInstance.update({ where: { id: t.id }, data: { status: "NEEDS_REGENERATION" } });
  // A spot that ran out of attempts is refused by the painter until someone with
  // a reason overrides it. Asking for it again IS that reason — without this the
  // button would look like it worked and quietly change nothing.
  await c.db.targetVariantAsset.updateMany({
    where: { targetInstanceId: t.id, status: { notIn: ["GENERATED", "APPROVED"] } },
    data: { attempts: 0, status: "PENDING" },
  });
  await c.db.gameScene.update({ where: { id: t.gameSceneId }, data: { generationStatus: "NEEDS_REGENERATION" } });
  const game = await c.db.game.findUniqueOrThrow({ where: { id: t.gameScene.gameId }, select: { status: true } });
  const s = statusOf(game);
  if (s !== "NEEDS_REGENERATION") await transitionGame(c, t.gameScene.gameId, "NEEDS_REGENERATION", actor, { targetInstanceId });
  await c.jobs.enqueue("generate-game", { gameId: t.gameScene.gameId });
}

export async function adjustTarget(c: Container, targetInstanceId: string, adjust: unknown, actor: Actor): Promise<void> {
  const parsed = TargetAdjustSchema.parse(adjust);
  const t = await c.db.targetInstance.findUniqueOrThrow({ where: { id: targetInstanceId }, include: { gameScene: true } });
  await assertLegacyMutation(c, t.gameScene.gameId);
  await c.db.targetInstance.update({ where: { id: t.id }, data: { adjustJson: JSON.stringify(parsed) } });
  await audit(c, actor, "target:adjusted", "TargetInstance", t.id, parsed);
  const game = await c.db.game.findUniqueOrThrow({ where: { id: t.gameScene.gameId } });
  if (game.configJson) await persistGameConfig(c, game.id);
}

/**
 * Repair only the display avatar, for free, from the existing identity sheet.
 * Local-patch games preserve the complete portrait quadrant (no face heuristic
 * or circular bitmap cut). Legacy collage games keep their historical crop.
 * The canonical private sheet, paid fingerprints and board pixels never change.
 */
export async function recutAvatar(c: Container, gameId: string, actor: Actor): Promise<{ ok: true } | { ok: false; code: "NO_SHEET" }> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  fixedStageAssert(!isFixedWorldStyle(game.styleVersion), "unsupported", "A fixed world's reviewed avatar cannot be recut");
  const child = game.childProfile;
  const siblings = child ? await assertNoFixedChildGames(c, child.id) : [];
  const fullFace = game.styleVersion === "local-patch-world-v1" || siblings.some(sibling => sibling.styleVersion === "local-patch-world-v1");
  if (!child?.identityAssetId) return { ok: false, code: "NO_SHEET" };
  const sheetAsset = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!sheetAsset || sheetAsset.status !== "READY") return { ok: false, code: "NO_SHEET" };
  if (fullFace) {
    fixedStageAssert(!game.deletedAt && !child.deletedAt && child.ownerId && game.ownerId === child.ownerId
      && game.childProfileId === child.id, "conflict", "A live game and its owned child are required for display repair");
    fixedStageAssert(sheetAsset.id === child.identityAssetId && sheetAsset.ownerId === child.ownerId
      && sheetAsset.type === "IDENTITY_SHEET" && sheetAsset.visibility === "PRIVATE" && !sheetAsset.deletedAt,
    "conflict", "The display source must be this child's live, private identity sheet");
    if (child.avatarAssetId) {
      const previousAsset = await c.db.asset.findUnique({ where: { id: child.avatarAssetId } });
      fixedStageAssert(previousAsset && previousAsset.ownerId === child.ownerId && previousAsset.type === "AVATAR"
        && previousAsset.visibility === "GAME", "conflict", "The previous display asset is not this child's avatar");
    }
  }
  const sheet = await readAssetBuffer(c, child.identityAssetId);
  const sourceSha256 = fullFace ? sha256Bytes(sheet) : null;
  const png = await (fullFace ? avatarDisplayFromSheet : avatarFromSheet)(sheet, Math.min(sheetAsset.width ?? 1024, sheetAsset.height ?? 1024));
  const asset = await storeAsset(c, { ownerId: child.ownerId, type: "AVATAR", visibility: "GAME", buffer: png, mimeType: "image/png", width: AVATAR_SIZE, height: AVATAR_SIZE, provider: sheetAsset.provider });
  const previous = child.avatarAssetId;
  try {
    await c.db.$transaction(async tx => {
      // The stager fences each Game row. Claim every sibling before changing
      // the shared child, so a concurrent stage either wins or sees this edit.
      const games = await tx.game.findMany({ where: { childProfileId: child.id, deletedAt: null }, select: { id: true, ownerId: true, styleVersion: true, updatedAt: true, configJson: true } });
      fixedStageAssert(!games.some(game => isFixedWorldStyle(game.styleVersion)), "unsupported", "This child became bound to a fixed world while the avatar was being cut");
      fixedStageAssert(fullFace || !games.some(game => game.styleVersion === "local-patch-world-v1"), "conflict", "This child now needs a full-face display repair");
      if (fullFace) {
        fixedStageAssert(games.some(sibling => sibling.id === gameId), "conflict", "The display game is no longer attached to this child");
        fixedStageAssert(games.every(sibling => sibling.ownerId === child.ownerId), "conflict", "A shared game is no longer owned by this child's owner");
        const source = await tx.asset.findUnique({ where: { id: child.identityAssetId! } });
        fixedStageAssert(source && source.ownerId === child.ownerId && source.status === "READY" && !source.deletedAt
          && source.type === "IDENTITY_SHEET" && source.visibility === "PRIVATE" && source.storagePath === sheetAsset.storagePath
          && source.width === sheetAsset.width && source.height === sheetAsset.height && source.bytes === sheetAsset.bytes,
        "conflict", "The source identity changed while the display avatar was being repaired");
        if (previous) {
          const old = await tx.asset.findUnique({ where: { id: previous } });
          fixedStageAssert(old && old.ownerId === child.ownerId && old.type === "AVATAR" && old.visibility === "GAME",
            "conflict", "The old display asset changed ownership during the repair");
        }
      }
      for (const game of games) {
        const claim = await tx.game.updateMany({ where: { id: game.id, childProfileId: child.id, deletedAt: null, styleVersion: game.styleVersion, updatedAt: game.updatedAt,
          ...(fullFace ? { ownerId: child.ownerId } : {}) }, data: { updatedAt: new Date() } });
        fixedStageAssert(claim.count === 1, "conflict", "A shared game changed while the avatar was being cut");
      }
      const changed = await tx.childProfile.updateMany({ where: { id: child.id, deletedAt: null, avatarAssetId: previous, identityAssetId: child.identityAssetId,
        ...(fullFace ? { ownerId: child.ownerId, ageYears: child.ageYears, originalPhotoAssetId: child.originalPhotoAssetId, photoCropJson: child.photoCropJson } : {}) }, data: { avatarAssetId: asset.id } });
      fixedStageAssert(changed.count === 1, "conflict", "The child's reviewed identity changed while the avatar was being cut");
      if (previous) for (const game of games) {
        if (game.configJson?.includes(`/api/assets/${previous}`)) {
          const nextConfig = game.configJson.replaceAll(`/api/assets/${previous}`, `/api/assets/${asset.id}`);
          if (fullFace && game.styleVersion === "local-patch-world-v1") fixedStageAssert(await rebindLocalPatchNotificationAvatar(tx,
            { gameId: game.id, previousConfig: game.configJson, nextConfig, previousAvatarId: previous, avatarId: asset.id }),
          "conflict", "A game-ready email is currently being delivered; retry this display repair after it finishes");
          await tx.game.update({ where: { id: game.id }, data: { configJson: nextConfig } });
        }
      }
    });
  } catch (error) {
    // Only our deliberate callback rejection proves no attachment committed.
    // A storage/transaction exception may be a lost COMMIT acknowledgement:
    // retain both assets rather than delete a possibly referenced new avatar.
    if (error instanceof FixedWorldStageError) await deleteAsset(c, asset.id).catch(() => console.warn("[avatar:recut] unattached avatar cleanup failed"));
    throw error;
  }
  if (previous) {
    await deleteAsset(c, previous);
  }
  await audit(c, actor, "avatar:recut", "ChildProfile", child.id, { assetId: asset.id, previous,
    ...(fullFace ? { displayVersion: "full-portrait-quadrant/v1", identityAssetId: child.identityAssetId, sourceSha256 } : {}) });
  return { ok: true };
}

export async function requestNewPhoto(c: Container, gameId: string, actor: Actor, note: string): Promise<void> {
  const game = await assertLegacyMutation(c, gameId);
  if (game.childProfileId) await assertNoFixedChildGames(c, game.childProfileId);
  await c.db.game.update({ where: { id: gameId }, data: { lastError: note || "נדרשת תמונה חדשה" } });
  await transitionGame(c, gameId, "NEEDS_NEW_PHOTO", actor, { note });
}

export async function retryGeneration(c: Container, gameId: string, actor: Actor): Promise<void> {
  await assertLegacyMutation(c, gameId);
  await audit(c, actor, "generation:retry", "Game", gameId);
  await c.jobs.enqueue("generate-game", { gameId });
}

/** Rough FX used only for the margin estimate on the cost dashboard (not for billing). */
const APPROX_ILS_PER_USD = 3.7;

export async function costDashboard(c: Container) {
  const games = await c.db.game.findMany({ where: { deletedAt: null, status: { in: ["READY", "DELIVERED", "QA_PENDING", "MANUAL_REVIEW", "APPROVED"] } }, include: { orders: true, childProfile: true, scenes: { include: { targets: true } } } });
  const rows = [];
  for (const g of games) {
    const generationCents = await generationCostForDisplay(c, g.id);
    const paid = g.orders.find((o) => o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED");
    const attempts = g.scenes.reduce((n, s) => n + s.targets.reduce((m, t) => m + t.attempts, 0), 0);
    const currency: Currency = paid && isCurrency(paid.currency) ? paid.currency : "ILS";
    const priceMinor = paid?.amountAgorot ?? 0;
    // Generation costs are tracked in USD cents; ILS revenue is converted with a rough rate so the margin column stays comparable.
    const priceUsdCents = currency === "USD" ? priceMinor : priceMinor / APPROX_ILS_PER_USD;
    rows.push({ gameId: g.id, childName: g.childProfile?.displayName ?? "", priceMinor, currency, generationCents, attempts, marginPct: generationCents !== null && paid && priceUsdCents > 0 ? Math.round(((priceUsdCents - generationCents) / priceUsdCents) * 100) : null });
  }
  return rows;
}
