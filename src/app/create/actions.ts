"use server";

import { creationDraftHref } from "@/domain/creation-draft";
import { LEGAL_VERSION } from "@/domain/legal";

import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { getCurrency } from "@/i18n/server";
import { createDraft, searchLevelTerms, selectPackage, selectWorlds } from "@/services/create-flow.service";
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
  let savedGameId: string | undefined;
  const requestedDraft = String(formData.get("draftGameId") ?? "") || undefined;
  const guarded = await guardDb(async () => {
  let [draft, user, locale, draftToken] = await Promise.all([
    formData.get("freshAdventure") === "1" ? null : currentDraft(requestedDraft, "creation"), currentUser(), getLocale(), draftTokenFromCookie(),
  ]);
  if (requestedDraft && !draft && formData.get("freshAdventure") !== "1") return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
  if (draft?.childProfileId && draft.familyChildId !== familyChildId) draft = null;
  // Three separate facts, all decided by the server before any draft or cookie:
  // whether this draft must answer (the server's terms, never the form), whether an
  // answer was sent, and whether that answer can be sold now. A sent Detectives
  // answer that cannot be sold is refused, never quietly dropped to Explorers; a
  // legacy form without the field keeps its legacy meaning.
  const terms = await searchLevelTerms(c, draft);
  const sent = typeof level === "string" && level !== "" ? level : null;
  let searchLevel: SearchLevel | undefined;
  if (sent !== null) {
    if (!isSearchLevel(sent)) return flowError("SEARCH_LEVEL_REQUIRED", "בחרו מגלים או בלשים.");
    if (sent === "detectives" && !terms.detectives) return flowError("SEARCH_LEVEL_UNAVAILABLE", "מסלול הבלשים עוד לא פתוח.");
    if (terms.allowedLevels && !terms.allowedLevels.includes(sent)) return flowError("SEARCH_LEVEL_UNAVAILABLE", "מסלול החיפוש אינו תואם לטיוטה הזאת.");
    searchLevel = sent;
  } else if (terms.asked) return flowError("SEARCH_LEVEL_REQUIRED", "בחרו מגלים או בלשים.");
  let token = draftToken;
  let gameId = draft?.id;
  if (!draft) {
    const created = await createDraft(c, user?.id ?? null, locale, { askSearchLevel: terms.asked, ...(searchLevel === undefined ? {} : { searchLevel }) });
    await setDraftCookie(created.draftToken);
    token = created.draftToken;
    gameId = created.gameId;
  }
    if (!gameId) return flowError("DRAFT_NOT_FOUND", "לא הצלחנו להתחיל טיוטה.");
    savedGameId = gameId;
    return chooseDraftChild(c.db, { gameId, actorId: user?.id ?? null, draftToken: token, familyChildId, name, ageYears, searchLevel });
  });
  if (!guarded.ok) return guarded;
  redirect(creationDraftHref("photo", savedGameId));
}

export async function choosePackageAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const tier = String(formData.get("tier") ?? "");
  let savedGameId: string | undefined;
  const res = await guardDb(async () => {
    const draft = await currentDraft(String(formData.get("draftGameId") ?? "") || undefined, "creation");
    if (!draft) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
    savedGameId = draft.id;
    return selectPackage(c, draft.id, tier);
  });
  if (!res.ok) return res;
  redirect(creationDraftHref("scenes", savedGameId));
}

export async function chooseScenesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const c = getContainer();
  const slugs = formData.getAll("scene").map(String);
  let savedGameId: string | undefined;
  const res = await guardDb(async () => {
    const draft = await currentDraft(String(formData.get("draftGameId") ?? "") || undefined, "creation");
    if (!draft) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
    savedGameId = draft.id;
    return selectWorlds(c, draft.id, slugs);
  });
  if (!res.ok) return res;
  redirect(creationDraftHref("checkout", savedGameId));
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
  const creationId = String(formData.get("draftGameId") ?? "") || undefined;
  if (gameId && creationId) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
  const draft = await currentDraft(gameId ?? creationId, creationId ? "creation" : "world-purchase");
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
