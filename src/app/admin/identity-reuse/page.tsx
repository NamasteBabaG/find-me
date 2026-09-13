import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server/session";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { createCanonicalIdentityReuse, CANONICAL_IDENTITY_AGE_CONFIRMATION } from "@/services/generation/local-patch-identity-reuse";

export const runtime = "nodejs";
export const maxDuration = 60;

async function copyIdentity(data: FormData) {
  "use server";
  const actor = await currentAdmin(), h = await headers();
  const origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  if (!actor || env().APP_ENV !== "qa" || !origin || !host || new URL(origin).host !== host || h.get("sec-fetch-site") === "cross-site") throw new Error("Unauthorized QA identity copy");
  const result = await createCanonicalIdentityReuse(getContainer(), {
    sourceGameId: String(data.get("sourceGameId") ?? ""), sourceIdentityAssetId: String(data.get("sourceIdentityAssetId") ?? ""),
    requestId: String(data.get("requestId") ?? ""), displayName: String(data.get("displayName") ?? ""), confirmedAgeYears: Number(data.get("confirmedAgeYears")), confirmation: String(data.get("confirmation") ?? ""),
  }, { type: "ADMIN", id: actor.id });
  redirect(result.checkoutUrl);
}

/** Creates only a pending sandbox checkout. Payment remains a separate action. */
export default async function IdentityReusePage({ searchParams }: { searchParams: Promise<{ sourceGameId?: string; identityAssetId?: string }> }) {
  if (!await currentAdmin() || env().APP_ENV !== "qa") notFound();
  const params = await searchParams;
  const source = params.sourceGameId ? await getContainer().db.game.findUnique({ where: { id: params.sourceGameId }, select: { childProfile: { select: { ageYears: true } } } }) : null;
  return <section className="fm-stack fm-stack--2" dir="rtl">
    <h1>משחק QA חדש מהאיור הקיים</h1>
    <p>מעתיקים את גיליון הזהות המקורי בדיוק. המשחק הישן אינו משתנה, ולא נוצרת תמונת ילד נוספת.</p>
    <p>הגיל השמור במקור: {source?.childProfile?.ageYears ?? "לא נבחר מקור"}. חובה להזין את הגיל הנכון, ולא להעתיק גיל שגוי. שינוי גיל דורש בדיקה חדשה; אישור ישן לא יוסב לגיל אחר.</p>
    <p>המשחק החדש: 9 לוחות, 45 מחבואים, גרסה 9 עם בדיקות זהות, גיל ותפר. תקרת יצירה כוללת: $4, לרבות בדיקת גיל חדשה. האיור המקורי הוא מקור לפנים ולשיער בלבד, לא לגיל הגוף. יצירת המחבואים תתחיל רק אחרי אישור התשלום המדומה ובדיקת הגיל.</p>
    <form action={copyIdentity} className="fm-stack fm-stack--2">
      <label>מזהה משחק המקור<input name="sourceGameId" required defaultValue={params.sourceGameId ?? ""} /></label>
      <label>מזהה גיליון הזהות המקורי<input name="sourceIdentityAssetId" required defaultValue={params.identityAssetId ?? ""} /></label>
      <label>שם הילד במשחק החדש<input name="displayName" required minLength={2} maxLength={60} defaultValue="עומר" /></label>
      <label>גיל הילד הנכון — אישור מפורש<input name="confirmedAgeYears" type="number" required min={2} max={10} step={1} /></label>
      <input type="hidden" name="requestId" value={`admin-reuse-${randomUUID()}`} />
      <label><input type="checkbox" name="confirmation" value={CANONICAL_IDENTITY_AGE_CONFIRMATION} required /> אני מאשר את הפנים והשיער מהאיור הזה ואת הגיל שהזנתי, עם בדיקת גיל חדשה ובלי להסתמך על גיל הגוף בגיליון הישן. המשחק המקורי לא ישתנה.</label>
      <button type="submit" className="fm-btn">יצירת הזמנת QA חדשה והמשך לתשלום מדומה</button>
    </form>
  </section>;
}
