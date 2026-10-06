"use server";
import { LEGAL_VERSION } from "@/domain/legal";

import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { getCurrency } from "@/i18n/server";
import { createDraft, draftBelongsTo, selectPackage, selectWorlds } from "@/services/create-flow.service";
import { startCheckout } from "@/services/order.service";
import { isEditableDraft } from "@/domain/order-state";
import { validChildAge } from "@/domain/child-appearance";
import { statusOf } from "@/services/game-status";
import { currentUser, draftTokenFromCookie, setDraftCookie, requestHeaders } from "@/lib/server/session";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { getLocale } from "@/i18n/server";
import { flowError, type FlowResult } from "@/i18n/errors";
import { guardDb } from "@/lib/server/db-guard";
import { chooseDraftChild } from "@/services/family.service";
import { worldPurchaseDraftHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { purchasingClosed, purchasingEnabled } from "@/lib/purchasing";

export type ActionResult = FlowResult;

/** The draft this browser is working on (by cookie), if it is still editable. */
export async function currentDraft(explicitGameId?: string) {
  await requireQaAccess();
  const c = getContainer();
  const token = await draftTokenFromCookie();
  if (!token && !explicitGameId) return null;
  const [game, user] = await Promise.all([
    c.db.game.findUnique({ where: explicitGameId ? { id: explicitGameId } : { draftToken: token! }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } }),
    currentUser(),
  ]);
  if (!game || !isEditableDraft(statusOf(game))) return null;
  if (game.deletedAt || explicitGameId && (!user || game.ownerId !== user.id || !await c.db.childWorldPurchase.findFirst({ where: { activeGameId: game.id, ownerId: user.id, familyChildId: game.familyChildId ?? "" } }))) return null;
  if (!draftBelongsTo(game, token, user?.id ?? null)) return null;
  return game;
}

export async function saveNameAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const name = String(formData.get("name") ?? "");
  const ageYears = Number(formData.get("ageYears"));
  const familyChildId = String(formData.get("familyChildId") ?? "") || null;
  if (!validChildAge(ageYears)) return flowError("INVALID_CHILD_AGE", "בחרו את גיל הדמות במשחק, בין 2 ל־10.");
  const guarded = await guardDb(async () => {
  let [draft, user, locale, draftToken] = await Promise.all([
    formData.get("freshAdventure") === "1" ? null : currentDraft(), currentUser(), getLocale(), draftTokenFromCookie(),
  ]);
  if (draft?.childProfileId && draft.familyChildId !== familyChildId) draft = null;
  let token = draftToken;
  let gameId = draft?.id;
  if (!draft) {
    const created = await createDraft(c, user?.id ?? null, locale);
    await setDraftCookie(created.draftToken);
    token = created.draftToken;
    gameId = created.gameId;
  }
    if (!gameId) return flowError("DRAFT_NOT_FOUND", "לא הצלחנו להתחיל טיוטה.");
    return chooseDraftChild(c.db, { gameId, actorId: user?.id ?? null, draftToken: token, familyChildId, name, ageYears });
  });
  if (!guarded.ok) return guarded;
  redirect("/create/photo");
}

export async function choosePackageAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const tier = String(formData.get("tier") ?? "");
  const res = await guardDb(async () => {
    const draft = await currentDraft();
    if (!draft) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
    return selectPackage(c, draft.id, tier);
  });
  if (!res.ok) return res;
  redirect("/create/scenes");
}

export async function chooseScenesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const slugs = formData.getAll("scene").map(String);
  const res = await guardDb(async () => {
    const draft = await currentDraft();
    if (!draft) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
    return selectWorlds(c, draft.id, slugs);
  });
  if (!res.ok) return res;
  redirect("/checkout");
}

export async function checkoutAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const h = await requestHeaders();
  const ip = h["x-forwarded-for"]?.split(",")[0]?.trim() || h["x-real-ip"] || "unknown";
  if (!rateLimit(`checkout:${ip}`, LIMITS.checkout.limit, LIMITS.checkout.windowMs).ok) {
    return flowError("TOO_MANY_REQUESTS", "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.");
  }
  const c = getContainer();
  const gameId = String(formData.get("gameId") ?? "") || undefined;
  const user = await currentUser();
  if (gameId && !user) redirect(worldPurchaseSignInHref(worldPurchaseDraftHref(gameId, "checkout")));
  const draft = await currentDraft(gameId);
  if (!draft) redirect("/create");
  if (!rateLimit(`checkout-draft:${draft.id}`, LIMITS.checkout.limit, LIMITS.checkout.windowMs).ok) {
    return flowError("TOO_MANY_REQUESTS", "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.");
  }
  if (formData.get("legalAccepted") !== "1" || formData.get("legalVersion") !== LEGAL_VERSION) {
    return flowError("TERMS_REQUIRED", "יש לאשר את תנאי השימוש ומדיניות הביטול לפני התשלום.");
  }
  const email = String(formData.get("email") ?? "");
  const currency = await getCurrency();
  const draftToken = await draftTokenFromCookie();
  const res = await guardDb(() => startCheckout(c, { gameId: draft.id, email, currency, access: { draftToken, userId: user?.id ?? null }, legalVersion: LEGAL_VERSION }));
  if (!res.ok) return res;
  redirect(res.checkoutUrl);
}
