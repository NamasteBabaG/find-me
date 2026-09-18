import { newDraftToken, newId } from "@/lib/ids";
import { normalizeChildName } from "@/lib/copy";
import { validChildAge } from "@/domain/child-appearance";
import { PACKAGES, isPackageTier, purchasableTiers, type PackageTier } from "@/domain/package";
import { isEditableDraft } from "@/domain/order-state";
import { boardSlugs } from "@/domain/world";
import type { CropBox } from "@/infra/generation/types";
import { pick, type Locale } from "@/i18n/config";
import { flowError, type FlowResult } from "@/i18n/errors";
import type { Container } from "./container";
import { checkPhoto, deleteAsset, storeAsset } from "./asset.service";
import { GameStatusConflict, transitionGame, statusOf } from "./game-status";
import { activeScenes, sceneBySlug } from "./scene-catalog.service";
import { boardsOfWorlds, purchasableWorlds } from "./world-catalog.service";
import { SYSTEM } from "./audit.service";
import { env } from "@/lib/env";
import { LOCAL_PATCH_STYLE } from "./generation/local-patch-world";
import { COLLECTION_SCENE_VERSION } from "../domain/scene/local-patch-catalog";

/**
 * The parent's creation flow, step by step. A "draft" is just a Game in
 * an editable status, owned by a cookie token until an email arrives.
 * Errors are returned as codes so the UI can speak the visitor's language.
 */

export type DraftGame = NonNullable<Awaited<ReturnType<typeof loadDraft>>>;

export async function loadDraft(c: Container, gameId: string) {
  return c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } });
}

export function draftBelongsTo(game: { draftToken: string | null; ownerId: string | null }, draftToken: string | null, userId: string | null): boolean {
  if (draftToken && game.draftToken === draftToken) return true;
  if (userId && game.ownerId === userId) return true;
  return false;
}

export function gameLocale(game: { locale: string }): Locale {
  return game.locale === "he" ? "he" : "en";
}

export async function createDraft(c: Container, ownerId: string | null, locale: Locale): Promise<{ gameId: string; draftToken: string }> {
  const draftToken = newDraftToken();
  // Pin the QA engine before the first generated preview. Existing games and
  // production drafts retain their own engine; no later flag can change this one.
  const game = await c.db.game.create({ data: { id: newId("game"), draftToken, ownerId, status: "DRAFT", locale,
    ...(env().APP_ENV === "qa" ? { styleVersion: LOCAL_PATCH_STYLE } : {}) } });
  c.analytics.track("create_started", {});
  return { gameId: game.id, draftToken };
}

export async function setChildName(c: Container, gameId: string, rawName: string, ageYears?: number): Promise<FlowResult> {
  const name = normalizeChildName(rawName);
  if (name.length < 2) return flowError("NAME_TOO_SHORT", "כתבו שם של לפחות שתי אותיות.");
  if (ageYears !== undefined && !validChildAge(ageYears)) return flowError("INVALID_CHILD_AGE", "בחרו את הגיל בתמונה, בין 2 ל־10.");
  const game = await loadDraft(c, gameId);
  if (!game || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");

  if (game.childProfile) {
    await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { displayName: name, ...(ageYears === undefined ? {} : { ageYears }) } });
  } else {
    const child = await c.db.childProfile.create({ data: { id: newId("chl"), ownerId: game.ownerId, displayName: name, ageYears } });
    await c.db.game.update({ where: { id: gameId }, data: { childProfileId: child.id } });
  }
  await c.db.game.update({ where: { id: gameId }, data: { title: pick({ en: `Where's ${name}?`, he: `איפה ${name}?` }, gameLocale(game)) } });
  return { ok: true };
}

