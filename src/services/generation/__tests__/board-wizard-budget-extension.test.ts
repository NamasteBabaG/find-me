import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { boardConditioningHash } from "../board-conditioned-source";
import type { Container } from "../../container";
const fakes = vi.hoisted(() => ({ appEnv: "qa" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fakes.appEnv }), spendGuard: () => ({}) }));
import { readBoardWizard, BOARD_WIZARD_STYLE, BOARD_WIZARD_SOURCE_POLICY, BOARD_WIZARD_OBSERVER_POLICY } from "../board-conditioned-wizard";
import { boardWizardBudget } from "../board-wizard-budget";
import { authorizeBoardWizardBudgetExtension, prepareBoardWizardBudgetExtension, readBoardWizardBudgetExtension, boardWizardBudgetExtensionAuditId, BOARD_WIZARD_BUDGET_EXTENSION_ACTION } from "../board-wizard-budget-extension";
let scratch: string, db: PrismaClient, serial = 0;
const hash = boardConditioningHash, catalog = JSON.parse(readFileSync(path.resolve("content/board-conditioned-qa/catalog.json"), "utf8"));
const yes = { verifyExplicitUserAuthorization: async () => true };
beforeAll(async () => {
 scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-budget-extension-"));
 db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
 await applyTestSchema(db);
});
beforeEach(() => { fakes.appEnv = "qa"; vi.stubGlobal("fetch", vi.fn(() => { throw Error("No network permitted"); })); });
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect(); const resolved = realpathSync(scratch);
 if (path.dirname(resolved) === realpathSync(tmpdir()) && path.basename(resolved).startsWith("findme-budget-extension-")) rmSync(resolved, { recursive: true, force: true }); });
