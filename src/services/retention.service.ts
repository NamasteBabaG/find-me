import { isEditableDraft } from "@/domain/order-state";
import type { Container } from "./container";
import { deleteAsset } from "./asset.service";
import { statusOf, transitionGame } from "./game-status";
import { SYSTEM, audit } from "./audit.service";

/**
 * How long each kind of thing lives, and what happens when it has lived too long.
 *
 * The original photograph is deleted after QA approves the game (unless the
 * parent asked to keep it) and when the game is deleted. That left three ways
 * for a child's photo to stay: a draft nobody came back to, a game QA sent
 * back for a new photo that never came, and the renders QA rejected, kept so
 * a failing spot can be looked at. Each now has a clock. The identity sheet
 * lives as long as its game, because a regeneration is drawn from it; it goes
 * with the game.
 *
 * Days, in one place, so the policy can be read and the test can shorten it.
 */
export const RETENTION_DAYS = {
  /** A draft with a photo and no payment: the parent never came back. */
  abandonedDraft: 7,
  /** QA asked for a different photo and none came: the one on file was not usable anyway. */
  unansweredNewPhoto: 30,
  /** A render QA threw out. Kept to diagnose a failing spot, then gone. */
  rejectedRender: 14,
  /** A generation the cron kept failing to resume: a person looks. */
  stuckFailure: 7,
} as const;

export interface RetentionReport {
  draftsPurged: number;
  newPhotoPurged: number;
  rejectedPurged: number;
  stuckToReview: number;
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/** Runs the whole policy once. Every step is idempotent; nothing here touches a paid, healthy game. */
export type RetentionDays = { [K in keyof typeof RETENTION_DAYS]: number };

export async function runRetention(c: Container, now = new Date(), days: RetentionDays = RETENTION_DAYS): Promise<RetentionReport> {
  const report: RetentionReport = { draftsPurged: 0, newPhotoPurged: 0, rejectedPurged: 0, stuckToReview: 0 };

  // 1. Abandoned drafts: editable, untouched, never paid. The photo goes and the draft closes.
  const drafts = await c.db.game.findMany({
    where: { deletedAt: null, updatedAt: { lt: daysAgo(now, days.abandonedDraft) }, orders: { none: { paymentStatus: "PAID" } } },
    include: { childProfile: true },
  });
  for (const game of drafts) {
    if (!isEditableDraft(statusOf(game))) continue;
    if (game.childProfile) {
      await deleteAsset(c, game.childProfile.originalPhotoAssetId);
      await deleteAsset(c, game.childProfile.avatarAssetId);
      await deleteAsset(c, game.childProfile.identityAssetId);
      await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { originalPhotoAssetId: null, avatarAssetId: null, identityAssetId: null, photoCropJson: null } });
    }
    await transitionGame(c, game.id, "CANCELLED", SYSTEM, { reason: "abandoned draft", after: `${days.abandonedDraft}d` });
    await audit(c, SYSTEM, "retention:draft-purged", "Game", game.id);
    report.draftsPurged++;
  }

  // 2. A new photo was asked for and never came. The one on file was not usable; it goes. The game stays where a person can see it.
  const waiting = await c.db.game.findMany({
    where: { status: "NEEDS_NEW_PHOTO", deletedAt: null, updatedAt: { lt: daysAgo(now, days.unansweredNewPhoto) } },
    include: { childProfile: true },
  });
  for (const game of waiting) {
    if (!game.childProfile?.originalPhotoAssetId) continue;
    await deleteAsset(c, game.childProfile.originalPhotoAssetId);
    await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { originalPhotoAssetId: null, photoCropJson: null } });
    await audit(c, SYSTEM, "retention:photo-purged", "Game", game.id, { reason: "no new photo came", after: `${days.unansweredNewPhoto}d` });
    report.newPhotoPurged++;
  }

  // 3. Rejected renders past their diagnostic life, and the ids that pointed at them.
  const rejected = await c.db.asset.findMany({ where: { type: "REJECTED_PATCH", status: "READY", createdAt: { lt: daysAgo(now, days.rejectedRender) } }, select: { id: true } });
  if (rejected.length > 0) {
    const gone = new Set(rejected.map((a) => a.id));
    for (const id of gone) await deleteAsset(c, id);
    const rows = await c.db.targetVariantAsset.findMany({ where: { rejectedAssetIdsJson: { not: null } }, select: { id: true, rejectedAssetIdsJson: true } });
    for (const row of rows) {
      let ids: string[] = [];
      try {
        ids = JSON.parse(row.rejectedAssetIdsJson ?? "[]") as string[];
      } catch {
        ids = [];
      }
      const kept = ids.filter((id) => !gone.has(id));
      if (kept.length !== ids.length) await c.db.targetVariantAsset.update({ where: { id: row.id }, data: { rejectedAssetIdsJson: kept.length > 0 ? JSON.stringify(kept) : null } });
    }
    report.rejectedPurged = gone.size;
  }

  // 4. A failure the cron has been retrying for a week is not going to fix itself.
  const stuck = await c.db.game.findMany({ where: { status: "GENERATION_FAILED", deletedAt: null, updatedAt: { lt: daysAgo(now, days.stuckFailure) } }, select: { id: true } });
  for (const game of stuck) {
    await transitionGame(c, game.id, "MANUAL_REVIEW", SYSTEM, { reason: "generation kept failing", after: `${days.stuckFailure}d` });
    report.stuckToReview++;
  }

  await audit(c, SYSTEM, "retention:run", "System", "retention", { ...report });
  return report;
}

/** The cron ticks every five minutes; the policy needs to run about once an hour. */
export async function runRetentionIfDue(c: Container, now = new Date()): Promise<RetentionReport | null> {
  const recent = await c.db.auditLog.findFirst({ where: { action: "retention:run", createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } }, select: { id: true } });
  if (recent) return null;
  return runRetention(c, now);
}
