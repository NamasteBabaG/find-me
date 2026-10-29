import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "real-session-admin" } as { id: string } | null,
  requestHeaders: new Headers(), qaAccess: vi.fn(), apply: vi.fn(), retry: vi.fn(), grant: vi.fn(), capacity: vi.fn(), detectives: vi.fn(), extension: vi.fn(), qaCompletion:vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => f.requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.qaAccess }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/admin.service", () => ({}));
vi.mock("@/services/order.service", () => ({}));
vi.mock("@/services/game.service", () => ({}));
vi.mock("@/services/share-link.service", () => ({}));
vi.mock("@/services/scene-catalog.service", () => ({}));
vi.mock("@/services/generation/local-patch-repair-resume", () => ({ LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION: "authorize-one-post-normal-repair-per-failed-hide" }));
vi.mock("@/services/generation/local-patch-human-approval", () => ({ LOCAL_PATCH_HUMAN_CONFIRMATION: "synthetic-as-is" }));
vi.mock("@/services/generation/identity-source-revision", () => ({
  IDENTITY_SOURCE_REVISION_CONFIRMATION: "repair-this-world-reference-from-full-source-v1", beginIdentitySourceRevision: f.apply, IDENTITY_SOURCE_RETRY_CONFIRMATION: "retry-the-same-bound-reference-operation-v1", retryIdentitySourceRevision: f.retry,
}));
vi.mock("@/services/generation/lean-completion-budget", () => ({ authorizeLeanCompletionBudget: f.grant }));
vi.mock("@/services/generation/lean-capacity-recovery", () => ({ authorizeLeanCapacityRecovery: f.capacity }));
vi.mock("@/services/generation/detectives-completion-budget", () => ({ authorizeDetectivesCompletionBudget: f.detectives, authorizeDetectivesCompletionTail: f.extension, authorizeDetectivesCompletionExtension: f.extension }));
vi.mock("@/services/generation/qa-completion-capacity",()=>({authorizeQaCompletionCapacity:f.qaCompletion}));
import { QA_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-completion-capacity";
import { DETECTIVES_COMPLETION_CONFIRMATION, DETECTIVES_EXTENSION_CONFIRMATION, DETECTIVES_TAIL_CONFIRMATION } from "@/domain/generation/detectives-completion-budget";
import { LEAN_CAPACITY_RECOVERY_CONFIRMATION } from "@/domain/generation/lean-capacity-recovery";
import { LEAN_COMPLETION_BUDGET_CONFIRMATION } from "@/domain/generation/lean-completion-budget";
import { beginIdentitySourceRevisionAction, retryIdentitySourceRevisionAction, authorizeLeanCompletionBudgetAction, authorizeLeanCapacityRecoveryAction, authorizeDetectivesCompletionBudgetAction, authorizeDetectivesCompletionExtensionAction, authorizeDetectivesCompletionTailAction, authorizeQaCompletionCapacityAction } from "../actions";
const destination = "/admin/orders/game-synthetic", digest = "a".repeat(64);
function form() {
  const data = new FormData(); data.set("gameId", "game-synthetic"); data.set("planSha256", digest);
  data.set("confirm", "repair-this-world-reference-from-full-source-v1"); return data;
}
beforeEach(() => {
  f.qaCompletion.mockReset().mockResolvedValue({capMicroUsd:12000000});
  f.extension.mockReset().mockResolvedValue({ capMicroUsd: 8_000_000 });
  f.detectives.mockReset().mockResolvedValue({ capMicroUsd: 6_000_000 });
  f.appEnv = "qa"; f.admin = { id: "real-session-admin" };
  f.requestHeaders = new Headers({ origin: "https://qa.example.invalid", host: "qa.example.invalid", "sec-fetch-site": "same-origin" });
  f.qaAccess.mockReset().mockResolvedValue(undefined); f.apply.mockReset().mockResolvedValue({ applied: true }); f.revalidate.mockReset(); f.retry.mockReset().mockResolvedValue(undefined); f.grant.mockReset().mockResolvedValue({ capMicroUsd: 6_000_000 }); f.capacity.mockReset().mockResolvedValue({ capMicroUsd: 12_000_000 });
});

describe("existing MEDIUM QA completion action",()=>{
  const completionForm=()=>{const data=form();data.set("confirm",QA_COMPLETION_CONFIRMATION);data.set("ownerAuthorizationSha256","b".repeat(64));return data;};
  it("uses the authenticated actor and exact shown plan, never a supplied operator or cap",async()=>{
    const data=completionForm();data.set("operatorId","forged-operator");data.set("capMicroUsd","999999999");
    await expect(authorizeQaCompletionCapacityAction(data)).rejects.toThrow(`redirect:${destination}?qaCompletion=authorized`);
    expect(f.qaCompletion).toHaveBeenCalledExactlyOnceWith({synthetic:true},{gameId:"game-synthetic",operatorId:"real-session-admin",expectedPlanSha256:digest,ownerAuthorizationSha256:"b".repeat(64)});
  });
  it.each(["production","no-admin","cross-origin","missing-origin","unconfirmed","duplicate-id","duplicate-plan","duplicate-evidence","malformed-evidence"])("refuses %s before any grant",async mode=>{
    const data=completionForm();
    if(mode==="production")f.appEnv="production";if(mode==="no-admin")f.admin=null;
    if(mode==="cross-origin")f.requestHeaders.set("origin","https://attacker.invalid");if(mode==="missing-origin")f.requestHeaders.delete("origin");
    if(mode==="unconfirmed")data.delete("confirm");if(mode==="duplicate-id")data.append("gameId","another-game");if(mode==="duplicate-plan")data.append("planSha256",digest);
    if(mode==="duplicate-evidence")data.append("ownerAuthorizationSha256","b".repeat(64));if(mode==="malformed-evidence")data.set("ownerAuthorizationSha256","short");
    await expect(authorizeQaCompletionCapacityAction(data)).rejects.toThrow(/redirect:/);expect(f.qaCompletion).not.toHaveBeenCalled();
  });
});
describe("an authenticated administrator starts a bound source revision, never image approval", () => {
  it("binds the authenticated administrator and the exact plan digest, then returns to the order page", async () => {
    const data = form(); data.set("operatorId", "forged-operator");
    await expect(beginIdentitySourceRevisionAction(data)).rejects.toThrow(`redirect:${destination}?referenceRepair=started`);
    expect(f.qaAccess).toHaveBeenCalledOnce();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedPlanSha256: digest });
    expect(f.revalidate).toHaveBeenCalledWith(destination);
  });
  it("reports an idempotent repeat of the same plan as released", async () => {
    f.apply.mockResolvedValue({ applied: false });
    await expect(beginIdentitySourceRevisionAction(form())).rejects.toThrow(`redirect:${destination}?referenceRepair=started`);
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "unconfirmed", "wrong-confirmation", "duplicate-id",
    "duplicate-plan", "duplicate-confirm", "malformed-plan", "missing-plan", "invalid-id"])("rejects %s before the release is attempted", async mode => {
    const data = form();
    if (mode === "production") f.appEnv = "production";
    if (mode === "no-admin") f.admin = null;
    if (mode === "qa-denied") f.qaAccess.mockRejectedValue(new Error("qa-denied"));
    if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid");
    if (mode === "missing-origin") f.requestHeaders.delete("origin");
    if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
    if (mode === "unconfirmed") data.delete("confirm");
    if (mode === "wrong-confirmation") data.set("confirm", "authorize-one-post-normal-repair-per-failed-hide");
    if (mode === "duplicate-id") data.append("gameId", "another-game");
    if (mode === "duplicate-plan") data.append("planSha256", "b".repeat(64));
    if (mode === "duplicate-confirm") data.append("confirm", "repair-this-world-reference-from-full-source-v1");
    if (mode === "malformed-plan") data.set("planSha256", "not-a-digest");
    if (mode === "missing-plan") data.delete("planSha256");
    if (mode === "invalid-id") data.set("gameId", "../../another-game");
    await expect(beginIdentitySourceRevisionAction(data)).rejects.toThrow();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("a changed world or a refused plan returns a safe blocked notice without exposing private errors", async () => {
    f.apply.mockRejectedValue(new Error("private ledger or identity details"));
    await expect(beginIdentitySourceRevisionAction(form())).rejects.toThrow(`redirect:${destination}?referenceRepair=blocked`);
    expect(f.apply).toHaveBeenCalledOnce();
  });
});


function retryForm() { const data = new FormData(); data.set("gameId", "game-synthetic"); data.set("heldId", "held-synthetic");
  data.set("confirm", "retry-the-same-bound-reference-operation-v1"); return data; }
it("binds a service retry to the session administrator and exact retained diagnosis", async () => {
  const data = retryForm(); data.set("operatorId", "forged-operator");
  await expect(retryIdentitySourceRevisionAction(data)).rejects.toThrow(`redirect:${destination}?referenceRepair=started`);
  expect(f.retry).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedHeldId: "held-synthetic" });
});
it.each(["no-admin", "qa-denied", "production", "cross-origin", "missing-origin", "cross-site", "duplicate-id", "duplicate-held", "invalid-held", "duplicate-confirm", "unconfirmed"])("refuses a %s service retry without touching the operation", async mode => {
  const data = retryForm();
  if (mode === "no-admin") f.admin = null; if (mode === "qa-denied") f.qaAccess.mockRejectedValue(Error("synthetic QA denied")); if (mode === "production") f.appEnv = "production";
  if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid"); if (mode === "missing-origin") f.requestHeaders.delete("origin"); if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
  if (mode === "duplicate-id") data.append("gameId", "another-game"); if (mode === "duplicate-held") data.append("heldId", "another-hold"); if (mode === "invalid-held") data.set("heldId", "../../another-world");
  if (mode === "duplicate-confirm") data.append("confirm", "another-operation"); if (mode === "unconfirmed") data.delete("confirm");
  await expect(retryIdentitySourceRevisionAction(data)).rejects.toThrow(); expect(f.retry).not.toHaveBeenCalled(); expect(f.revalidate).not.toHaveBeenCalled();
});


