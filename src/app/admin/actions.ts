"use server";

import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { revalidatePath } from "next/cache";
import { getContainer } from "@/services/container";
import { adjustTarget, approveAndPublish, markTargetForRegeneration, recutAvatar, requestNewPhoto, retryGeneration } from "@/services/admin.service";
import { refundOrder } from "@/services/order.service";
import { deleteGame } from "@/services/game.service";
import { rotatePlayerLink } from "@/services/share-link.service";
import { setSceneActive } from "@/services/scene-catalog.service";
import { currentAdmin } from "@/lib/server/session";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION, resumeLocalPatchRepairs } from "@/services/generation/local-patch-repair-resume";
import { LOCAL_PATCH_HUMAN_CONFIRMATION } from "@/services/generation/local-patch-human-approval";

async function admin() {
  await requireQaAccess();
  const a = await currentAdmin();
  if (!a) redirect("/library");
  return { type: "ADMIN" as const, id: a.id };
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

export async function approveAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  const game = await getContainer().db.game.findUnique({ where: { id: gameId }, select: { styleVersion: true } });
  if (game?.styleVersion === "local-patch-world-v1") {
    const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
    let sameOrigin = false;
    try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse invalid origin */ }
    if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("confirmAsIs").length !== 1
      || str(fd, "confirmAsIs") !== LOCAL_PATCH_HUMAN_CONFIRMATION) throw new Error("Explicit same-origin administrator approval of all 27 current pictures is required");
  }
  await approveAndPublish(getContainer(), gameId, actor);
  revalidatePath(`/admin/orders/${gameId}`);
}

export async function regenTargetAction(fd: FormData): Promise<void> {
  const actor = await admin();
  await markTargetForRegeneration(getContainer(), str(fd, "targetInstanceId"), actor);
  revalidatePath(`/admin/orders/${str(fd, "gameId")}`);
}

export async function adjustTargetAction(fd: FormData): Promise<void> {
  const actor = await admin();
  await adjustTarget(getContainer(), str(fd, "targetInstanceId"), { dx: Number(fd.get("dx") ?? 0), dy: Number(fd.get("dy") ?? 0), scale: Number(fd.get("scale") ?? 1) }, actor);
  revalidatePath(`/admin/orders/${str(fd, "gameId")}`);
}

export async function recutAvatarAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  await recutAvatar(getContainer(), gameId, actor);
  revalidatePath(`/admin/orders/${gameId}`);
}

export async function requestPhotoAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  await requestNewPhoto(getContainer(), gameId, actor, str(fd, "note"));
  revalidatePath(`/admin/orders/${gameId}`);
}

export async function retryAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  await retryGeneration(getContainer(), gameId, actor);
  revalidatePath(`/admin/orders/${gameId}`);
}

/** Explicit administrator authorization, never a page-load or cron side effect. */
export async function resumeLocalPatchRepairsAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`;
  // Next also protects Server Actions with its Origin/Host check. Keep this
  // sensitive single-game authorization fail-closed if invoked independently.
  const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* reject invalid origins */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION) redirect(`${destination}?repair=blocked`);
  let confirmed = false;
  try {
    await resumeLocalPatchRepairs(getContainer(), { gameId, operatorId: actor.id,
      authorizationReason: "Administrator explicitly confirmed user authorization for one additional repair per failed hide after normal creation" });
    confirmed = true;
  } catch { /* Return a safe operational notice, never private DB/identity details. */ }
  revalidatePath(destination);
  revalidatePath("/admin/orders");
  redirect(`${destination}?repair=${confirmed ? "queued" : "blocked"}`);
}

export async function refundAction(fd: FormData): Promise<void> {
  const actor = await admin();
  await refundOrder(getContainer(), str(fd, "orderId"), actor);
  revalidatePath(`/admin/orders/${str(fd, "gameId")}`);
}

export async function adminDeleteAction(fd: FormData): Promise<void> {
  const actor = await admin();
  await deleteGame(getContainer(), str(fd, "gameId"), actor);
  redirect("/admin/orders");
}

export async function adminRotateLinkAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId");
  await rotatePlayerLink(getContainer(), gameId, actor);
  revalidatePath(`/admin/orders/${gameId}`);
}

export async function setSceneActiveAction(fd: FormData): Promise<void> {
  await admin();
  await setSceneActive(getContainer(), str(fd, "slug"), str(fd, "active") === "true", str(fd, "note") || undefined);
  revalidatePath("/admin/scenes");
  revalidatePath("/");
}
