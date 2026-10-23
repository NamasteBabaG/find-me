import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "../local-patch-hide";
import { bill, seedApprovedGame } from "./local-patch-fixtures";

// Only the diagnostic/painter checkpoint and visual services are controlled.
// Job claims, transactions, the world ledger, reservation refusal and scheduler are real.
// No identity or artwork is approved by this scheduler regression.
const controlled = vi.hoisted(() => ({ step: vi.fn(), review: vi.fn(), generationEnabled: "on" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: controlled.generationEnabled,
  GENERATION_DAILY_CENTS: 0 }), spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: [] }),
  flag: () => false, adminEmails: () => [] }));
vi.mock("../lean-enrollment", () => ({ enrollLeanWorld: async () => ({ state: "not-lean" }) }));
vi.mock("../local-patch-recompose", () => ({ localPatchNeedsRecomposition: () => false, recomposeLocalPatchHide: vi.fn() }));
vi.mock("../local-patch-self-repair", async importOriginal => ({
  ...await importOriginal<typeof import("../local-patch-self-repair")>(), runLocalPatchSelfRepair: controlled.step,
}));
vi.mock("../local-patch-board-review", async importOriginal => ({
  ...await importOriginal<typeof import("../local-patch-board-review")>(), reviewLocalPatchBoard: controlled.review,
}));
// The regression concerns a fixed, already authorized ceiling, with no new grant.
vi.mock("../local-patch-budget-recovery", async importOriginal => ({
  ...await importOriginal<typeof import("../local-patch-budget-recovery")>(), activateLocalPatchEmergencyBudget: async () => false,
}));
let directory: string, db: PrismaClient, c: Container;
const slugs = new Set(boardsOfWorlds(["journey"]));
const boards = localPatchBoardsForVersion(12).filter(b => slugs.has(b.board));
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-budget-checkpoint-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory,"test.db").replaceAll("\\","/") + "?connection_limit=1" } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), analytics: { track: vi.fn() } } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live network forbidden in budget checkpoint regression"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-budget-checkpoint-")) rmSync(directory, { recursive:true });
});
async function fixture(id: string, advance: boolean) {
  const seeded = await seedApprovedGame(c,db,{gameId:id,approved:false,status:"TARGETS_GENERATING",styleVersion:LOCAL_PATCH_STYLE,
    withJob:true,scenes:boards.map(b=>({slug:b.board,version:12}))});
  await db.game.update({where:{id},data:{paidAt:new Date()}});
  await db.order.create({data:{id:"ord-"+id,gameId:id,userId:seeded.userId,provider:"mock",packageTier:"ONE_WORLD",
    amountAgorot:3900,paymentStatus:"PAID",paidAt:new Date()}});
  for(const b of boards) for(const h of b.hides) {
    const targetId="target-"+id+"-"+h.id;
    await db.targetInstance.create({data:{id:targetId,gameSceneId:"gsc-"+id+"-"+b.board,targetId:h.targetId,targetType:"child",slotAId:h.id,slotBId:h.id}});
    await db.targetVariantAsset.create({data:{id:"variant-"+id+"-"+h.id,targetInstanceId:targetId,slotId:h.id,
      variant:LOCAL_PATCH_VARIANT,provider:LOCAL_PATCH_PROVIDER,status:"FAILED",attempts:2,
      lastError:"quality-retry: synthetic composition clipping",
      judgeJson:JSON.stringify({reviewState:"board-review-complete",qualityDisposition:{state:"retry",faults:["childComplete"]},
        selfRepair:{version:"local-patch-self-repair/v1",cycle:1,phase:"diagnosing"}})}});
  }
  const budget=boardWizardBudgetOf(c), worldId=boardWizardWorldId(id), cap=(await budget.audit(worldId)).capMicroUsd;
  await budget.importSettled(worldId,{scope:"image",operationFingerprint:"synthetic-past-"+id,evidence:bill("past-"+id,cap-260_000)});
  const selected=boards[0]!.hides[0]!, selectedId="variant-"+id+"-"+selected.id;
  let moved=false, painted=false;
  controlled.review.mockResolvedValue({state:"pending",costCents:0});
  controlled.step.mockImplementation(async (_:Container,input:{hide:{id:string}})=>{
    if(input.hide.id===selected.id && !moved && advance) {
      await budget.reserve(worldId,{requestKey:"diagnosis",scope:"judge",operationFingerprint:"diagnosis-"+id,reserveMicroUsd:250_000});
      await budget.settle(worldId,"diagnosis",bill("diagnosis-"+id,50_000));
      const row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:selectedId}}), receipt=JSON.parse(row.judgeJson!);
      await db.targetVariantAsset.update({where:{id:selectedId},data:{judgeJson:JSON.stringify({...receipt,selfRepair:{...receipt.selfRepair,phase:"applying"}})}});
      moved=true; return;
    }
    if(input.hide.id===selected.id && moved && !painted && advance) {
      await budget.reserve(worldId,{requestKey:"saved-plan-paint",scope:"image",operationFingerprint:"paint-"+id,reserveMicroUsd:120_000});
      await budget.settle(worldId,"saved-plan-paint",bill("paint-"+id,40_000));
      const row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:selectedId}}),receipt=JSON.parse(row.judgeJson!);
      await db.targetVariantAsset.update({where:{id:selectedId},data:{status:"GENERATED",
        judgeJson:JSON.stringify({...receipt,selfRepair:{...receipt.selfRepair,phase:"awaiting-review"}})}});
      painted=true; return;
    }
    await budget.reserve(worldId,{requestKey:"unaffordable-"+input.hide.id,scope:"judge",operationFingerprint:"next-"+input.hide.id,reserveMicroUsd:300_000});
  });
  return {id,budget,worldId,cap,selectedId};
}
const deps={renderPolicySha256:"f".repeat(64),render:vi.fn(async()=>{throw Error("Unexpected painter");}),
  judge:vi.fn(async()=>{throw Error("Unexpected per-hide review");}),readBoardArt:vi.fn(async()=>{throw Error("Unexpected artwork read");})};