export async function attachPhoto(c: Container, gameId: string, input: { buffer: Buffer; mimeType: string; crop: CropBox | null }): Promise<FlowResult> {
  const game = await loadDraft(c, gameId);
  if (!game || !game.childProfile) return flowError("NEED_NAME", "קודם צריך להכניס שם.");
  const status = statusOf(game);
  if (!isEditableDraft(status)) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");

  // Coming back from checkout: the state machine only allows a photo change from the package step,
  // so rewind first (the unpaid order simply stays pending and is reused at the next checkout).
  if (status === "PAYMENT_FAILED") await transitionGame(c, gameId, "CHECKOUT_PENDING", SYSTEM, { reason: "photo change" });
  if (status === "CHECKOUT_PENDING" || status === "PAYMENT_FAILED") await transitionGame(c, gameId, "PACKAGE_SELECTED", SYSTEM, { reason: "photo change" });
  await transitionGame(c, gameId, "PHOTO_UPLOADED", SYSTEM);
  await transitionGame(c, gameId, "PHOTO_VALIDATING", SYSTEM);
  const check = await checkPhoto(input.buffer, input.mimeType);
  if (!check.ok) {
    await c.db.game.update({ where: { id: gameId }, data: { lastError: `${check.code}: ${check.reason}` } });
    await transitionGame(c, gameId, "PHOTO_REJECTED", SYSTEM, { code: check.code });
    c.analytics.track("photo_rejected", { reason: check.code });
    return flowError(check.code, check.reason);
  }

  try {
    await swapChildPhoto(c, game.ownerId, game.childProfile, input, check);
  } catch (error) {
    // The storage was out, or the row would not take the new pointer. The
    // draft used to be left in PHOTO_VALIDATING — which is not an editable
    // state — so the parent's next attempt was answered DRAFT_LOCKED and a
    // passing outage became a dead draft. Hand the step back instead.
    await releaseValidatingDraft(c, gameId, error);
    return flowError("UPLOAD_FAILED", "לא הצלחנו לשמור את התמונה. אפשר לנסות שוב.");
  }
  await c.db.game.update({ where: { id: gameId }, data: { lastError: null } });
  await transitionGame(c, gameId, "PHOTO_APPROVED", SYSTEM);
  c.analytics.track("photo_uploaded", {});
  c.analytics.track("photo_approved", {});
  return { ok: true };
}

/**
 * Put the new photo in place, then drop what it replaced.
 *
 * The old way deleted the previous photo and avatar FIRST. A storage outage in
 * the middle then took the parent's existing photo with it and stored nothing
 * in its place: the child profile pointed at an asset whose bytes were gone.
 * Nothing is thrown away until the profile points at the replacement.
 */
type PhotoChild = { id: string; originalPhotoAssetId: string | null; avatarAssetId: string | null; identityAssetId: string | null };

async function swapChildPhoto(
  c: Container,
  ownerId: string | null,
  child: PhotoChild,
  input: { buffer: Buffer; crop: CropBox | null },
  check: { mimeType: string; width: number; height: number },
  dropIdentity = false,
): Promise<void> {
  const previous = [child.originalPhotoAssetId, child.avatarAssetId, ...(dropIdentity ? [child.identityAssetId] : [])];
  const asset = await storeAsset(c, {
    ownerId,
    type: "ORIGINAL_PHOTO",
    visibility: "PRIVATE",
    buffer: input.buffer,
    mimeType: check.mimeType,
    width: check.width,
    height: check.height,
  });
  await c.db.childProfile.update({
    where: { id: child.id },
    data: { originalPhotoAssetId: asset.id, avatarAssetId: null, ...(dropIdentity ? { identityAssetId: null } : {}), photoCropJson: input.crop ? JSON.stringify(input.crop) : null },
  });
  // Only now: nothing still points at these.
  for (const old of previous) await deleteAsset(c, old);
}

/**
 * A check that could not finish gives the step back to the parent.
 *
 * Fenced on purpose: if another request has already carried this draft out of
 * PHOTO_VALIDATING — a retry that succeeded, a delete — its state stands, and
 * this failure does not drag the draft backwards.
 */
async function releaseValidatingDraft(c: Container, gameId: string, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  try {
    const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } });
    if (statusOf(game) !== "PHOTO_VALIDATING") return;
    await c.db.game.update({ where: { id: gameId }, data: { lastError: `UPLOAD_FAILED: ${reason}`.slice(0, 500) } });
    await transitionGame(c, gameId, "PHOTO_REJECTED", SYSTEM, { code: "UPLOAD_FAILED" });
  } catch (release) {
    if (release instanceof GameStatusConflict) return;
    throw release;
  }
}

