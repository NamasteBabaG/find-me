import { describe, expect, it } from "vitest";
import { WorldBudget, type WorldAutomaticReviewRecoveryV5Input } from "../world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../../infra/db/world-budget-repository";
import { localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
function repository() {
  const rows = new Map<string, VersionedWorldBudgetSnapshot>();
  const store: AtomicWorldBudgetStore = {
    read: async id => structuredClone(rows.get(id) ?? null),
    insertIfAbsent: async (id, snapshot) => { if (rows.has(id)) return false; rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true; },
    compareAndSwap: async (id, revision, snapshot) => {
      if (rows.get(id)?.revision !== revision) return false;
      rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true;
    },
  };
  return { rows, repository: new CasWorldBudgetRepository(store) };
}
const input=(n=1):WorldAutomaticReviewRecoveryV5Input=>({requestKey:"self-repair:board:amazon:"+n.toString(16).padStart(64,"0"),operationFingerprint:n.toString(16).padStart(64,"0"),scope:"judge",reserveMicroUsd:210_553,
 approvalId:"single-low-"+n,unknownReasons:["no usable response"],policyId:"single-sol-low-transport-recovery/v1",grantSha256:"a".repeat(64),variantId:"synthetic-row-"+n,imageSha256:n.toString(16).padStart(64,"0"),authorizationSha256:"b".repeat(64),authorizedAt:"2026-10-23T00:00:00.000Z"});
async function fixture(){const r=repository(),budget=new WorldBudget(r.repository,{authorizeAutomaticReviewRecoveryV5:async()=>true});const i=input();await budget.reserve("world",i);await budget.markUnknown("world",i.requestKey,"no usable response");return{...r,budget,i};}
describe("LOW no-answer accounting",()=>{
 it("preserves the exact dynamic reservation and idempotent approval; publication needs the explicit callback",async()=>{const f=await fixture(),before=await f.budget.readRequest("world",f.i.requestKey);expect(await f.budget.authorizeAutomaticReviewRecoveryV5("world",f.i)).toMatchObject({acquired:true});expect(await f.budget.authorizeAutomaticReviewRecoveryV5("world",f.i)).toMatchObject({acquired:false});expect(await f.budget.readRequest("world",f.i.requestKey)).toEqual(before);expect(await f.budget.audit("world")).toMatchObject({held:false,reservedMicroUsd:210_553,settledMicroUsd:0});expect(await localPatchBudgetReadyForPublication(f.budget,"world",13,{reviewRecoveryV3:true})).toBe(false);expect(await localPatchBudgetReadyForPublication(f.budget,"world",13,{reviewRecoveryV3:true,singleLowContinuation:async()=>true})).toBe(true);expect(await localPatchBudgetReadyForPublication(f.budget,"world",12,{reviewRecoveryV3:true,singleLowContinuation:async()=>true})).toBe(false);});
 it("requires the trusted resolver and exact unknown-reason history",async()=>{const f=await fixture();await expect(new WorldBudget(f.repository).authorizeAutomaticReviewRecoveryV5("world",f.i)).rejects.toMatchObject({code:"invalid_input"});await expect(f.budget.authorizeAutomaticReviewRecoveryV5("world",{...f.i,unknownReasons:["changed"]})).rejects.toMatchObject({code:"key_conflict"});});
 it.each([0,250_001,210_552])("never lowers or exceeds the captured reserve (%s)",async n=>{const f=await fixture();await expect(f.budget.authorizeAutomaticReviewRecoveryV5("world",{...f.i,reserveMicroUsd:n})).rejects.toBeInstanceOf(Error);expect((await f.budget.audit("world")).held).toBe(true);});
 it("allows one unanswered retry per image and five per world",async()=>{const f=await fixture();await f.budget.authorizeAutomaticReviewRecoveryV5("world",f.i);for(let n=2;n<=6;n++){const i=input(n);await f.budget.reserve("world",i);await f.budget.markUnknown("world",i.requestKey,"no usable response");if(n===6)await expect(f.budget.authorizeAutomaticReviewRecoveryV5("world",i)).rejects.toMatchObject({code:"invalid_snapshot"});else await f.budget.authorizeAutomaticReviewRecoveryV5("world",i);}const g=await fixture();await g.budget.authorizeAutomaticReviewRecoveryV5("world",g.i);const second={...input(2),variantId:g.i.variantId,imageSha256:g.i.imageSha256};await g.budget.reserve("world",second);await g.budget.markUnknown("world",second.requestKey,"no usable response");await expect(g.budget.authorizeAutomaticReviewRecoveryV5("world",second)).rejects.toMatchObject({code:"invalid_snapshot"});});
});
