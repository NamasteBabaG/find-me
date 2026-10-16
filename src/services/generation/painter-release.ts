import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { LOCAL_PATCH_LOW_IMAGE_POLICY, localPatchRenderPolicySha256 } from "../../infra/generation/openai-local-patch";
import type { FixedSourcePolicy } from "../../infra/generation/openai-fixed-source";
import { INTEGRATED_COLLECTION_VERSION } from "../../domain/scene/local-patch-versions";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";

/**
 * The quality a game's hides are painted at, chosen once, when its draft is
 * created.
 *
 * Quality is part of every paid painting's identity (`localPatchRenderPolicySha256`
 * is in each render's fingerprint), so it can never be a setting that a running
 * game re-reads: a game that resumed under a different quality would no longer
 * recognise what it had already bought. A game without a pin keeps the quality
 * its content version always had - MEDIUM for v12 - exactly as before this file.
 *
 * `low-v1` is today's v12 request at low quality (`LOCAL_PATCH_LOW_IMAGE_POLICY`),
 * nothing else: same model, size, background, rate card, reservation and judges.
 * It painted the first LOW world (27 of 27 hides accepted by Opus and Sol on
 * 15 October 2026) and E6a's three Antarctica hides, both with prompt release
 * v19 and dual review v3, so it is pinned only together with them.
 */
export const LOCAL_PATCH_LOW_PAINTER = "local-patch-painter/low-v1" as const;
export type LocalPatchPainterRelease = typeof LOCAL_PATCH_LOW_PAINTER;
export const LOCAL_PATCH_PAINTER_ACTION = "generation:painter-release";
export const localPatchPainterAuditId = (gameId: string) => `aud_painter_release_${gameId}`;
const QUALIFIED_PROMPT_RELEASE = "v19";
const receiptOf = (gameId: string) => ({ version: LOCAL_PATCH_LOW_PAINTER, gameId, contentVersion: INTEGRATED_COLLECTION_VERSION,
  quality: "low", renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY),
  qualifiedWith: { promptRelease: QUALIFIED_PROMPT_RELEASE, visualReviewRelease: DUAL_VISUAL_REVIEW_V3 } });

/** The configuration `low-v1` was qualified in. Anything else is refused, not downgraded. */
export function lowPainterQualified(input: { appEnv: string | undefined; promptRelease: string | undefined; reviewRelease: string | null | undefined }) {
  return input.appEnv === "qa" && input.promptRelease === QUALIFIED_PROMPT_RELEASE && input.reviewRelease === DUAL_VISUAL_REVIEW_V3;
}

/**
 * Called ONLY in the transaction that creates a fresh local-patch draft, after
 * its review pin. Nothing to pin when no release is chosen: the game keeps its
 * content version's own quality. A chosen release outside its qualified
 * configuration fails the draft rather than painting it some other way.
 */
export async function pinLocalPatchPainter(tx: Prisma.TransactionClient, gameId: string, release: LocalPatchPainterRelease | undefined) {
  if (release === undefined) return;
  if (release !== LOCAL_PATCH_LOW_PAINTER) throw Error("Unsupported painter release");
  const reviewRelease = await dualVisualReviewVersion(tx, gameId);
  if (!lowPainterQualified({ appEnv: env().APP_ENV, promptRelease: env().LOCAL_PATCH_PROMPT_RELEASE, reviewRelease }))
    throw Error("The LOW painter is qualified only on QA with prompt release v19 and dual review v3");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== "DRAFT" || game.styleVersion !== "local-patch-world-v1" || game.deletedAt || game.readyAt || game.configJson || game.paidAt
    || await tx.order.findFirst({ where: { gameId } })
    || await tx.generationJob.findFirst({ where: { gameId } })) throw Error("Only an unstarted new local-patch draft may receive a painter release");
  await tx.auditLog.create({ data: { id: localPatchPainterAuditId(gameId), actorType: "SYSTEM", action: LOCAL_PATCH_PAINTER_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receiptOf(gameId)) } });
}

/** The exact pinned release, or null for a game without one. A pin that is not
 * byte-for-byte a known release is refused, never treated as the nearest one. */
export async function localPatchPainterRelease(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<LocalPatchPainterRelease | null> {
  const row = await db.auditLog.findUnique({ where: { id: localPatchPainterAuditId(gameId) } });
  if (!row) return null;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== LOCAL_PATCH_PAINTER_ACTION || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(receiptOf(gameId))) throw Error("Pinned painter release is invalid; refusing a fallback");
  return LOCAL_PATCH_LOW_PAINTER;
}

/** What a pinned release buys for a content version. Only v12 was qualified; any
 * other version is refused, never painted at a quality nobody tested. */
export function painterReleasePolicy(release: LocalPatchPainterRelease, contentVersion: number | undefined): FixedSourcePolicy {
  if (release !== LOCAL_PATCH_LOW_PAINTER || contentVersion !== INTEGRATED_COLLECTION_VERSION)
    throw Error(`${release} paints content version ${INTEGRATED_COLLECTION_VERSION} only, not ${contentVersion}; refusing a fallback`);
  return LOCAL_PATCH_LOW_IMAGE_POLICY;
}