function capForm() { const data = form(); data.set("confirm", LEAN_COMPLETION_BUDGET_CONFIRMATION); return data; }
it("binds a separate completion cap grant to the current admin, exact plan and same origin", async () => {
  const data = capForm(); data.set("operatorId", "forged");
  await expect(authorizeLeanCompletionBudgetAction(data)).rejects.toThrow(`redirect:${destination}?completionBudget=authorized`);
  expect(f.qaAccess).toHaveBeenCalledOnce();
  expect(f.grant).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedPlanSha256: digest });
  expect(f.apply).not.toHaveBeenCalled(); expect(f.retry).not.toHaveBeenCalled();
});
it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "unconfirmed", "duplicate-id", "duplicate-plan", "duplicate-confirm", "bad-plan"])("refuses a %s completion grant", async mode => {
  const data = capForm();
  if (mode === "production") f.appEnv = "production"; if (mode === "no-admin") f.admin = null;
  if (mode === "qa-denied") f.qaAccess.mockRejectedValue(Error("synthetic denied"));
  if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid");
  if (mode === "missing-origin") f.requestHeaders.delete("origin"); if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
  if (mode === "unconfirmed") data.delete("confirm"); if (mode === "duplicate-id") data.append("gameId", "other-world");
  if (mode === "duplicate-plan") data.append("planSha256", digest); if (mode === "duplicate-confirm") data.append("confirm", LEAN_COMPLETION_BUDGET_CONFIRMATION);
  if (mode === "bad-plan") data.set("planSha256", "not-a-digest");
  await expect(authorizeLeanCompletionBudgetAction(data)).rejects.toThrow(); expect(f.grant).not.toHaveBeenCalled();
});

