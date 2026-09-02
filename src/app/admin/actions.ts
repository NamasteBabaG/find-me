"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContainer } from "@/services/container";
import { adjustTarget, approveAndPublish, markTargetForRegeneration, requestNewPhoto, retryGeneration } from "@/services/admin.service";
import { refundOrder } from "@/services/order.service";
import { deleteGame } from "@/services/game.service";
import { rotatePlayerLink } from "@/services/share-link.service";
import { setSceneActive } from "@/services/scene-catalog.service";
import { currentAdmin } from "@/lib/server/session";

async function admin() {
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
