/** Isolated Bar pilot, same retained-purchase and v9 painter as the game.
 * Default: free preflight. --identity buys/replays ONE identity.
 * --hides requires an explicit identity review and buys/replays at most NINE
 * first attempts. Never retries, activates, seeds a game or deploys anything. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { applyTestSchema } from "../src/lib/test-schema";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository } from "../src/services/generation/world-budget";
import { purchaseOnce } from "../src/services/generation/paid-operation";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { normalizeBoardWizardIdentity } from "../src/services/generation/board-wizard-identity";
import { QA_CHARACTER_PROMPT_VERSION, characterPrompt } from "../src/infra/generation/character-prompt";
import { LOCAL_PATCH_AGE_PROMPT_VERSION, type LocalPatchRepairCheck } from "../src/services/generation/local-patch-prompt";
import { renderLocalPatchHide } from "../src/services/generation/local-patch-render";
import { buyLocalPatch, localPatchImagePolicyForVersion, localPatchRenderPolicySha256, LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE } from "../src/infra/generation/openai-local-patch";
import { captureIdentity, imageBill, replayIdentity } from "./local-patch-style-pilot";
import { THREE_PATCH_BOARDS, ADVENTURE_THREE_BOARDS } from "../content/adventures/three-boards";

const WORLD = "adventure-bar-three-20260914-v1", CAP = 2_000_000;
const hash = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const fingerprint = (v: unknown) => hash(JSON.stringify(v));
function budget(repository: WorldBudgetRepository) {
  return new WorldBudget({transactWorld:(id,work)=>repository.transactWorld(id,tx=>work({...tx,createRequest:async request=>{
    if(id!==WORLD || auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > CAP) throw new WorldBudgetError("cap_exceeded","Isolated pilot reservation limit reached");
    return tx.createRequest(request);
  }}))});
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length>1 || args.some(a=>!["--dry-run","--identity","--hides","--repairs"].includes(a))) throw new Error("Use one explicit pilot phase");
  const phase=args[0]??"--dry-run", key=process.env.OPENAI_API_KEY;
  if(phase!=="--dry-run" && !key?.trim()) throw new Error("Existing key must be loaded by the caller");
  const root=process.cwd(), dir=path.resolve(root,"storage/adventure-bar-20260914"); mkdirSync(dir,{recursive:true});
  const photo=readFileSync("C:/GNart/Work/SmallHeroesAssets/Bar.png");
  const boards=await Promise.all(THREE_PATCH_BOARDS.map(async board=>{
    const source=readFileSync(path.join(root,board.art));
    const plan=ADVENTURE_THREE_BOARDS.boards.find(p=>p.boardSlug===board.board);
    if(plan?.status!=="ready" || hash(source)!==plan.art.sha256) throw new Error("Approved board hash mismatch");
    const meta=await sharp(source).metadata();
    if(meta.width!==3840||meta.height!==2160) throw new Error("Expected native 4K master");
    return {board,png:await sharp(source).png().toBuffer(),sourceSha256:hash(source)};
  }));
  // Healthy seated original Giza child, inspected at native resolution.
  // Identity comes ONLY from Bar's photo. This paired tile supplies mark-making.
  const styleSource={board:"adventure-giza",face:{left:2080,top:1520,width:155,height:165},context:{left:2045,top:1500,width:205,height:365}};
  const base=boards[0]!.png;
  const style=await sharp({create:{width:1024,height:1024,channels:4,background:"#e4dfd5"}}).composite([
    {input:await sharp(base).extract(styleSource.face).resize(640,960,{fit:"contain",background:"#e4dfd5"}).png().toBuffer(),left:16,top:32},
    {input:await sharp(base).extract(styleSource.context).resize(320,960,{fit:"contain",background:"#e4dfd5"}).png().toBuffer(),left:688,top:32},
  ]).png().toBuffer();
  const request={originalPhoto:photo,mimeType:"image/png",crop:null,childName:"בר",ageYears:5,styleRef:style,
    qaStyleContract:{version:"board-matched-identity/v2" as const,catalogSha256:fingerprint({styleSource,sourceSha256:boards[0]!.sourceSha256}),atlasSha256:hash(style)}};
  const policy=localPatchImagePolicyForVersion(9);
  const inputs={version:WORLD,capMicroUsd:CAP,child:{name:"בר",age:5,photoSha256:hash(photo)},styleSource,styleSha256:hash(style),
    identityPromptVersion:QA_CHARACTER_PROMPT_VERSION,identityPrompt:characterPrompt({styled:true,ageYears:5,qaStyleContractVersion:"board-matched-identity/v2"}),
    patchPromptVersion:LOCAL_PATCH_AGE_PROMPT_VERSION,renderPolicySha256:localPatchRenderPolicySha256(policy),
    boards:boards.map(({board,sourceSha256})=>({board,sourceSha256})),maxIdentityAttempts:1,maxHideAttempts:9};
  const manifestPath=path.join(dir,"inputs.json"), serialized=JSON.stringify(inputs,null,2);
  if(existsSync(manifestPath)&&readFileSync(manifestPath,"utf8")!==serialized) throw new Error("Pinned pilot inputs changed; no paid key reset permitted");
  writeFileSync(manifestPath,serialized);writeFileSync(path.join(dir,"identity-style.png"),style);
  if(phase==="--dry-run") {console.log(JSON.stringify({phase,dir,paidCalls:0,capUsd:2,identity:1,hides:9}));return;}
  if(phase==="--hides"||phase==="--repairs") {
    const review=JSON.parse(readFileSync(path.join(dir,"identity-review.json"),"utf8"));
    if(review.accepted!==true||review.inputsSha256!==hash(serialized)||!existsSync(path.join(dir,"identity.png"))||review.identitySha256!==hash(readFileSync(path.join(dir,"identity.png"))))throw new Error("Identity must be retained and visually reviewed before any hide reservation");
  }
  const dbPath=path.join(dir,"pilot.sqlite"), fresh=!existsSync(dbPath);
  const db=new PrismaClient({datasources:{db:{url:`file:${dbPath.replaceAll("\\","/")}`}}});
  try {
    if(fresh)await applyTestSchema(db,root);
    const repository=new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)),ledger=budget(repository),store=new PrismaRetainedPurchaseStore(db),deps={ledger,store};
    const provider=new OpenAiAvatarProvider(key!,{model:"gpt-image-2",quality:"medium",tries:1});
    const identity=await purchaseOnce(deps,{worldId:WORLD,requestKey:"identity:1",scope:"identity",operationFingerprint:fingerprint(inputs),reserveMicroUsd:150_000,buy:async()=>{
      if(phase!=="--identity")throw new Error("Identity must be purchased and reviewed first");
      const captured=await captureIdentity(()=>provider.createCharacter(request),globalThis.fetch),bytes=Buffer.from(JSON.stringify(captured)),evidence=imageBill(captured);
      return evidence?{bytes,evidence}:{bytes,unknownReason:"Identity receipt cannot be priced; stop without retry"};
    }});
    if(identity.kind!=="bought")throw new Error(`Identity ${identity.kind}; stop without retry`);
    const character=await replayIdentity(JSON.parse(identity.bytes.toString()),()=>provider.createCharacter(request));
    writeFileSync(path.join(dir,"identity.png"),character.sheetPng);writeFileSync(path.join(dir,"avatar.png"),character.avatarPng);
    const normalized=await normalizeBoardWizardIdentity(character.sheetPng);
    writeFileSync(path.join(dir,"identity-normalized.png"),normalized.png);
    if(phase==="--hides"||phase==="--repairs") {
      const review=JSON.parse(readFileSync(path.join(dir,"identity-review.json"),"utf8"));
      if(review.accepted!==true||review.identitySha256!==hash(character.sheetPng)||review.inputsSha256!==hash(serialized))throw new Error("Identity requires source-bound visual review");
      const judgeIdentityPng=await sharp(normalized.png).resize(256,256,{fit:"inside"}).png().toBuffer();
      const repairs=phase==='--repairs'?JSON.parse(readFileSync(path.join(dir,'repair-plan.json'),'utf8')):null;
      if(repairs&&(repairs.inputsSha256!==hash(serialized)||repairs.attempt!==2||repairs.entries.length>4))throw new Error('Invalid bounded repair plan');
      for(const {board,png} of boards) for(const hide of board.hides) {
        const repair=repairs?.entries.find((r:{hideId:string})=>r.hideId===hide.id);
        if(repairs&&!repair)continue;
        const attempt=repair?2:1;
        const repairHide=repair?.support?{...hide,placement:{...hide.placement!,support:repair.support}}:hide;
        console.log(JSON.stringify({phase:"hide-start",board:board.board,target:hide.targetId}));
        const result=await renderLocalPatchHide({...deps,renderPolicySha256:localPatchRenderPolicySha256(policy),render:input=>buyLocalPatch(key!,input,{policy})},
          {worldId:WORLD,contentVersion:9,board,hide:repairHide,composedPng:png,identityPng:normalized.png,judgeIdentityPng,referenceMode:LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE,ageYears:5,attempt,repairChecks:repair?.checks as LocalPatchRepairCheck[]|undefined,apiKey:key!});
        const name=`${board.board}-${hide.targetId}${attempt===1?'':`-attempt-${attempt}`}`;
        if(result.shippingPng)writeFileSync(path.join(dir,`${name}.png`),result.shippingPng);
        writeFileSync(path.join(dir,`${name}-technical.json`),JSON.stringify({accepted:result.accepted,refusedBecause:result.refusedBecause,renderFault:result.renderFault,seam:result.seam,compositionPermission:result.compositionPermission,stoppedReason:result.stoppedReason,costUnknown:result.costUnknown,renderCents:result.renderCents,replayed:result.replayed,visualReview:"pending"},null,2));
        if(result.costUnknown||result.refusedBecause==='stopped'||!result.shippingPng)throw new Error("Unresolved purchase or missing patch; retained evidence saved, no retry");
        console.log(JSON.stringify({phase:"hide-retained",board:board.board,target:hide.targetId,visualReview:"pending"}));
      }
    }
    const audit=await ledger.audit(WORLD);
    writeFileSync(path.join(dir,"budget.json"),JSON.stringify(audit,null,2));
    console.log(JSON.stringify({phase,dir,settledMicroUsd:audit.settledMicroUsd,reservedMicroUsd:audit.reservedMicroUsd,held:audit.held,published:false}));
  } finally {await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Isolated pilot failed");process.exitCode=1;});