async function fixture(approveUnknown = true) {
 const gameId=`extension-${++serial}`, ownerId=`${gameId}-owner`, childId=`${gameId}-child`, identityId=`${gameId}-identity`, worldId=`${gameId}:board-wizard`;
 await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid` } });
 await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 5, identityAssetId: identityId, avatarAssetId: `${gameId}-avatar` } });
 await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, status: "MANUAL_REVIEW", styleVersion: BOARD_WIZARD_STYLE, paidAt: new Date(), packageTier: "ONE_WORLD", sceneCount: 9 } });
 await db.order.create({ data: { id: `${gameId}-order`, userId: ownerId, gameId, paymentStatus: "PAID", paidAt: new Date(), amountAgorot: 5900, provider: "synthetic", packageTier: "ONE_WORLD" } });
 const record={ version:"board-conditioned-wizard/v1",gameId,ownerId,childProfileId:childId,childName:"Synthetic",ageYears:5,identityAssetId:identityId,avatarAssetId:`${gameId}-avatar`,
  identitySha256:hash("identity"),identitySourceSha256:hash("sheet"),identityNormalization:"illustrated-sheet-portrait-gray512/v1",catalog,catalogSha256:hash(catalog),capMicroUsd:4_000_000,
  sourcePolicySha256:hash(BOARD_WIZARD_SOURCE_POLICY),observerPolicySha256:hash(BOARD_WIZARD_OBSERVER_POLICY),
  boards:catalog.boards.map((b:{boardId:string})=>({boardId:b.boardId,state:"pending",attempts:1,reason:null,assetIds:[],visual:[]})),state:"held",automaticRelease:false };
 const stepsJson=JSON.stringify({ boardWizard:record });
 await db.generationJob.create({ data: { id:`job_${gameId}`,gameId,status:"DONE",stepsJson,lastError:"WorldBudgetError: Reservation exceeds the inclusive four-dollar QA world ceiling" } });
 const c={db,storage:new DbStorage(db)} as unknown as Container;
 const repo=new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
 const budget=boardWizardBudget(repo,1,{authorizeUnknownContinuation:async()=>true});
 await budget.importSettled(worldId,{scope:"identity",operationFingerprint:hash("identity"),evidence:{providerNamespace:"test",providerRequestId:gameId,usageId:gameId,rawUsage:{tokens:1},model:"test",amountMicroUsd:3_300_000,costBasis:"provider-billed"}});
 const reserve={requestKey:"board:newyork:measure:1",scope:"judge" as const,operationFingerprint:hash("unknown"),reserveMicroUsd:400_000};
 await budget.reserve(worldId,reserve);await budget.markUnknown(worldId,reserve.requestKey,"retained-unknown");
 if(approveUnknown)await budget.authorizeUnknownContinuation(worldId,{...reserve,approvalId:`${gameId}-original-unknown-grant`,operatorId:"test-system",unknownReasons:["retained-unknown"],authorizationSha256:hash("oldgrant"),authorizedAt:"2026-09-10T00:00:00.000Z"});
 const stored=(await new PrismaWorldBudgetStore(db).read(worldId))!;
 const input={gameId,expectedStepsSha256:hash(stepsJson),expectedLedgerSha256:hash(stored.snapshot),authorizationEvidenceSha256:hash("explicit user request to finish and increase cap if needed"),systemOperatorId:"codex:user-authorized",authorizedAt:"2026-09-10T01:00:00.000Z"};
 return {c,gameId,ownerId,childId,worldId,input,repo,budget};
}
describe("single-game explicit SYSTEM five-dollar extension",()=>{
 it("qualifies a refused observation only when its unchanged missing request exceeds4 but fits5",async()=>{
  const f=await fixture(),job=await db.generationJob.findUniqueOrThrow({where:{id:`job_${f.gameId}`}}),envelope=JSON.parse(job.stepsJson);
  const board=envelope.boardWizard.boards.find((b:{boardId:string})=>b.boardId==='sydney');
  board.attempts=2;board.awaitingMeasurement=true;
  const stepsJson=JSON.stringify(envelope);
  await db.generationJob.update({where:{id:job.id},data:{stepsJson,lastError:'WorldBudgetError: Board observation reservation refused'}});
  f.input.expectedStepsSha256=hash(stepsJson);
  const plan=await prepareBoardWizardBudgetExtension(f.c,f.input,yes);
  expect(plan.receipt.refusedReservation).toEqual({requestKey:'attempt-2:board:sydney:measure:1',reserveMicroUsd:400_000});
  await authorizeBoardWizardBudgetExtension(f.c,f.input,yes);
  const updated=readBoardWizard((await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).stepsJson).boards.find(b=>b.boardId==='sydney');
  expect(updated).toMatchObject({attempts:2,awaitingMeasurement:true});
 });
 it("preserves every original charge/unknown and base cap, then allows only this world's expanded reservation",async()=>{
  const f=await fixture(), before=(await new PrismaWorldBudgetStore(db).read(f.worldId))!;
  expect(await readBoardWizardBudgetExtension(f.c,f.worldId)).toBeNull();
  await expect(f.budget.reserve(f.worldId,{requestKey:"next",scope:"judge",operationFingerprint:hash("next"),reserveMicroUsd:400_000})).rejects.toMatchObject({code:"cap_exceeded"});
  const result=await authorizeBoardWizardBudgetExtension(f.c,f.input,yes);
  const after=(await new PrismaWorldBudgetStore(db).read(f.worldId))!;
  expect(after.snapshot).toEqual(before.snapshot);expect(after.revision).toBe(before.revision+1);
  expect(readBoardWizard((await db.generationJob.findUniqueOrThrow({where:{id:`job_${f.gameId}`}})).stepsJson)).toMatchObject({state:"running",capMicroUsd:4_000_000});
  const audit=await db.auditLog.findUniqueOrThrow({where:{id:boardWizardBudgetExtensionAuditId(f.worldId)}});
  expect(audit).toMatchObject({actorType:"SYSTEM",actorId:null,action:BOARD_WIZARD_BUDGET_EXTENSION_ACTION});
  expect(result).toMatchObject({capMicroUsd:5_000_000,automaticRelease:false});
  const extended=boardWizardBudget(f.repo,1,{},w=>readBoardWizardBudgetExtension(f.c,w));
  expect(await extended.audit(f.worldId)).toMatchObject({capMicroUsd:5_000_000,committedMicroUsd:3_700_000,reservedMicroUsd:400_000,remainingMicroUsd:1_300_000});
  await extended.reserve(f.worldId,{requestKey:"next",scope:"judge",operationFingerprint:hash("next"),reserveMicroUsd:400_000});
  await expect(extended.reserve(f.worldId,{requestKey:"over-five",scope:"image",operationFingerprint:hash("five"),reserveMicroUsd:1_000_000})).rejects.toMatchObject({code:"cap_exceeded"});
  expect(await readBoardWizardBudgetExtension(f.c,`${f.gameId}-other:board-wizard`)).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
 });
 it.each(["unapproved-unknown","unverified-grant","stale-steps","stale-ledger","refunded","production","active-job","unrelated-hold"])("refuses %s without changing anything",async kind=>{
  const f=await fixture(kind!=="unapproved-unknown"), before=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}});
  if(kind==="stale-steps")f.input.expectedStepsSha256="f".repeat(64);
  if(kind==="stale-ledger")f.input.expectedLedgerSha256="f".repeat(64);
  if(kind==="refunded")await db.order.update({where:{id:`${f.gameId}-order`},data:{paymentStatus:"REFUNDED",refundedAt:new Date()}});
  if(kind==="production")fakes.appEnv="production";
  if(kind==="active-job")await db.generationJob.update({where:{id:`job_${f.gameId}`},data:{status:"RUNNING"}});
  if(kind==="unrelated-hold")await db.generationJob.update({where:{id:`job_${f.gameId}`},data:{lastError:"Identity was changed"}});
  await expect(authorizeBoardWizardBudgetExtension(f.c,f.input,kind==="unverified-grant"?{verifyExplicitUserAuthorization:async()=>false}:yes)).rejects.toThrow();
  expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}})).toEqual(before);
  expect(await db.auditLog.count({where:{entityId:f.gameId,action:BOARD_WIZARD_BUDGET_EXTENSION_ACTION}})).toBe(0);
 });
 it("rejects deletion between read-only plan and transactional publication",async()=>{
  const f=await fixture(),before=(await new PrismaWorldBudgetStore(db).read(f.worldId))!;
  const authority={verifyExplicitUserAuthorization:async()=>{await db.game.update({where:{id:f.gameId},data:{status:"DELETED",deletedAt:new Date()}});return true;}};
  await expect(authorizeBoardWizardBudgetExtension(f.c,f.input,authority)).rejects.toThrow();
  expect((await new PrismaWorldBudgetStore(db).read(f.worldId))!).toEqual(before);
  expect(await db.auditLog.count({where:{entityId:f.gameId,action:BOARD_WIZARD_BUDGET_EXTENSION_ACTION}})).toBe(0);
 });
 it("rolls back the entire grant if audit persistence fails",async()=>{
  const f=await fixture(),before=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}});
  await db.$executeRawUnsafe("CREATE TRIGGER fail_cap_grant BEFORE INSERT ON AuditLog WHEN NEW.action='board-wizard:budget-extension-authorized' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  try{await expect(authorizeBoardWizardBudgetExtension(f.c,f.input,yes)).rejects.toThrow();}finally{await db.$executeRawUnsafe("DROP TRIGGER fail_cap_grant");}
  expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}})).toEqual(before);
  expect((await db.game.findUniqueOrThrow({where:{id:f.gameId}})).status).toBe("MANUAL_REVIEW");
 });
 it("creates a read-only CAS plan but cannot stack or overwrite an existing grant",async()=>{
  const f=await fixture(),before=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}});
  const plan=await prepareBoardWizardBudgetExtension(f.c,f.input,yes);
  expect(plan.auditLog.actorId).toBeNull();expect(plan.receipt.retainedUnknownRequests).toHaveLength(1);
  expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:f.worldId}})).toEqual(before);
  await authorizeBoardWizardBudgetExtension(f.c,f.input,yes);
  const job=await db.generationJob.findUniqueOrThrow({where:{id:`job_${f.gameId}`}}),ledger=(await new PrismaWorldBudgetStore(db).read(f.worldId))!;
  await expect(authorizeBoardWizardBudgetExtension(f.c,{...f.input,expectedStepsSha256:hash(job.stepsJson),expectedLedgerSha256:hash(ledger.snapshot)},yes)).rejects.toThrow("single cap extension");
 });
 it("detects edited receipts and grants bound to another world",async()=>{
  const f=await fixture();await authorizeBoardWizardBudgetExtension(f.c,f.input,yes);
  const row=await db.auditLog.findUniqueOrThrow({where:{id:boardWizardBudgetExtensionAuditId(f.worldId)}}),receipt=JSON.parse(row.metaJson!);receipt.capMicroUsd=6_000_000;
  await db.auditLog.update({where:{id:row.id},data:{metaJson:JSON.stringify(receipt)}});
  await expect(readBoardWizardBudgetExtension(f.c,f.worldId)).rejects.toThrow();
  const wrong=boardWizardBudget(f.repo,1,{},async()=>({worldId:"other",capMicroUsd:5_000_000,authorizationSha256:hash("wrong")}));
  await expect(wrong.reserve(f.worldId,{requestKey:"wrong",scope:"judge",operationFingerprint:hash("wrong"),reserveMicroUsd:400_000})).rejects.toThrow("exact world");
 });
});
