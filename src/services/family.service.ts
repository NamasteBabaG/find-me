import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { GAME_STATUSES, isEditableDraft, type GameStatus } from "@/domain/order-state";
import { validChildAge } from "@/domain/child-appearance";
import { normalizeChildName } from "@/lib/copy";
import { newId } from "@/lib/ids";
import { flowError, type FlowResult } from "@/i18n/errors";

export async function listFamilyChildren(db: PrismaClient, ownerId: string) {
  if (!ownerId) return [];
  await reconcilePaidFamilyChildren(db, ownerId);
  return db.familyChild.findMany({
    where: { ownerId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true },
  });
}

/** Unpaid work remains resumable, without creating a phantom child/passport. */
export async function familyDrafts(db: PrismaClient, ownerId: string) {
  if (!ownerId) return [];
  return db.game.findMany({
    where: { ownerId, deletedAt: null, status: { in: GAME_STATUSES.filter(isEditableDraft) }, orders: { none: { paymentStatus: "PAID" } } },
    orderBy: { updatedAt: "desc" }, select: { id: true, title: true },
  });
}

export async function familyDraftToResume(db: PrismaClient, ownerId: string, gameId: string) {
  if (!ownerId) return null;
  return db.game.findFirst({ where: { id: gameId, ownerId, deletedAt: null, status: { in: GAME_STATUSES.filter(isEditableDraft) }, orders: { none: { paymentStatus: "PAID" } } }, select: { draftToken: true } });
}

