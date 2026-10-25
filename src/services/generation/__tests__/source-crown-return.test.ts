import { describe,it,expect } from "vitest";
import sharp from "sharp";
import { SOURCE_CROWN_RETURN_CONTRACTS,sourceCrownContractFor,sourceCrownReturned,sourceCrownCorrectionSchema } from "../../../domain/scene/source-crown-return";
import { authoredLocalPatchReturnContract } from "../../../domain/scene/local-patch-return-region";
import { sourcePlacementSha256 as hash,sourcePlacementRecoveryGeometryAllowed } from "../../../domain/scene/source-placement-release";
import { prepareSourceNeighborContract } from "../../../domain/scene/local-patch-source-neighbors";
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE } from "../../../../content/detectives/source-placement-release";
import { composeSourceCrown } from "../source-crown-compose";
import { readShippedBoardArt } from "../local-patch-hide";
import { sha256Bytes as sha } from "../fixed-sprite";
const parentOf=(c:typeof SOURCE_CROWN_RETURN_CONTRACTS[number])=>authoredLocalPatchReturnContract({contentVersion:13,boardId:c.boardId,hideId:c.hideId,source:{art:`public/scenes/journey-${c.boardId}-detectives-v${c.boardId==='amazon'?3:4}/base.webp`,sha256:c.sourceSha256,width:3840,height:2160},crop:c.crop,child:c.child,authored:c.parentReturned,sourcePlacement:{manifestSha256:"a".repeat(64),basePlacementSha256:"b".repeat(64)}});
describe("source-qualified crown band with unchanged v4 and subset guards",()=>{
 it.each(SOURCE_CROWN_RETURN_CONTRACTS)("authenticates $boardId pixels and a single deterministic top band",async c=>{
  const parent=parentOf(c),before=await readShippedBoardArt(parent.source.art,parent.source.sha256);expect(sourceCrownContractFor(parent)).toEqual(c);
  expect(sha(await sharp(before).ensureAlpha().raw().toBuffer())).toBe(c.sourcePixelsSha256);
  const cap=await sharp({create:{width:42,height:64,channels:4,background:"#663322"}}).png().toBuffer(),raw=await sharp(before).extract(c.crop).composite([{input:cap,left:c.child.left+30,top:c.parentReturned.top-22}]).png().toBuffer();
  const one=await composeSourceCrown(before,raw,parent),again=await composeSourceCrown(before,raw,parent);expect(one).not.toBeNull();expect(again!.proof).toEqual(one!.proof);
  expect(one!.proof).toMatchObject({outsideReturnChangedPixels:0,changedBelowBandPixels:0,unchangedBelowTop:c.parentReturned.top+12,returned:c.returned});expect(one!.shipping.equals(one!.baseline)).toBe(false);
  const pixels=await sharp(one!.shipping).ensureAlpha().raw().toBuffer(),baseline=await sharp(one!.baseline).ensureAlpha().raw().toBuffer();expect(pixels.subarray((c.parentReturned.top+12)*512*4).equals(baseline.subarray((c.parentReturned.top+12)*512*4))).toBe(true);
  const changedSource=await sharp(before).composite([{input:await sharp({create:{width:1,height:1,channels:4,background:"red"}}).png().toBuffer(),left:0,top:0}]).png().toBuffer();expect(await composeSourceCrown(changedSource,raw,parent)).toBeNull();
 },120000);
 it.each(SOURCE_CROWN_RETURN_CONTRACTS)("qualifies $boardId against every original neighboring head while old shrink-only recovery still refuses expansion",c=>{
  const entry=DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(e=>e.hideId===c.hideId)!;expect(entry).toBeDefined();
  expect(sourcePlacementRecoveryGeometryAllowed(entry,{crop:c.crop,child:c.child,returnRect:c.returned})).toBe(false);
  const context={boardId:c.boardId,hideId:c.hideId,source:entry.source,crop:c.crop,returnRect:c.returned};const prepared=prepareSourceNeighborContract({...entry.sourceNeighbors!.contract,...context},context);expect(prepared.ok).toBe(true);
 });
 it.each(["source","crop","child","parent-return","family","unbound","art","source-dimensions"])("refuses an alternate %s before making a candidate",fault=>{
  const p=structuredClone(parentOf(SOURCE_CROWN_RETURN_CONTRACTS[0]));if(fault==='source')p.source.sha256='f'.repeat(64);if(fault==='crop')p.crop.top++;if(fault==='child')p.child.height--;if(fault==='parent-return')p.local.top--;if(fault==='family')p.contentVersion=12;if(fault==='unbound')delete p.sourcePlacement;if(fault==='art')p.source.art='public/scenes/foreign/base.webp';if(fault==='source-dimensions')p.source.width--;expect(sourceCrownContractFor(p)).toBeNull();
 });
 it("requires the exact declared return, parent and first three paid attempts",()=>{
  const c=SOURCE_CROWN_RETURN_CONTRACTS[0],parent=parentOf(c),p={version:'source-crown-return/v1',contractSha256:hash(c),parentSha256:hash(parent),gameId:'synthetic-world',rowId:'synthetic-row',attempt:3,sourceRequestKey:'synthetic-render',sourceFingerprint:'a'.repeat(64),sourcePayloadSha256:'b'.repeat(64),normalizedRawSha256:'c'.repeat(64),sourcePngSha256:'d'.repeat(64),baselineImageSha256:'e'.repeat(64),imageSha256:'f'.repeat(64),identitySha256:'a'.repeat(64),returned:c.returned,outsideReturnChangedPixels:0,unchangedBelowTop:c.parentReturned.top+12,changedBelowBandPixels:0};
  expect(sourceCrownReturned(parent,p)).toEqual(c.returned);expect(sourceCrownReturned(parent,{...p,returned:{...c.returned,top:c.returned.top-1}})).toBeNull();expect(sourceCrownReturned(parent,{...p,contractSha256:'f'.repeat(64)})).toBeNull();expect(sourceCrownCorrectionSchema.safeParse({...p,attempt:4}).success).toBe(false);expect(sourceCrownCorrectionSchema.safeParse({...p,changedBelowBandPixels:1}).success).toBe(false);
 });
});
