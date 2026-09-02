"use server";

import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { createDraft, draftBelongsTo, loadDraft, selectPackage, selectScenes, setChildName } from "@/services/create-flow.service";
import { startCheckout } from "@/services/order.service";
import { isEditableDraft } from "@/domain/order-state";
import { statusOf } from "@/services/game-status";
import { currentUser, draftTokenFromCookie, setDraftCookie } from "@/lib/server/session";

export type ActionResult = { ok: true } | { ok: false; reason: string };

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
  let draft = await currentDraft();
  if (!draft) {
    const user = await currentUser();
    const created = await createDraft(c, user?.id ?? null);
    await setDraftCookie(created.draftToken);
    draft = await loadDraft(c, created.gameId);
  }
  if (!draft) return { ok: false, reason: "לא הצלחנו להתחיל טיוטה. נסו שוב." };
  const res = await setChildName(c, draft.id, name);
  if (!res.ok) return res;
  redirect("/create/photo");
}

export async function choosePackageAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const c = getContainer();
  const draft = await currentDraft();
  if (!draft) redirect("/create");
  const res = await selectPackage(c, draft.id, String(formData.get("tier") ?? ""));
  if (!res.ok) return res;
  redirect("/create/scenes");
}

export async function chooseScenesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const c = getContainer();
  const draft = await currentDraft();
  if (!draft) redirect("/create");
  const slugs = formData.getAll("scene").map(String);
  const res = await selectScenes(c, draft.id, slugs);
  if (!res.ok) return res;
  redirect("/checkout");
}

export async function checkoutAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const c = getContainer();
  const draft = await currentDraft();
  if (!draft) redirect("/create");
  const email = String(formData.get("email") ?? "");
  const res = await startCheckout(c, { gameId: draft.id, email });
  if (!res.ok) return res;
  redirect(res.checkoutUrl);
}