function capacityForm() { const data = form(); data.set("confirm", LEAN_CAPACITY_RECOVERY_CONFIRMATION); return data; }
it("binds capacity authority only to the authenticated administrator and exact same-origin plan", async () => {
  const data = capacityForm(); data.set("operatorId", "forged");
  await expect(authorizeLeanCapacityRecoveryAction(data)).rejects.toThrow(`redirect:${destination}?capacityRecovery=authorized`);
  expect(f.qaAccess).toHaveBeenCalledOnce();
  expect(f.capacity).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedPlanSha256: digest });
  expect(f.grant).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled(); expect(f.retry).not.toHaveBeenCalled();
});
it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "unconfirmed", "wrong-confirmation",
  "duplicate-id", "duplicate-plan", "duplicate-confirm", "missing-plan", "bad-plan", "invalid-id"])("refuses %s capacity authority before any grant", async mode => {
  const data = capacityForm();
  if (mode === "production") f.appEnv = "production"; if (mode === "no-admin") f.admin = null;
  if (mode === "qa-denied") f.qaAccess.mockRejectedValue(Error("synthetic denied"));
  if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid");
  if (mode === "missing-origin") f.requestHeaders.delete("origin"); if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
  if (mode === "unconfirmed") data.delete("confirm"); if (mode === "wrong-confirmation") data.set("confirm", LEAN_COMPLETION_BUDGET_CONFIRMATION);
  if (mode === "duplicate-id") data.append("gameId", "other-world"); if (mode === "invalid-id") data.set("gameId", "../../other");
  if (mode === "duplicate-plan") data.append("planSha256", digest); if (mode === "duplicate-confirm") data.append("confirm", LEAN_CAPACITY_RECOVERY_CONFIRMATION);
  if (mode === "missing-plan") data.delete("planSha256"); if (mode === "bad-plan") data.set("planSha256", "not-a-digest");
  await expect(authorizeLeanCapacityRecoveryAction(data)).rejects.toThrow();
  expect(f.capacity).not.toHaveBeenCalled(); expect(f.revalidate).not.toHaveBeenCalled();
});
it("returns a safe blocked notice for a stale or refused capacity plan without exposing private details", async () => {
  f.capacity.mockRejectedValue(Error("synthetic private financial details"));
  await expect(authorizeLeanCapacityRecoveryAction(capacityForm())).rejects.toThrow(`redirect:${destination}?capacityRecovery=blocked`);
  expect(f.capacity).toHaveBeenCalledOnce();
});


