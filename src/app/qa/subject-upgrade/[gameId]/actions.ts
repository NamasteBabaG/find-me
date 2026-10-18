"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentUser } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { assertGenerationSpendAllowed } from "@/services/generation/board-conditioned-wizard";
import { applySubjectUpgrade } from "@/services/generation/subject-upgrade";

/** QA only, existing authenticated owner only. Never grants an administrator role. */
export async function applyOwnedQaSubjectUpgrade(fd: FormData): Promise<never> {
  if (env().APP_ENV !== "qa") notFound();
  await requireQaAccess();
  const user = await currentUser();
  if (!user) notFound();
  const gameId = String(fd.get("gameId") ?? ""), expectedPlanSha256 = String(fd.get("planSha256") ?? "");
  const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (!sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1
    || !/^[A-Za-z0-9_-]{1,200}$/.test(gameId) || !/^[a-f0-9]{64}$/.test(expectedPlanSha256)) notFound();
  const c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true } });
  if (game?.ownerId !== user.id) notFound();
  await assertGenerationSpendAllowed(c, user.id);
  await applySubjectUpgrade(c, { gameId, ownerId: user.id, operatorId: user.id, actorType: "USER", expectedPlanSha256 });
  redirect(`/creating/${gameId}`);
}
