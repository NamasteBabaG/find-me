"use server";

import { QA_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-completion-capacity";
import { authorizeQaCompletionCapacity } from "@/services/generation/qa-completion-capacity";

import { LEAN_CAPACITY_RECOVERY_CONFIRMATION } from "@/domain/generation/lean-capacity-recovery";
import { authorizeDetectivesCompletionBudget, authorizeDetectivesCompletionExtension, authorizeDetectivesCompletionTail } from "@/services/generation/detectives-completion-budget";
import { DETECTIVES_COMPLETION_CONFIRMATION, DETECTIVES_EXTENSION_CONFIRMATION, DETECTIVES_TAIL_CONFIRMATION } from "@/domain/generation/detectives-completion-budget";
import { authorizeLeanCapacityRecovery } from "@/services/generation/lean-capacity-recovery";
import { LEAN_COMPLETION_BUDGET_CONFIRMATION } from "@/domain/generation/lean-completion-budget";
import { authorizeLeanCompletionBudget } from "@/services/generation/lean-completion-budget";

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
import { IDENTITY_SOURCE_REVISION_CONFIRMATION, IDENTITY_SOURCE_RETRY_CONFIRMATION, beginIdentitySourceRevision, retryIdentitySourceRevision } from "@/services/generation/identity-source-revision";
import { LEAN_REVIEW_RECOVERY_CONFIRMATION, applyLeanReviewRecovery } from "@/services/generation/lean-review-recovery";

async function admin() {
  await requireQaAccess();
  const a = await currentAdmin();
  if (!a) redirect("/library");
  return { type: "ADMIN" as const, id: a.id };
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

/** One explicit source-bound QA capacity grant, preserving every art gate. */
export async function authorizeQaCompletionCapacityAction(fd:FormData):Promise<void>{
  const actor=await admin(),gameId=str(fd,"gameId"),planSha256=str(fd,"planSha256"),ownerAuthorizationSha256=str(fd,"ownerAuthorizationSha256");
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(gameId))redirect("/admin/orders");
  const destination=`/admin/orders/${encodeURIComponent(gameId)}`,h=await headers();let sameOrigin=false;
  try{const origin=h.get("origin"),host=h.get("x-forwarded-host")??h.get("host");sameOrigin=!!origin&&!!host&&new URL(origin).host===host&&h.get("sec-fetch-site")!=="cross-site";}catch{/* refuse invalid origin */}
  if(env().APP_ENV!=="qa"||!sameOrigin||fd.getAll("gameId").length!==1||fd.getAll("planSha256").length!==1||!/^[a-f0-9]{64}$/.test(planSha256)
    ||fd.getAll("ownerAuthorizationSha256").length!==1||!/^[a-f0-9]{64}$/.test(ownerAuthorizationSha256)
    ||fd.getAll("confirm").length!==1||str(fd,"confirm")!==QA_COMPLETION_CONFIRMATION){
    console.warn("[qa-completion] blocked",{reason:"request-validation"});redirect(`${destination}?qaCompletion=blocked`);
  }
  let granted=false;try{await authorizeQaCompletionCapacity(getContainer(),{gameId,operatorId:actor.id,expectedPlanSha256:planSha256,ownerAuthorizationSha256});granted=true;}catch(error){
    // Diagnose the hold without logging SQL, credentials, private paths, source
    // pixels, authorization digests or arbitrary exception messages.
    const code=typeof error==="object"&&error&&"code" in error&&typeof error.code==="string"&&/^P\d{4}$/.test(error.code)?error.code:null;
    const holds:Record<string,string>={"QA_COMPLETION: Owner or completion plan changed":"plan-changed",
      "QA_COMPLETION: Concurrent completion state changed":"concurrent-state","QA_COMPLETION: Completion hold changed before authorization":"hold-changed"};
    const reason=code??(error instanceof Error?(holds[error.message]??(error.message.startsWith("QA_COMPLETION: ")?"bound-state":"unexpected")):"unexpected");
    console.warn("[qa-completion] blocked",{reason});
  }
  revalidatePath(destination);redirect(`${destination}?qaCompletion=${granted?"authorized":"blocked"}`);
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

/**
 * local-patch-lean-review-recovery/v1: an administrator's explicit release of one lean world its 2+4 continuations parked,
 * bound to the exact plan shown on the order page. Never a page-load or cron side effect; the scheduled tick does the rest.
 */
export async function applyLeanReviewRecoveryAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`;
  const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* reject invalid origins */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1
    || !/^[a-f0-9]{64}$/.test(planSha256) || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== LEAN_REVIEW_RECOVERY_CONFIRMATION)
    redirect(`${destination}?leanRecovery=blocked`);
  let applied = false;
  try {
    await applyLeanReviewRecovery(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256 });
    applied = true;
  } catch { /* A safe operational notice, never private DB, ledger or identity details. */ }
  revalidatePath(destination);
  revalidatePath("/admin/orders");
  redirect(`${destination}?leanRecovery=${applied ? "applied" : "blocked"}`);
}

export async function refundAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const destination = `/admin/orders/${encodeURIComponent(str(fd, "gameId"))}`;
  let confirmed = false;
  try { confirmed = (await refundOrder(getContainer(), str(fd, "orderId"), actor)).ok; }
  catch { /* The provider may have acted: ask for reconciliation, not another click. */ }
  revalidatePath(destination);
  redirect(`${destination}?refund=${confirmed ? "recorded" : "review"}`);
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


/** Same-origin, authenticated single-world reference repair. Never approves or releases the rejected drawing. */
export async function beginIdentitySourceRevisionAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`;
  const h = await headers(), origin = h.get("origin"), host = h.get("x-forwarded-host") ?? h.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== IDENTITY_SOURCE_REVISION_CONFIRMATION) redirect(`${destination}?referenceRepair=blocked`);
  let started = false;
  try { await beginIdentitySourceRevision(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256 }); started = true; }
  catch { /* Safe notice; never expose private source, database or supplier errors. */ }
  revalidatePath(destination); revalidatePath("/admin/orders");
  redirect(`${destination}?referenceRepair=${started ? "started" : "blocked"}`);
}


export async function retryIdentitySourceRevisionAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), heldId = str(fd, "heldId");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("heldId").length !== 1 || !/^[A-Za-z0-9_-]{1,240}$/.test(heldId)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== IDENTITY_SOURCE_RETRY_CONFIRMATION) redirect(`${destination}?referenceRepair=blocked`);
  let started = false;
  try { await retryIdentitySourceRevision(getContainer(), { gameId, operatorId: actor.id, expectedHeldId: heldId }); started = true; } catch { /* bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?referenceRepair=${started ? "started" : "blocked"}`);
}


/** Explicit owner-admin action for the same retained Detective world, with recorded human authorization. */
export async function authorizeDetectivesCompletionBudgetAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256"), ownerAuthorizationSha256 = str(fd, "ownerAuthorizationSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("ownerAuthorizationSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(ownerAuthorizationSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== DETECTIVES_COMPLETION_CONFIRMATION) redirect(`${destination}?detectivesBudget=blocked`);
  let granted = false;
  try { await authorizeDetectivesCompletionBudget(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256, ownerAuthorizationSha256 }); granted = true; } catch { /* bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?detectivesBudget=${granted ? "authorized" : "blocked"}`);
}

/** Separate explicit capacity authority; neither a source retry nor art approval. */
export async function authorizeLeanCompletionBudgetAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== LEAN_COMPLETION_BUDGET_CONFIRMATION) redirect(`${destination}?completionBudget=blocked`);
  let granted = false;
  try { await authorizeLeanCompletionBudget(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256 }); granted = true; } catch { /* safe bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?completionBudget=${granted ? "authorized" : "blocked"}`);
}

/** Separate explicit capacity authority; neither a source retry nor art approval. */
export async function authorizeLeanCapacityRecoveryAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== LEAN_CAPACITY_RECOVERY_CONFIRMATION) redirect(`${destination}?capacityRecovery=blocked`);
  let granted = false;
  try { await authorizeLeanCapacityRecovery(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256 }); granted = true; } catch { /* safe bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?capacityRecovery=${granted ? "authorized" : "blocked"}`);
}


/** A separate owner-authorized cumulative eight-dollar extension; never image approval. */
export async function authorizeDetectivesCompletionExtensionAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256"), ownerAuthorizationSha256 = str(fd, "ownerAuthorizationSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("ownerAuthorizationSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(ownerAuthorizationSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== DETECTIVES_EXTENSION_CONFIRMATION) redirect(`${destination}?detectivesExtension=blocked`);
  let granted = false;
  try { await authorizeDetectivesCompletionExtension(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256, ownerAuthorizationSha256 }); granted = true; } catch { /* bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?detectivesExtension=${granted ? "authorized" : "blocked"}`);
}

/** A separate owner-authorized cumulative ten-dollar finite-tail extension; never image approval. */
export async function authorizeDetectivesCompletionTailAction(fd: FormData): Promise<void> {
  const actor = await admin(), gameId = str(fd, "gameId"), planSha256 = str(fd, "planSha256"), ownerAuthorizationSha256 = str(fd, "ownerAuthorizationSha256");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) redirect("/admin/orders");
  const destination = `/admin/orders/${encodeURIComponent(gameId)}`, h = await headers();
  let sameOrigin = false;
  try { sameOrigin = new URL(h.get("origin") ?? "").host === (h.get("x-forwarded-host") ?? h.get("host")) && h.get("sec-fetch-site") !== "cross-site"; } catch { /* refuse */ }
  if (env().APP_ENV !== "qa" || !sameOrigin || fd.getAll("gameId").length !== 1 || fd.getAll("planSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(planSha256)
    || fd.getAll("ownerAuthorizationSha256").length !== 1 || !/^[a-f0-9]{64}$/.test(ownerAuthorizationSha256)
    || fd.getAll("confirm").length !== 1 || str(fd, "confirm") !== DETECTIVES_TAIL_CONFIRMATION) redirect(`${destination}?detectivesExtension=blocked`);
  let granted = false;
  try { await authorizeDetectivesCompletionTail(getContainer(), { gameId, operatorId: actor.id, expectedPlanSha256: planSha256, ownerAuthorizationSha256 }); granted = true; } catch { /* bounded notice */ }
  revalidatePath(destination);
  redirect(`${destination}?detectivesExtension=${granted ? "authorized" : "blocked"}`);
}

/** Recompose two known source windows; money, image attempts and art decisions are not granted here. */
export async function stageCrownReturnRepairAction(fd:FormData):Promise<void>{
 const actor=await admin(),gameId=str(fd,"gameId"),planSha256=str(fd,"planSha256");
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(gameId))redirect("/admin/orders");
 const destination=`/admin/orders/${encodeURIComponent(gameId)}`,h=await headers();let sameOrigin=false;
 try{sameOrigin=new URL(h.get("origin")??"").host===(h.get("x-forwarded-host")??h.get("host"))&&h.get("sec-fetch-site")!=="cross-site";}catch{/* refuse */}
 if(env().APP_ENV!=="qa"||!sameOrigin||fd.getAll("gameId").length!==1||fd.getAll("planSha256").length!==1||!/^[a-f0-9]{64}$/.test(planSha256))redirect(`${destination}?crownReturn=blocked`);
 let staged=false;try{await(await import("@/services/generation/published-crown-repair")).stagePublishedCrownRepair(getContainer(),{gameId,operatorId:actor.id,expectedPlanSha256:planSha256});staged=true;}catch{/* bounded admin notice; no private evidence in the URL */}
 revalidatePath(destination);redirect(`${destination}?crownReturn=${staged?"staged":"blocked"}`);
}


export async function stageWholeSourceContextAction(fd:FormData):Promise<void>{
  const actor=await admin(),gameId=str(fd,"gameId"),planSha256=str(fd,"planSha256");
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(gameId))redirect("/admin/orders");
  const destination=`/admin/orders/${encodeURIComponent(gameId)}`,h=await headers();let sameOrigin=false;
  try{sameOrigin=new URL(h.get("origin")??"").host===(h.get("x-forwarded-host")??h.get("host"))&&h.get("sec-fetch-site")!=="cross-site";}catch{/* refuse */}
  if(env().APP_ENV!=="qa"||!sameOrigin||fd.getAll("gameId").length!==1||fd.getAll("planSha256").length!==1||!/^[a-f0-9]{64}$/.test(planSha256))redirect(`${destination}?sourceContext=blocked`);
  let staged=false;
  try{await(await import("@/services/generation/whole-source-context-repair")).stageWholeSourceContextRepair(getContainer(),{gameId,operatorId:actor.id,expectedPlanSha256:planSha256});staged=true;}catch{/* no private evidence in errors or redirects */}
  revalidatePath(destination);redirect(`${destination}?sourceContext=${staged?"staged":"blocked"}`);
}
