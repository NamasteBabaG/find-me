import { describe, expect, it } from 'vitest';
import { detectivesOperationalQualified, detectivesOperationalReceiptSchema, sourceBodyBirthMarkerSchema, SOURCE_BODY_BIRTH_VERSION } from '../detectives-operational-policy';
describe('prospective Detective policy boundaries', () => {
 const config={appEnv:'qa',promptRelease:'v19',identitySource:'full-source-v1',reviewRelease:'local-patch-dual-high/v3',leanRelease:'local-patch-lean/v1'};
 it('selects the new policy only for the qualified QA source and review configuration',()=>{
  expect(detectivesOperationalQualified(config)).toBe(true);
  for(const [key,value] of Object.entries({appEnv:'production',promptRelease:'v18',identitySource:'legacy',reviewRelease:'local-patch-dual-high/v2',leanRelease:undefined})) expect(detectivesOperationalQualified({...config,[key]:value})).toBe(false);
 });
 it('cannot describe a higher cap, two routine opinions, HIGH effort or a fourth normal image',()=>{
  const valid={version:'detectives-operational/v1',gameId:'synthetic-policy',worldId:'synthetic-policy:board-wizard',sourceFamilySha256:'a'.repeat(64),sourcePlacementManifestSha256:'b'.repeat(64),sourceBodyManifestSha256:'c'.repeat(64),reviewMode:'single-sol-low/v1',model:'gpt-6.1-sol',effort:'low',initialTier:'flex',oneUsableAssessmentPerImage:true,normalImageAttemptLimit:3,worldCapMicroUsd:4000000,automaticBudgetExtension:false,authorizationSha256:'d'.repeat(64)};
  expect(detectivesOperationalReceiptSchema.safeParse(valid).success).toBe(true);
  for(const change of [{worldCapMicroUsd:10000000},{oneUsableAssessmentPerImage:false},{effort:'high'},{normalImageAttemptLimit:4},{automaticBudgetExtension:true}])expect(detectivesOperationalReceiptSchema.safeParse({...valid,...change}).success).toBe(false);
  const marker={version:SOURCE_BODY_BIRTH_VERSION,policySha256:'a'.repeat(64),manifestSha256:'b'.repeat(64),rowId:'synthetic-row',hideId:'giza-detectives-hide-2',attempt:1};
  expect(sourceBodyBirthMarkerSchema.safeParse(marker).success).toBe(true);
  for(const attempt of [0,4,-1,1.5])expect(sourceBodyBirthMarkerSchema.safeParse({...marker,attempt}).success).toBe(false);
 });
});
