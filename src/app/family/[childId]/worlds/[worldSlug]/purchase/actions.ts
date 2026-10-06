"use server";
import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentUser, setDraftCookie } from "@/lib/server/session";
import { getLocale } from "@/i18n/server";
import { getContainer } from "@/services/container";
import { beginWorldPurchase } from "@/services/world-purchase.service";
import { guardDb } from "@/lib/server/db-guard";
import { flowError, type FlowResult } from "@/i18n/errors";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { worldPurchaseHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { purchasingClosed, purchasingEnabled } from "@/lib/purchasing";

export async function continueWorldAction(childId: string, worldSlug: string, _previous: FlowResult | null, form: FormData): Promise<FlowResult> {
  await requireQaAccess();
  if (!purchasingEnabled()) return purchasingClosed();
  const user = await currentUser();
  const ageYears = Number(form.get("ageYears"));
  const returnGameId = String(form.get("returnGame") ?? "") || null;
  if (!user) redirect(worldPurchaseSignInHref(worldPurchaseHref(childId, worldSlug, returnGameId, ageYears)));
  if (!rateLimit(`world-purchase:${user.id}`, LIMITS.checkout.limit, LIMITS.checkout.windowMs).ok) return flowError("TOO_MANY_REQUESTS", "יותר מדי ניסיונות.");
  const locale = await getLocale();
  const result = await guardDb(() => beginWorldPurchase(getContainer(), { ownerId: user.id, familyChildId: childId, worldSlug,
    ageYears, locale, returnGameId }));
  if (!result.ok) return result;
  if (result.draftToken) await setDraftCookie(result.draftToken);
  redirect(result.href);
}
