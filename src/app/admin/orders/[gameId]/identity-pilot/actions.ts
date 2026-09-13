"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { stageLocalPatchQualityPilot, resumeLocalPatchAfterQualityPilot } from "@/services/generation/local-patch-quality-pilot";

const identifier = /^[A-Za-z0-9_-]{1,160}$/;
const digest = /^[a-f0-9]{64}$/;
function one(data: FormData, key: string): string {
  if (data.getAll(key).length !== 1 || typeof data.get(key) !== "string") throw new Error("Invalid pilot form");
  return String(data.get(key));
}

async function context(data: FormData, confirmation: string) {
  await requireQaAccess();
  const admin = await currentAdmin();
  const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse malformed origin */ }
  if (!admin || env().APP_ENV !== "qa" || !sameOrigin) throw new Error("Private QA administrator action required");
  const gameId = one(data, "gameId"), reason = one(data, "reason").trim();
  if (!identifier.test(gameId) || reason.length < 10 || reason.length > 1_000 || one(data, "confirm") !== confirmation) throw new Error("Invalid pilot authorization");
  return { gameId, operatorId: admin.id, reason };
}

/** No provider dispatch in this action: an authenticated choice stages server work. */
export async function stageIdentityPilotAction(data: FormData): Promise<void> {
  const input = await context(data, "one-bounded-image-then-stop");
  const hideId = one(data, "hideId"), expectedAssetId = one(data, "expectedAssetId"), expectedSha256 = one(data, "expectedSha256");
  if (!identifier.test(hideId) || !identifier.test(expectedAssetId) || !digest.test(expectedSha256)) throw new Error("Invalid pilot candidate");
  let outcome = "blocked";
  try {
    await stageLocalPatchQualityPilot(getContainer(), { ...input, hideId, expectedAssetId, expectedSha256 });
    outcome = "staged";
  } catch (error) {
    console.warn("[identity-pilot] stage refused", error instanceof Error && error.message.startsWith("LOCAL_PATCH_QUALITY_PILOT:")
      ? error.message.slice(0, 240) : "authorization or storage unavailable");
  }
  const path = `/admin/orders/${input.gameId}/identity-pilot`;
  revalidatePath(path); revalidatePath(`/admin/orders/${input.gameId}`);
  redirect(`${path}?outcome=${outcome}`);
}

/** Visual inspection permits renewed automatic judging, never publication. */
export async function resumeIdentityPilotAction(data: FormData): Promise<void> {
  const input = await context(data, "resume-candidates-for-automatic-review");
  const pilotId = one(data, "pilotId"), expectedCandidateSha256 = one(data, "expectedCandidateSha256");
  if (!identifier.test(pilotId) || !digest.test(expectedCandidateSha256)) throw new Error("Invalid inspected pilot");
  let outcome = "blocked";
  try {
    await resumeLocalPatchAfterQualityPilot(getContainer(), { ...input, pilotId, expectedCandidateSha256 });
    outcome = "resumed";
  } catch (error) {
    console.warn("[identity-pilot] resume refused", error instanceof Error && error.message.startsWith("LOCAL_PATCH_QUALITY_PILOT:")
      ? error.message.slice(0, 240) : "authorization or storage unavailable");
  }
  const path = `/admin/orders/${input.gameId}/identity-pilot`;
  revalidatePath(path); revalidatePath(`/admin/orders/${input.gameId}`);
  redirect(`${path}?outcome=${outcome}`);
}
