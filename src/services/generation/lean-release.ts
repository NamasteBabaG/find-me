import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { LEAN_BOARD_WIZARD_CAP_MICRO_USD, type BoardWizardBudgetCeiling } from "./board-wizard-budget";
import { leanReviewPolicy } from "../../domain/generation/visual-review-policy";
import { SUBJECT_PAINTER_V4, LEAN_WARM_HAT_VERSION } from "../../domain/generation/subject-painter";
import { SUBJECT_CHECKS_V2, SUBJECT_COLLECTION_VARIETY, SUBJECT_POLICY_V2 } from "../../domain/generation/subject-policy";
import { NEW_QA_WORLD_BUDGET_POLICY } from "../../domain/generation/qa-world-budget-policy";
import { LOCAL_PATCH_PAINTER_ACTION } from "./painter-release";
import { QUALITY_CHANNEL_ACTION } from "./quality-channel";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";
import { SYSTEM_ENROLLMENT_OPERATOR } from "./subject-enrollment";

/**
 * local-patch-lean/v1 (19 October 2026): the owner's cost and time release for NEW QA worlds,
 * chosen once, when the draft is created. A world without this pin keeps every contract it had.
 *
 * Its pilot world cost $8.92 and 17-20 minutes a picture: a LOW first painting was accepted 5
 * times in 27, every picture asked Opus twice through Message Batches and Sol once more, every
 * refusal bought a $0.07 diagnosis, and a third of the repaints were for variety or the hat.
 * The owner chose (19 October): MEDIUM from the first painting; Sol 6.1 as the only judge, on
 * Flex; the world's variety planned per appearance; the Antarctica hat as the E6a experiment
 * proved it; a child refused for who they are repainted with the judge's located reasons and no
 * paid diagnosis; and a world that aims under three dollars and can never spend more than four (the owner, 19 October:
 * a world a few cents over three must never stop or be blocked for them).
 *
 * What the pin decides, each where it is read:
 * - painting: no LOW pin, so every painting is MEDIUM (painter-release.ts is never pinned);
 * - the world enrolls itself in the subject policy before its first painting (lean-enrollment.ts);
 * - judges: Sol HIGH answers the quality question with its subject inspection, and the continuity
 *   question, both in the background on Flex (leanReviewPolicy), both asked together; a Flex create
 *   the provider refuses is asked once at the default tier;
 * - the painter is told the appearance's planned look (local-patch-subject-paint/v4) and the
 *   pushed-back winter hat (lean-warm-hat/v1);
 * - an appearance refused for who the child is gets a third painting instead of a paid diagnosis;
 * - the world's ceiling is four dollars (its target three), with no automatic extension.
 */
export const LOCAL_PATCH_LEAN_RELEASE = "local-patch-lean/v1" as const;
export type LocalPatchLeanRelease = typeof LOCAL_PATCH_LEAN_RELEASE;
export const LOCAL_PATCH_LEAN_ACTION = "generation:lean-release";
/** The owner's ceiling, 19 October 2026: "שים תקרה ל4 דולר.. שלא ניפול או שהיצירה של המשחק לא תעצר בגלל סנטים בודדים";`n * the target stays "זה לא יכול לעלות יותר משלוש דולר". */
export const LEAN_WORLD_CAP_MICRO_USD = LEAN_BOARD_WIZARD_CAP_MICRO_USD;
/** Who enrolls a lean world in the subject policy: the release itself, never a person. */
export const LEAN_ENROLLMENT_OPERATOR = SYSTEM_ENROLLMENT_OPERATOR;
export const leanReleaseAuditId = (gameId: string) => `aud_lean_release_${gameId}`;
const QUALIFIED_PROMPT_RELEASE = "v19";
/** The exact pin a lean draft carries. */
export const leanReleaseReceipt = (gameId: string) => ({ version: LOCAL_PATCH_LEAN_RELEASE, gameId,
  qualifiedWith: { promptRelease: QUALIFIED_PROMPT_RELEASE, visualReviewRelease: DUAL_VISUAL_REVIEW_V3 },
  painter: "medium", subjectEnrollment: LEAN_ENROLLMENT_OPERATOR,
  judges: { quality: leanReviewPolicy("scene-quality", "flex").version, continuity: leanReviewPolicy("head-continuity", "flex").version, fallbackTier: "default" },
  painterDirection: SUBJECT_PAINTER_V4, warmHat: LEAN_WARM_HAT_VERSION, subjectRepair: "third-painting-without-diagnosis/v1",
  worldCapMicroUsd: LEAN_WORLD_CAP_MICRO_USD, automaticBudgetExtension: false });

