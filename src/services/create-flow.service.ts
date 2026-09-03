import { newDraftToken, newId } from "@/lib/ids";
import { normalizeChildName } from "@/lib/copy";
import { PACKAGES, defaultSceneSelection, isPackageTier, purchasableTiers, type PackageTier } from "@/domain/package";
import { isEditableDraft } from "@/domain/order-state";
import type { CropBox } from "@/infra/generation/types";
import { pick, type Locale } from "@/i18n/config";
import { flowError, type FlowResult } from "@/i18n/errors";
import type { Container } from "./container";
import { checkPhoto, deleteAsset, storeAsset } from "./asset.service";
import { transitionGame, statusOf } from "./game-status";
import { activeScenes, activeSceneSlugs, sceneBySlug } from "./scene-catalog.service";
import { SYSTEM } from "./audit.service";

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
  const game = await c.db.game.create({ data: { id: newId("game"), draftToken, ownerId, status: "DRAFT", locale } });
  c.analytics.track("create_started", {});
  return { gameId: game.id, draftToken };
}

export async function setChildName(c: Container, gameId: string, rawName: string): Promise<FlowResult> {
  const name = normalizeChildName(rawName);
  if (name.length < 2) return flowError("NAME_TOO_SHORT", "כתבו שם של לפחות שתי אותיות.");
  const game = await loadDraft(c, gameId);
  if (!game || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");

  if (game.childProfile) {
    await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { displayName: name } });
  } else {
    const child = await c.db.childProfile.create({ data: { id: newId("chl"), ownerId: game.ownerId, displayName: name } });
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

  // Replace any previous photo (and drop a stale avatar — it must be regenerated).
  await deleteAsset(c, game.childProfile.originalPhotoAssetId);
  await deleteAsset(c, game.childProfile.avatarAssetId);

  const asset = await storeAsset(c, {
    ownerId: game.ownerId,
    type: "ORIGINAL_PHOTO",
    visibility: "PRIVATE",
    buffer: input.buffer,
    mimeType: check.mimeType,
    width: check.width,
    height: check.height,
  });
  await c.db.childProfile.update({
    where: { id: game.childProfile.id },
    data: { originalPhotoAssetId: asset.id, avatarAssetId: null, photoCropJson: input.crop ? JSON.stringify(input.crop) : null },
  });
  await c.db.game.update({ where: { id: gameId }, data: { lastError: null } });
  await transitionGame(c, gameId, "PHOTO_APPROVED", SYSTEM);
  c.analytics.track("photo_uploaded", {});
  c.analytics.track("photo_approved", {});
  return { ok: true };
}

export async function availablePackages(c: Container) {
  const active = await activeSceneSlugs(c);
  return purchasableTiers(active.length);
}

export async function selectPackage(c: Container, gameId: string, tierRaw: string): Promise<FlowResult> {
  if (!isPackageTier(tierRaw)) return flowError("UNKNOWN_PACKAGE", "חבילה לא מוכרת.");
  const tier: PackageTier = tierRaw;
  const game = await loadDraft(c, gameId);
  if (!game || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");
  const status = statusOf(game);
  if (status === "DRAFT" || status === "PHOTO_UPLOADED" || status === "PHOTO_REJECTED") return flowError("PHOTO_FIRST", "קודם צריך להעלות תמונה.");

  const active = await activeSceneSlugs(c);
  if (!purchasableTiers(active.length).some((p) => p.tier === tier)) return flowError("PACKAGE_UNAVAILABLE", "החבילה הזאת עדיין לא זמינה.");

  const selection = defaultSceneSelection(tier, active);
  await c.db.game.update({ where: { id: gameId }, data: { packageTier: tier, sceneCount: PACKAGES[tier].sceneCount } });
  await replaceScenes(c, gameId, selection);
  if (status !== "PACKAGE_SELECTED") await transitionGame(c, gameId, "PACKAGE_SELECTED", SYSTEM, { tier });
  c.analytics.track("package_selected", { packageTier: tier, sceneCount: PACKAGES[tier].sceneCount });
  return { ok: true };
}

export async function selectScenes(c: Container, gameId: string, slugs: string[]): Promise<FlowResult> {
  const game = await loadDraft(c, gameId);
  if (!game || !isEditableDraft(statusOf(game))) return flowError("DRAFT_LOCKED", "הטיוטה כבר לא ניתנת לעריכה.");
  if (!game.packageTier || !isPackageTier(game.packageTier)) return flowError("PICK_PACKAGE_FIRST", "קודם בוחרים חבילה.");
  const want = PACKAGES[game.packageTier].sceneCount;
  const unique = Array.from(new Set(slugs));
  if (unique.length !== want) return flowError("WRONG_SCENE_COUNT", `בחרו בדיוק ${want} עולמות.`, { want });
  const active = new Set(await activeSceneSlugs(c));
  if (!unique.every((s) => active.has(s))) return flowError("SCENE_UNAVAILABLE", "אחד העולמות אינו זמין.");
  await replaceScenes(c, gameId, unique);
  c.analytics.track("scenes_selected", { sceneCount: unique.length });
  return { ok: true };
}

async function replaceScenes(c: Container, gameId: string, slugs: string[]): Promise<void> {
  await c.db.gameScene.deleteMany({ where: { gameId } });
  await c.db.gameScene.createMany({
    data: slugs.map((slug, i) => ({ id: newId("gsc"), gameId, sceneSlug: slug, sceneVersion: sceneBySlug(slug).version, orderIndex: i })),
  });
}

export async function draftSummary(c: Container, gameId: string) {
  const game = await loadDraft(c, gameId);
  if (!game) return null;
  const scenes = await activeScenes(c);
  const chosen = game.scenes.map((gs) => scenes.find((s) => s.slug === gs.sceneSlug)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const pkg = game.packageTier && isPackageTier(game.packageTier) ? PACKAGES[game.packageTier] : null;
  return { game, child: game.childProfile, scenes: chosen, pkg };
}
