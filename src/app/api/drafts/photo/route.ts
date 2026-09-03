import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { attachPhoto, draftBelongsTo } from "@/services/create-flow.service";
import { currentUser, draftTokenFromCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/** Multipart upload of the child's photo for the current draft. */
export async function POST(req: Request) {
  const c = getContainer();
  const token = await draftTokenFromCookie();
  if (!token) return NextResponse.json({ ok: false, code: "DRAFT_NOT_FOUND", reason: "הטיוטה לא נמצאה. התחילו מחדש." }, { status: 400 });
  const game = await c.db.game.findUnique({ where: { draftToken: token } });
  const user = await currentUser();
  if (!game || !draftBelongsTo(game, token, user?.id ?? null)) return NextResponse.json({ ok: false, code: "DRAFT_NOT_FOUND", reason: "הטיוטה לא נמצאה." }, { status: 404 });

  const form = await req.formData();
  // Parental consent is a hard requirement: no photo of a child is stored without it.
  if (form.get("consent") !== "1") return NextResponse.json({ ok: false, code: "CONSENT_REQUIRED", reason: "צריך לאשר שאתם ההורה או האפוטרופוס." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, code: "NO_FILE", reason: "לא התקבל קובץ." }, { status: 400 });
  let crop: { x: number; y: number; w: number; h: number } | null = null;
  const rawCrop = form.get("crop");
  if (typeof rawCrop === "string") {
    try {
      const parsed = JSON.parse(rawCrop) as { x: number; y: number; w: number; h: number };
      if ([parsed.x, parsed.y, parsed.w, parsed.h].every((n) => typeof n === "number" && Number.isFinite(n))) {
        crop = { x: clamp01(parsed.x), y: clamp01(parsed.y), w: clamp01(parsed.w), h: clamp01(parsed.h) };
      }
    } catch {
      crop = null;
    }
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await attachPhoto(c, game.id, { buffer, mimeType: file.type, crop });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[photo upload] failed", err);
    return NextResponse.json({ ok: false, code: "UPLOAD_FAILED", reason: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** The draft owner's own photo (for the checkout summary). Never cached. */
export async function GET() {
  const c = getContainer();
  const token = await draftTokenFromCookie();
  if (!token) return new Response("not found", { status: 404 });
  const game = await c.db.game.findUnique({ where: { draftToken: token }, include: { childProfile: true } });
  const photoId = game?.childProfile?.originalPhotoAssetId;
  if (!game || !photoId) return new Response("not found", { status: 404 });
  const asset = await c.db.asset.findUnique({ where: { id: photoId } });
  if (!asset || asset.status === "DELETED") return new Response("not found", { status: 404 });
  const buffer = await c.storage.get(asset.storagePath);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, no-store" } });
}
