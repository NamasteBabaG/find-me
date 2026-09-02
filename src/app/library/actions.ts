"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getContainer } from "@/services/container";
import { destroySession, requestMagicLink } from "@/services/auth.service";
import { deleteGame, updateGift } from "@/services/game.service";
import { rotatePlayerLink } from "@/services/share-link.service";
import { SESSION_COOKIE, clearSessionCookie, currentUser } from "@/lib/server/session";
import { getLocale } from "@/i18n/server";
import { flowError, type FlowResult } from "@/i18n/errors";

export type LoginResult = { ok: true; email: string } | { ok: false; reason: string; code?: string } | null;

export async function requestMagicLinkAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "");
  const locale = await getLocale();
  const res = await requestMagicLink(getContainer(), email, "/library", locale);
  return res.ok ? { ok: true, email } : { ok: false, reason: res.reason, code: "INVALID_EMAIL" };
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  await destroySession(getContainer(), jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/");
}

export async function updateGiftAction(_prev: FlowResult | null, formData: FormData): Promise<FlowResult> {
  const user = await currentUser();
  if (!user) redirect("/library");
  const gameId = String(formData.get("gameId") ?? "");
  const ok = await updateGift(getContainer(), gameId, user.id, { fromName: String(formData.get("fromName") ?? ""), message: String(formData.get("message") ?? "") });
  if (!ok) return flowError("DRAFT_NOT_FOUND", "המשחק לא נמצא.");
  revalidatePath(`/library/${gameId}`);
  return { ok: true };
}

export async function rotateLinkAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/library");
  const gameId = String(formData.get("gameId") ?? "");
  const c = getContainer();
  const owned = await c.db.game.findFirst({ where: { id: gameId, ownerId: user.id, deletedAt: null } });
  if (owned) await rotatePlayerLink(c, gameId, { type: "USER", id: user.id });
  revalidatePath(`/library/${gameId}`);
}

export async function deleteGameAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/library");
  const gameId = String(formData.get("gameId") ?? "");
  await deleteGame(getContainer(), gameId, { type: "USER", id: user.id }, user.id);
  revalidatePath("/library");
  redirect("/library?deleted=1");
}
