import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { replacePhotoForPaidGame } from "@/services/create-flow.service";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** A new photo for a paid game that QA sent back. Visible to the draft owner, the account owner, or an admin. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true, draftToken: true } }), currentUser(), draftTokenFromCookie()]);
  if (!game) return NextResponse.json({ ok: false, code: "DRAFT_NOT_FOUND", reason: "המשחק לא נמצא." }, { status: 404 });
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) return NextResponse.json({ ok: false, code: "DRAFT_NOT_FOUND", reason: "המשחק לא נמצא." }, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, code: "PHOTO_TOO_LARGE", reason: "הקובץ גדול מדי." }, { status: 413 });
  const form = await req.formData();
  if (form.get("consent") !== "1") return NextResponse.json({ ok: false, code: "CONSENT_REQUIRED", reason: "צריך לאשר שאתם ההורה או האפוטרופוס." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, code: "NO_FILE", reason: "לא התקבל קובץ." }, { status: 400 });
  let crop: { x: number; y: number; w: number; h: number } | null = null;
  const rawCrop = form.get("crop");
  if (typeof rawCrop === "string" && rawCrop) {
    try {
      const parsed = JSON.parse(rawCrop) as { x: number; y: number; w: number; h: number };
      crop = { x: clamp01(parsed.x), y: clamp01(parsed.y), w: clamp01(parsed.w), h: clamp01(parsed.h) };
    } catch {
      crop = null;
    }
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, code: "PHOTO_TOO_LARGE", reason: "הקובץ גדול מדי." }, { status: 413 });
  try {
    const result = await replacePhotoForPaidGame(c, gameId, { buffer, mimeType: file.type, crop });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[new photo] failed", err);
    return NextResponse.json({ ok: false, code: "UPLOAD_FAILED", reason: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
