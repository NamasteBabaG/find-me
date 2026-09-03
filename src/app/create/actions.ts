"use server";

import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { getCurrency } from "@/i18n/server";
import { createDraft, draftBelongsTo, loadDraft, selectPackage, selectWorlds, setChildName } from "@/services/create-flow.service";
import { startCheckout } from "@/services/order.service";
import { isEditableDraft } from "@/domain/order-state";
import { statusOf } from "@/services/game-status";
import { currentUser, draftTokenFromCookie, setDraftCookie } from "@/lib/server/session";
import { getLocale } from "@/i18n/server";
import { flowError, type FlowResult } from "@/i18n/errors";
import { guardDb } from "@/lib/server/db-guard";

export type ActionResult = FlowResult;

/** The draft this browser is working on (by cookie), if it is still editable. */
export async function currentDraft() {
  const c = getContainer();
  const token = await draftTokenFromCookie();
  if (!token) return null;
  const game = await c.db.game.findUnique({ where: { draftToken: token } });
  if (!game || !isEditableDraft(statusOf(game))) return null;
  const user = await currentUser();
  if (!draftBelongsTo(game, token, user?.id ?? null)) return null;
  return loadDraft(c, game.id);
}

export async function saveNameAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const c = getContainer();
  const name = String(formData.get("name") ?? "");
  const guarded = await guardDb(async () => {
  let draft = await currentDraft();
  if (!draft) {
    const [user, locale] = await Promise.all([currentUser(), getLocale()]);
    const created = await createDraft(c, user?.id ?? null, locale);
    await setDraftCookie(created.draftToken);
    draft = await loadDraft(c, created.gameId);
  }
    if (!draft) return flowError("DRAFT_NOT_FOUND", "לא הצלחנו להתחיל טיוטה.");
    return setChildName(c, draft.id, name);
  });
  if (!guarded.ok) return guarded;
  redirect("/create/photo");
}

export async function choosePackageAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
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
  const c = getContainer();
  const draft = await currentDraft();
  if (!draft) redirect("/create");
  const email = String(formData.get("email") ?? "");
  const currency = await getCurrency();
  const res = await guardDb(() => startCheckout(c, { gameId: draft.id, email, currency }));
  if (!res.ok) return res;
  redirect(res.checkoutUrl);
}