/** Offer only complete worlds supported by the draft's pinned rendering engine. */
export async function worldsForDraft(c: Container, styleVersion: string) {
  return purchasableWorlds(c, styleVersion === LOCAL_PATCH_STYLE ? COLLECTION_SCENE_VERSION : undefined);
}

export async function availablePackages(c: Container, styleVersion = env().APP_ENV === "qa" ? LOCAL_PATCH_STYLE : "") {
  const tiers = purchasableTiers((await worldsForDraft(c, styleVersion)).length);
  return env().APP_ENV === "qa" || styleVersion === LOCAL_PATCH_STYLE ? tiers.filter(p => p.tier === "ONE_WORLD") : tiers;
}

export async function selectPackage(c: Container, gameId: string, tierRaw: string): Promise<FlowResult> {
  if (!isPackageTier(tierRaw)) return flowError("UNKNOWN_PACKAGE", "חבילה לא מוכרת.");
  const tier: PackageTier = tierRaw;
  const game = await loadDraft(c, gameId);
  if (!game || game.deletedAt || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");
  const status = statusOf(game);
  if (game.styleVersion === LOCAL_PATCH_STYLE && tier !== "ONE_WORLD") return flowError("PACKAGE_UNAVAILABLE", "בגרסת QA זו זמין עולם אחד עם תשעה בורדים.");
  if (status === "DRAFT" || status === "PHOTO_UPLOADED" || status === "PHOTO_VALIDATING" || status === "PHOTO_REJECTED") return flowError("PHOTO_FIRST", "קודם צריך להעלות תמונה.");

  const worlds = await worldsForDraft(c, game.styleVersion);
  if (!purchasableTiers(worlds.length).some((p) => p.tier === tier)
    || (env().APP_ENV === "qa" && tier !== "ONE_WORLD")) return flowError("PACKAGE_UNAVAILABLE", "החבילה הזאת עדיין לא זמינה.");

  // Keep a deliberate choice when returning to this step. Fill only new slots;
  // catalog order is presentation, never an ownership or difficulty prerequisite.
  const held = new Set(game.scenes.map(s => s.sceneSlug));
  const chosen = worlds.filter(w => boardSlugs(w).every(slug => held.has(slug))).map(w => w.slug);
  const selection = [...chosen, ...worlds.map(w => w.slug).filter(slug => !chosen.includes(slug))].slice(0, PACKAGES[tier].worldCount);
  const boards = boardsOfWorlds(worlds.filter(w => selection.includes(w.slug)).map(w => w.slug));
  if (!await replaceDraftSelection(c, game, boards, tier)) return flowError("DRAFT_LOCKED", "הטיוטה השתנתה. רעננו ונסו שוב.");
  c.analytics.track("package_selected", { packageTier: tier, sceneCount: boards.length });
  return { ok: true };
}

/**
 * A new photo for a game that is already paid for.
 *
 * QA can send a game back with "needs a new photo"; the state existed, the
 * admin could set it, and the parent had no way to answer it — the creating
 * page said "preparing" while the system waited for them. This is the answer:
 * the photo is checked and stored the same way as at checkout, everything
 * drawn from the old one is dropped, and the game goes back to drawing on the
 * same order. Nothing is bought again.
 */
export async function replacePhotoForPaidGame(c: Container, gameId: string, input: { buffer: Buffer; mimeType: string; crop: CropBox | null }): Promise<FlowResult> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
  if (!game || !game.childProfile) return flowError("DRAFT_NOT_FOUND", "המשחק לא נמצא.");
  if (statusOf(game) !== "NEEDS_NEW_PHOTO") return flowError("DRAFT_LOCKED", "המשחק לא מחכה לתמונה חדשה.");
  const check = await checkPhoto(input.buffer, input.mimeType);
  if (!check.ok) {
    c.analytics.track("photo_rejected", { reason: check.code });
    return flowError(check.code, check.reason);
  }
  // Store, then point the profile at it, then drop the old sheet and avatar:
  // a storage outage here must not leave the paid game with no photo at all.
  await swapChildPhoto(c, game.ownerId, game.childProfile, input, check, true);
  await c.db.game.update({ where: { id: gameId }, data: { lastError: null } });
  // Back to drawing. AVATAR_GENERATING is resumable, so the next tick — the
  // creating page's or the cron's — picks the game up where it left off.
  await transitionGame(c, gameId, "AVATAR_GENERATING", SYSTEM, { reason: "new photo" });
  c.analytics.track("photo_uploaded", {});
  c.analytics.track("photo_approved", {});
  return { ok: true };
}