function detectivesBudgetForm() { const data = form(); data.set("confirm", DETECTIVES_COMPLETION_CONFIRMATION); data.set("ownerAuthorizationSha256", "e".repeat(64)); return data; }
it("records the explicit Detective capacity with the session administrator and exact recorded owner authorization", async () => {
  const data = detectivesBudgetForm(); data.set("operatorId", "forged-operator");
  await expect(authorizeDetectivesCompletionBudgetAction(data)).rejects.toThrow(`redirect:${destination}?detectivesBudget=authorized`);
  expect(f.qaAccess).toHaveBeenCalledOnce();
  expect(f.detectives).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedPlanSha256: digest, ownerAuthorizationSha256: "e".repeat(64) });
  expect(f.grant).not.toHaveBeenCalled(); expect(f.capacity).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "unconfirmed", "wrong-confirmation", "duplicate-id", "duplicate-plan", "duplicate-confirm", "missing-plan", "bad-plan", "invalid-id", "missing-evidence", "bad-evidence", "duplicate-evidence"])("refuses %s before authorizing Detective capacity", async mode => {
  const data = detectivesBudgetForm();
  if (mode === "production") f.appEnv = "production"; if (mode === "no-admin") f.admin = null;
  if (mode === "qa-denied") f.qaAccess.mockRejectedValue(Error("synthetic denied"));
  if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid"); if (mode === "missing-origin") f.requestHeaders.delete("origin"); if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
  if (mode === "unconfirmed") data.delete("confirm"); if (mode === "wrong-confirmation") data.set("confirm", LEAN_COMPLETION_BUDGET_CONFIRMATION);
  if (mode === "duplicate-id") data.append("gameId", "other-game"); if (mode === "duplicate-plan") data.append("planSha256", digest); if (mode === "duplicate-confirm") data.append("confirm", DETECTIVES_COMPLETION_CONFIRMATION);
  if (mode === "missing-plan") data.delete("planSha256"); if (mode === "bad-plan") data.set("planSha256", "bad"); if (mode === "invalid-id") data.set("gameId", "../../other");
  if (mode === "missing-evidence") data.delete("ownerAuthorizationSha256"); if (mode === "bad-evidence") data.set("ownerAuthorizationSha256", "bad"); if (mode === "duplicate-evidence") data.append("ownerAuthorizationSha256", "e".repeat(64));
  await expect(authorizeDetectivesCompletionBudgetAction(data)).rejects.toThrow();
  expect(f.detectives).not.toHaveBeenCalled(); expect(f.revalidate).not.toHaveBeenCalled();
});
it("reports a stale Detective plan without exposing private details", async () => {
  f.detectives.mockRejectedValue(Error("synthetic private source and ledger"));
  await expect(authorizeDetectivesCompletionBudgetAction(detectivesBudgetForm())).rejects.toThrow(`redirect:${destination}?detectivesBudget=blocked`);
});