/** The configuration the lean release is qualified in. Anything else is refused, not downgraded. */
export function leanReleaseQualified(input: { appEnv: string | undefined; promptRelease: string | undefined; reviewRelease: string | null | undefined }) {
  return input.appEnv === "qa" && input.promptRelease === QUALIFIED_PROMPT_RELEASE && input.reviewRelease === DUAL_VISUAL_REVIEW_V3;
}

/**
 * Called ONLY in the transaction that creates a fresh local-patch draft, after its review pin
 * and instead of the LOW painter, Message Batches and six-dollar pins. Nothing to pin when no
 * release is chosen. A chosen release outside its qualified configuration fails the draft.
 */
export async function pinLeanRelease(tx: Prisma.TransactionClient, gameId: string, release: LocalPatchLeanRelease | undefined) {
  if (release === undefined) return;
  if (release !== LOCAL_PATCH_LEAN_RELEASE) throw Error("Unsupported lean release");
  if (!leanReleaseQualified({ appEnv: env().APP_ENV, promptRelease: env().LOCAL_PATCH_PROMPT_RELEASE, reviewRelease: await dualVisualReviewVersion(tx, gameId) }))
    throw Error("The lean release is qualified only on QA with prompt release v19 and dual review v3");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== "DRAFT" || game.styleVersion !== "local-patch-world-v1" || game.deletedAt || game.readyAt || game.configJson || game.paidAt
    || await tx.order.findFirst({ where: { gameId } }) || await tx.generationJob.findFirst({ where: { gameId } })
    || await tx.auditLog.findFirst({ where: { entityType: "Game", entityId: gameId,
      action: { in: [LOCAL_PATCH_PAINTER_ACTION, QUALITY_CHANNEL_ACTION, NEW_QA_WORLD_BUDGET_POLICY] } } }))
    throw Error("Only an unstarted new local-patch draft without another painter, channel or budget pin may receive the lean release");
  await tx.auditLog.create({ data: { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", action: LOCAL_PATCH_LEAN_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanReleaseReceipt(gameId)) } });
}

/** The exact pinned release, or null for a world without one. A pin that is not
 * byte-for-byte this release is refused, never treated as the nearest one. */
export async function leanReleaseOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<LocalPatchLeanRelease | null> {
  const row = await db.auditLog.findUnique({ where: { id: leanReleaseAuditId(gameId) } });
  if (!row) return null;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== LOCAL_PATCH_LEAN_ACTION || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(leanReleaseReceipt(gameId))) throw Error("Pinned lean release is invalid; refusing a fallback");
  return LOCAL_PATCH_LEAN_RELEASE;
}
export const isLeanWorld = async (db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string) => (await leanReleaseOf(db, gameId)) !== null;

/**
 * Whether an appearance's last review refused it only for who the child is: its quality answer passed (a subject
 * reading is decided only after one does) and its local-patch-subject/v2 reading, about these same pixels, named
 * a check of the child or the collection's variety. Such a refusal is repainted with the reviewer's located
 * reasons; a diagnosis can add nothing a painter is not already told (local-patch-lean/v1).
 */
export function leanSubjectOnlyRefusal(judgeJson: string | null): boolean {
  try {
    const receipt = JSON.parse(judgeJson ?? "null"), dual = receipt?.boardReview?.dual, subject = dual?.subject;
    const codes: unknown = subject?.failedChecks;
    return receipt?.reviewState === "board-review-complete" && typeof receipt.judgedSha256 === "string" && dual?.imageSha256 === receipt.judgedSha256
      && subject?.subjectPolicy === SUBJECT_POLICY_V2 && Array.isArray(codes) && codes.length > 0
      && codes.every(code => (SUBJECT_CHECKS_V2 as readonly unknown[]).includes(code) || code === SUBJECT_COLLECTION_VARIETY);
  } catch { return false; }
}

/**
 * A lean world's commercial ceiling: four dollars, read from its own pin and nothing else. It never RAISES the
 * board-wizard ceiling (four dollars by default), so it needs no payment or lifecycle condition: a ceiling no
 * higher than the default is never an authorization to spend. It comes first, so no six-dollar policy or
 * five-dollar automatic extension can apply to a lean world (each also refuses one: local-patch-budget-recovery.ts).
 */
export async function readLeanWorldBudget(c: { db: Pick<Prisma.TransactionClient, "auditLog"> }, worldId: string): Promise<BoardWizardBudgetCeiling | null> {
  if (env().APP_ENV !== "qa" || !worldId.endsWith(":board-wizard")) return null;
  const gameId = worldId.slice(0, -":board-wizard".length);
  if (!await isLeanWorld(c.db, gameId)) return null;
  return { worldId, capMicroUsd: LEAN_WORLD_CAP_MICRO_USD, authorizationSha256: createHash("sha256").update(JSON.stringify(leanReleaseReceipt(gameId))).digest("hex") };
}
