import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { ProgressBatchInput, recordProgress } from "@/services/progress.service";

export const runtime = "nodejs";

/** Aggregate play events from the player (sendBeacon-friendly). */
export async function POST(req: Request) {
  const c = getContainer();
  let parsed;
  try {
    parsed = ProgressBatchInput.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const game = await c.db.game.findUnique({ where: { id: parsed.data.gameId }, select: { id: true, deletedAt: true } });
  if (!game || game.deletedAt) return NextResponse.json({ ok: false }, { status: 404 });
  await recordProgress(c, parsed.data);
  return new NextResponse(null, { status: 204 });
}