function extensionForm() { const data = form(); data.set('confirm', DETECTIVES_EXTENSION_CONFIRMATION); data.set('ownerAuthorizationSha256', digest); return data; }
it('uses the session owner admin and fresh plan for a separate eight-dollar continuation', async () => {
  const data = extensionForm(); data.set('operatorId', 'forged');
  await expect(authorizeDetectivesCompletionExtensionAction(data)).rejects.toThrow('redirect:' + destination + '?detectivesExtension=authorized');
  expect(f.extension).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: 'game-synthetic', operatorId: 'real-session-admin', expectedPlanSha256: digest, ownerAuthorizationSha256: digest });
  expect(f.detectives).not.toHaveBeenCalled(); expect(f.capacity).not.toHaveBeenCalled();
});
it.each(['no-admin', 'qa-denied', 'production', 'cross-origin', 'missing-origin', 'cross-site', 'duplicate-id', 'duplicate-plan', 'duplicate-evidence', 'duplicate-confirm', 'bad-plan', 'missing-evidence', 'old-six-confirm', 'unconfirmed'])('refuses %s eight-dollar extension before dispatch', async mode => {
  const data = extensionForm();
  if (mode === 'no-admin') f.admin = null;
  if (mode === 'qa-denied') f.qaAccess.mockRejectedValue(Error('Synthetic QA denied'));
  if (mode === 'production') f.appEnv = 'production';
  if (mode === 'cross-origin') f.requestHeaders.set('origin', 'https://attacker.invalid');
  if (mode === 'missing-origin') f.requestHeaders.delete('origin');
  if (mode === 'cross-site') f.requestHeaders.set('sec-fetch-site', 'cross-site');
  if (mode === 'duplicate-id') data.append('gameId', 'another-game');
  if (mode === 'duplicate-plan') data.append('planSha256', digest);
  if (mode === 'duplicate-evidence') data.append('ownerAuthorizationSha256', digest);
  if (mode === 'duplicate-confirm') data.append('confirm', DETECTIVES_EXTENSION_CONFIRMATION);
  if (mode === 'bad-plan') data.set('planSha256', 'bad');
  if (mode === 'missing-evidence') data.delete('ownerAuthorizationSha256');
  if (mode === 'old-six-confirm') data.set('confirm', DETECTIVES_COMPLETION_CONFIRMATION);
  if (mode === 'unconfirmed') data.delete('confirm');
  await expect(authorizeDetectivesCompletionExtensionAction(data)).rejects.toThrow(); expect(f.extension).not.toHaveBeenCalled();
});

it('uses the session owner admin and fresh finite-tail plan for a separate ten-dollar continuation', async()=>{
 const data=extensionForm();data.set('confirm',DETECTIVES_TAIL_CONFIRMATION);data.set('operatorId','forged');
 await expect(authorizeDetectivesCompletionTailAction(data)).rejects.toThrow('redirect:'+destination+'?detectivesExtension=authorized');
 expect(f.extension).toHaveBeenCalledExactlyOnceWith({synthetic:true},{gameId:'game-synthetic',operatorId:'real-session-admin',expectedPlanSha256:digest,ownerAuthorizationSha256:digest});
});
it.each(['old-eight-confirm','cross-origin','duplicate-confirm','duplicate-plan','production','no-admin'])('refuses %s finite-tail action before dispatch',async mode=>{
 const data=extensionForm();data.set('confirm',DETECTIVES_TAIL_CONFIRMATION);
 if(mode==='old-eight-confirm')data.set('confirm',DETECTIVES_EXTENSION_CONFIRMATION);if(mode==='cross-origin')f.requestHeaders.set('origin','https://attacker.invalid');
 if(mode==='duplicate-confirm')data.append('confirm',DETECTIVES_TAIL_CONFIRMATION);if(mode==='duplicate-plan')data.append('planSha256',digest);
 if(mode==='production')f.appEnv='production';if(mode==='no-admin')f.admin=null;
 await expect(authorizeDetectivesCompletionTailAction(data)).rejects.toThrow();expect(f.extension).not.toHaveBeenCalled();
});
