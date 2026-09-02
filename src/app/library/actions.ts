"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getContainer } from "@/services/container";
import { destroySession, requestMagicLink } from "@/services/auth.service";
import { deleteGame, updateGift } from "@/services/game.service";
import { rotatePlayerLink } from "@/services/share-link.service";
import { SESSION_COOKIE, clearSessionCookie, currentUser } from "@/lib/server/session";
import type { ActionResult } from "../create/actions";

export type LoginResult = { ok: true; email: string } | { ok: false; reason: string } | null;

export async function requestMagicLinkAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "");
  const res = await requestMagicLink(getContainer(), email, "/library");
  return res.ok ? { ok: true, email } : res;
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  await destroySession(getContainer(), jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/");
}

export async function updateGiftAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) redirect("/library");
  const gameId = String(formData.get("gameId") ?? "");
  const ok = await updateGift(getContainer(), gameId, user.id, { fromName: String(formData.get("fromName") ?? ""), message: String(formData.get("message") ?? "") });
  if (!ok) return { ok: false, reason: "המשחק לא נמצא." };
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