/** Only this child's purchases, not the parent's pooled world entitlements. */
export async function familyOverview(db: PrismaClient, ownerId: string, childId?: string) {
  if (!ownerId) return [];
  await reconcilePaidFamilyChildren(db, ownerId);
  return db.familyChild.findMany({
    where: { ownerId, deletedAt: null, ...(childId ? { id: childId } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true, games: {
      where: { ownerId, deletedAt: null, status: { notIn: ["CANCELLED", "DELETED", "REFUNDED"] }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, title: true, status: true, childProfile: { select: { avatarAssetId: true } } },
    } },
  });
}

class ChildSelectionConflict extends Error {}

/** A repeatable, owner-fenced repair for pre-passport purchases or an interrupted
 * post-payment binding. Never merge siblings using a name/photo. The SQL rollout
 * uses this same per-game identifier. MD5 here is an ID, not a secret or proof. */
export async function reconcilePaidFamilyChildren(db: PrismaClient, ownerId: string, gameId?: string) {
  if (!ownerId) return;
  const games = await db.game.findMany({ where: { ownerId, familyChildId: null, deletedAt: null,
    ...(gameId ? { id: gameId } : {}), status: { notIn: ["CANCELLED", "REFUNDED", "DELETED"] },
    orders: { some: { userId: ownerId, paymentStatus: "PAID" } } }, select: { id: true } });
  for (const game of games) {
    await db.$transaction(async tx => {
      const current = await tx.game.findFirst({ where: { id: game.id, ownerId, familyChildId: null, deletedAt: null,
        status: { notIn: ["CANCELLED", "REFUNDED", "DELETED"] }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } }, include: { childProfile: true } });
      if (!current?.childProfile || current.childProfile.ownerId !== ownerId || current.childProfile.deletedAt) return;
      const id = `fam_${createHash("md5").update(`passport-family:${game.id}`).digest("hex").slice(0, 20)}`;
      await tx.familyChild.upsert({ where: { id }, create: { id, ownerId, displayName: current.childProfile.displayName }, update: {} });
      const linked = await tx.game.updateMany({ where: { id: game.id, ownerId, familyChildId: null, deletedAt: null, updatedAt: current.updatedAt }, data: { familyChildId: id } });
      if (linked.count !== 1) throw new ChildSelectionConflict();
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

/** Session identity, not the draft cookie, authorizes attaching a family child. */
export async function chooseDraftChild(db: PrismaClient, input: {
  gameId: string; actorId: string | null; draftToken: string | null;
  familyChildId: string | null; name: string; ageYears: number;
}): Promise<FlowResult> {
  if (!validChildAge(input.ageYears)) return flowError("INVALID_CHILD_AGE", "בחרו את הגיל בתמונה, בין 2 ל־10.");
  try {
    return await db.$transaction(async tx => {
      const game = await tx.game.findUnique({ where: { id: input.gameId } });
      if (!game || game.deletedAt || !isEditableDraft(game.status as GameStatus)
        || !(input.draftToken && input.draftToken === game.draftToken || input.actorId && input.actorId === game.ownerId)) {
        return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
      }
      const selected = input.familyChildId && input.actorId
        ? await tx.familyChild.findFirst({ where: { id: input.familyChildId, ownerId: input.actorId, deletedAt: null } }) : null;
      if (input.familyChildId && (!selected || game.ownerId !== input.actorId)) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
      // A different child's photo may already be attached. The action must start
      // a fresh draft, never relabel that photo or an existing rendering input.
      if (game.childProfileId && game.familyChildId !== input.familyChildId) return flowError("DRAFT_LOCKED", "צריך להתחיל הרפתקה חדשה לילד אחר.");
      const name = selected?.displayName ?? normalizeChildName(input.name);
      if (name.length < 2) return flowError("NAME_TOO_SHORT", "כתבו שם של לפחות שתי אותיות.");
      const childId = game.childProfileId ?? newId("chl");
      const changed = await tx.game.updateMany({
        where: { id: game.id, status: game.status, ownerId: game.ownerId, draftToken: game.draftToken,
          childProfileId: game.childProfileId, familyChildId: game.familyChildId, updatedAt: game.updatedAt, deletedAt: null },
        data: { familyChildId: selected?.id ?? null, title: game.locale === "he" ? `איפה ${name}?` : `Where's ${name}?` },
      });
      if (changed.count !== 1) throw new ChildSelectionConflict();
      if (game.childProfileId) {
        if (await tx.game.count({ where: { childProfileId: childId, NOT: { id: game.id } } }) !== 0) throw new ChildSelectionConflict();
        const updated = await tx.childProfile.updateMany({ where: { id: childId, ownerId: game.ownerId, deletedAt: null }, data: { displayName: name, ageYears: input.ageYears } });
        if (updated.count !== 1) throw new ChildSelectionConflict();
      } else {
        await tx.childProfile.create({ data: { id: childId, ownerId: game.ownerId, displayName: name, ageYears: input.ageYears } });
        await tx.game.update({ where: { id: game.id }, data: { childProfileId: childId } });
      }
      return { ok: true } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ChildSelectionConflict || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return flowError("DRAFT_LOCKED", "הטיוטה השתנתה. נסו שוב.");
    }
    throw error;
  }
}

/** Called inside checkout's existing Game -> Child -> Asset transaction. */
export async function bindCheckoutFamilyChild(tx: Prisma.TransactionClient, input: {
  gameId: string; familyChildId: string | null; ownerId: string; displayName: string;
}) {
  if (input.familyChildId) {
    const child = await tx.familyChild.findFirst({ where: { id: input.familyChildId, ownerId: input.ownerId, deletedAt: null } });
    if (!child) return false;
    // Conditional write serializes deletion with checkout; no profile transfer.
    return (await tx.familyChild.updateMany({ where: { id: child.id, ownerId: input.ownerId, deletedAt: null }, data: { displayName: child.displayName } })).count === 1;
  }
  const child = await tx.familyChild.create({ data: { id: newId("fam"), ownerId: input.ownerId, displayName: input.displayName } });
  const assigned = await tx.game.updateMany({ where: { id: input.gameId, ownerId: input.ownerId, familyChildId: null, deletedAt: null }, data: { familyChildId: child.id } });
  if (assigned.count !== 1) throw new ChildSelectionConflict();
  return true;
}
