import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, SESSION_COOKIE } from "@/lib/server/session";
import { hashToken, hmacSign, safeEqual } from "@/lib/ids";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { requestMagicLink } from "@/services/auth.service";
import { managePassportShare, passportSharePreview } from "@/services/passport-share.service";
import { PassportAccessError } from "@/services/passport.service";

const Body = z.object({ childId: z.string().regex(/^fam_[a-z0-9]{20}$/), operation: z.enum(["status", "preview", "reauth", "enable", "rotate", "revoke"]), locale: z.enum(["he", "en"]), consent: z.boolean().optional(), previewToken: z.string().max(100).optional() }).strict();
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ ok: false }, { status: 403, headers });
  const limit = rateLimit(callerKey(req, "passport-share"), 30, 60_000); if (!limit.ok) return tooManyRequests(limit);
  const user = await currentUser(); if (!user) return NextResponse.json({ ok: false }, { status: 401, headers });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400, headers });
  const c = getContainer(), { childId, operation, locale } = parsed.data;
  try {
    if (!await c.db.familyChild.count({ where: { id: childId, ownerId: user.id, deletedAt: null } })) throw new PassportAccessError();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = token ? await c.db.session.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
    const fresh = Boolean(session && session.userId === user.id && session.expiresAt.getTime() > Date.now() && Date.now() - session.createdAt.getTime() <= 10 * 60_000);
    if (operation === "reauth") {
      const emailLimit = rateLimit(`passport-parent:${user.id}`, 3, 15 * 60_000); if (!emailLimit.ok) return tooManyRequests(emailLimit);
      const result = await requestMagicLink(c, user.email, `/family/${childId}/passport?share=1`, locale);
      return NextResponse.json(result, { headers });
    }
    if (!fresh && operation !== "revoke") return NextResponse.json({ ok: true, needsAdult: true }, { headers });
    const alias = locale === "he" ? "ההרפתקן הקטן" : "Little explorer";
    const proof = (time: string) => hmacSign(`passport-preview:${user.id}:${session?.id}:${childId}:${locale}:${time}`, c.secret);
    if (operation === "preview") {
      const time = String(Date.now());
      return NextResponse.json({ ok: true, previewToken: `${time}.${proof(time)}`, book: await passportSharePreview(c, user.id, childId, alias) }, { headers });
    }
    if (operation === "enable" || operation === "rotate") {
      const [time, signature] = (parsed.data.previewToken ?? "").split(".");
      if (!parsed.data.consent || !time || !signature || !/^\d{13}$/.test(time) || Date.now() - Number(time) > 5 * 60_000 || Number(time) > Date.now() || !safeEqual(proof(time), signature)) return NextResponse.json({ ok: false }, { status: 403, headers });
    }
    return NextResponse.json({ ok: true, ...await managePassportShare(c, user.id, childId, operation, alias) }, { headers });
  } catch (error) { return NextResponse.json({ ok: false }, { status: error instanceof PassportAccessError ? 404 : 503, headers }); }
}