describe("deferred budget refusal after committed repair progress",()=>{
  it("keeps a newly paid applying checkpoint queued instead of parking on another repair's refused diagnosis",async()=>{
    const f=await fixture("checkpoint-advanced-synthetic",true);
    const result=await runLocalPatchWorldSlice(c,deps,f.id,{maxHides:2,hardDeadlineAt:Date.now()+270_000});
    expect(JSON.parse((await db.targetVariantAsset.findUniqueOrThrow({where:{id:f.selectedId}})).judgeJson!).selfRepair.phase).toBe("applying");
    expect((await f.budget.audit(f.worldId)).remainingMicroUsd).toBe(210_000);
    expect(result.attention).toBeNull();
    expect(result.pending).toBe(true);
    expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.id}})).toMatchObject({status:"QUEUED",currentStep:"local-patch"});
    // A fresh ordinary slice can buy the cheaper next phase. No cap change or
    // second diagnosis is needed, and the pixels still await independent review.
    const next=await runLocalPatchWorldSlice(c,deps,f.id,{maxHides:2,hardDeadlineAt:Date.now()+270_000});
    expect(next.pending).toBe(true); expect(next.attention).toBeNull();
    expect(await f.budget.readRequest(f.worldId,"saved-plan-paint")).toMatchObject({scope:"image",state:"settled",reserveMicroUsd:120_000});
    expect(await f.budget.audit(f.worldId)).toMatchObject({capMicroUsd:f.cap,remainingMicroUsd:170_000,overCapMicroUsd:0});
    expect(fetch).not.toHaveBeenCalled();
  },60_000);
  it("parks a genuinely unchanged refusal without an extra waiting loop",async()=>{
    const f=await fixture("checkpoint-unchanged-synthetic",false);
    const result=await runLocalPatchWorldSlice(c,deps,f.id,{maxHides:2,hardDeadlineAt:Date.now()+270_000});
    expect(result.pending).toBe(false); expect(result.attention).toContain("authorized world budget");
    expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.id}})).toMatchObject({status:"FAILED",currentStep:"local-patch:recovery-exhausted"});
    expect((await f.budget.audit(f.worldId)).remainingMicroUsd).toBe(260_000);
    expect(fetch).not.toHaveBeenCalled();
  },60_000);
});
