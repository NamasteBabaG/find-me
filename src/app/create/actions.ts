"use server";
import { LEGAL_VERSION } from "@/domain/legal";

import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { getCurrency } from "@/i18n/server";
import { createDraft, searchLevelQuestion, selectPackage, selectWorlds } from "@/services/create-flow.service";
import { startCheckout } from "@/services/order.service";
import { validChildAge } from "@/domain/child-appearance";
import { isSearchLevel, type SearchLevel } from "@/domain/search-level";
import { currentDraft } from "@/lib/server/current-draft";
import { currentUser, draftTokenFromCookie, setDraftCookie, requestHeaders } from "@/lib/server/session";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { getLocale } from "@/i18n/server";
import { flowError, type FlowResult } from "@/i18n/errors";
import { guardDb } from "@/lib/server/db-guard";
import { chooseDraftChild } from "@/services/family.service";
import { worldPurchaseDraftHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { purchasingClosed, purchasingEnabled } from "@/lib/purchasing";

export type ActionResult = FlowResult;

export async function saveNameAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const name = String(formData.get("name") ?? "");
  const ageYears = Number(formData.get("ageYears"));
  const familyChildId = String(formData.get("familyChildId") ?? "") || null;
  const level = formData.get("searchLevel");
  if (!validChildAge(ageYears)) return flowError("INVALID_CHILD_AGE", "בחרו את גיל הדמות במשחק, בין 2 ל־10.");
  const guarded = await guardDb(async () => {
  let [draft, user, locale, draftToken] = await Promise.all([
    formData.get("freshAdventure") === "1" ? null : currentDraft(), currentUser(), getLocale(), draftTokenFromCookie(),
  ]);
  if (draft?.childProfileId && draft.familyChildId !== familyChildId) draft = null;
  // The server decides whether the cards were asked, never the form: a level is
  // required exactly when they were, and checked before any draft is created.
  const choice = await searchLevelQuestion(c, draft);
  let searchLevel: SearchLevel | undefined;
  if (choice.shown) {
    if (!isSearchLevel(level)) return flowError("SEARCH_LEVEL_REQUIRED", "בחרו מגלים או בלשים.");
    if (level === "detectives" && !choice.detectives) return flowError("SEARCH_LEVEL_UNAVAILABLE", "מסלול הבלשים עוד לא פתוח.");
    searchLevel = level;
  }
  let token = draftToken;
  let gameId = draft?.id;
  if (!draft) {
    const created = await createDraft(c, user?.id ?? null, locale);
    await setDraftCookie(created.draftToken);
    token = created.draftToken;
    gameId = created.gameId;
  }
    if (!gameId) return flowError("DRAFT_NOT_FOUND", "לא הצלחנו להתחיל טיוטה.");
    return chooseDraftChild(c.db, { gameId, actorId: user?.id ?? null, draftToken: token, familyChildId, name, ageYears, searchLevel });
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