/** The parent picks WORLDS; each one brings its nine boards with it. */
export async function selectWorlds(c: Container, gameId: string, slugs: string[]): Promise<FlowResult> {
  const game = await loadDraft(c, gameId);
  if (!game || game.deletedAt || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");
  if (!game.packageTier || !isPackageTier(game.packageTier)) return flowError("PICK_PACKAGE_FIRST", "קודם בוחרים חבילה.");
  const want = PACKAGES[game.packageTier].worldCount;
  const unique = Array.from(new Set(slugs));
  if (unique.length !== want) return flowError("WRONG_SCENE_COUNT", `בחרו בדיוק ${want} עולמות.`, { want });
  const offered = await worldsForDraft(c, game.styleVersion);
  const available = new Set(offered.map((w) => w.slug));
  if (!unique.every((s) => available.has(s))) return flowError("SCENE_UNAVAILABLE", "אחד העולמות אינו זמין.");
  const boards = boardsOfWorlds(offered.filter(w => unique.includes(w.slug)).map(w => w.slug));
  if (!await replaceDraftSelection(c, game, boards)) return flowError("DRAFT_LOCKED", "הטיוטה השתנתה. רעננו ונסו שוב.");
  c.analytics.track("scenes_selected", { sceneCount: boards.length });
  return { ok: true };
}

/** Metadata, scene versions and status are one fenced write, never delete-then-hope. */
async function replaceDraftSelection(c: Container, game: DraftGame, slugs: string[], tier?: PackageTier): Promise<boolean> {
  const version = game.styleVersion === LOCAL_PATCH_STYLE ? COLLECTION_SCENE_VERSION : undefined;
  // Resolve every version before touching the existing selection.
  const data = slugs.map((slug, i) => ({ id: newId("gsc"), gameId: game.id, sceneSlug: slug, sceneVersion: sceneBySlug(slug, version).version, orderIndex: i }));
  try {
    return await c.db.$transaction(async tx => {
      const claimed = await tx.game.updateMany({ where: {
        id: game.id, status: game.status, updatedAt: game.updatedAt, deletedAt: null,
        ownerId: game.ownerId, draftToken: game.draftToken, childProfileId: game.childProfileId,
        familyChildId: game.familyChildId, styleVersion: game.styleVersion, packageTier: game.packageTier,
        orders: { none: { paymentStatus: { in: ["PAID", "REFUNDED"] } } },
      }, data: { sceneCount: data.length, ...(tier ? { packageTier: tier } : {}),
        updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } });
      if (claimed.count !== 1) return false;
      await tx.gameScene.deleteMany({ where: { gameId: game.id } });
      await tx.gameScene.createMany({ data });
      if (tier) {
        if (game.status === "PAYMENT_FAILED") await transitionGame(c, game.id, "CHECKOUT_PENDING", SYSTEM, { reason: "package change" }, tx);
        await transitionGame(c, game.id, "PACKAGE_SELECTED", SYSTEM, { tier }, tx);
      }
      return true;
    });
  } catch (error) {
    if (error instanceof GameStatusConflict) return false;
    throw error;
  }
}

export async function draftSummary(c: Container, gameId: string) {
  const game = await loadDraft(c, gameId);
  if (!game) return null;
  const scenes = await activeScenes(c);
  const chosen = game.scenes.map((gs) => scenes.find((s) => s.slug === gs.sceneSlug)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const pkg = game.packageTier && isPackageTier(game.packageTier) ? PACKAGES[game.packageTier] : null;
  return { game, child: game.childProfile, scenes: chosen, pkg };
}
