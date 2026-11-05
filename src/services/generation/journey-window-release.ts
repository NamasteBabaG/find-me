import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { detectiveSourceScopeOf } from './source-family-scope';
import { sourcePlacementSha256 as hash } from '../../domain/scene/source-placement-release';
import { JOURNEY_WINDOW_RELEASE, JOURNEY_WINDOW_MANIFEST_SHA256, JOURNEY_WINDOW_BODY_SHA256 } from '../../../content/detectives/journey-window-release-v1';

type Reader=Pick<Prisma.TransactionClient,'auditLog'>;
const action='generation:journey-window-release/v1';
export const journeyWindowReleaseId=(gameId:string)=>'aud_journey_windows_'+gameId;
const schema=z.object({version:z.literal(JOURNEY_WINDOW_RELEASE),gameId:z.string(),scopeSha256:z.string().regex(/^[a-f0-9]{64}$/),
  manifestSha256:z.literal(JOURNEY_WINDOW_MANIFEST_SHA256),bodyManifestSha256:z.literal(JOURNEY_WINDOW_BODY_SHA256),
  repeatWindowStop:z.literal('repeat-window-stop/v1'),authorizationSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type JourneyWindowPin=z.infer<typeof schema>;
const demand=(v:unknown,m:string):void=>{if(!v)throw Error('JOURNEY_WINDOWS: '+m);};
async function expected(db:Reader,gameId:string){const scope=await detectiveSourceScopeOf(db,gameId);demand(scope,'original before-photo source scope required');
  const body={version:JOURNEY_WINDOW_RELEASE,gameId,scopeSha256:scope!.scopeSha256,manifestSha256:JOURNEY_WINDOW_MANIFEST_SHA256,
    bodyManifestSha256:JOURNEY_WINDOW_BODY_SHA256,repeatWindowStop:'repeat-window-stop/v1' as const};return schema.parse({...body,authorizationSha256:hash(body)});}
/** No flag at runtime can enroll an old game. A malformed pin never falls back. */
export async function journeyWindowReleaseOf(db:Reader,gameId:string):Promise<JourneyWindowPin|null>{const row=await db.auditLog.findUnique({where:{id:journeyWindowReleaseId(gameId)}});if(!row)return null;
  const pin=schema.parse(JSON.parse(row.metaJson??'null')),want=await expected(db,gameId);
  demand(row.actorType==='SYSTEM'&&row.actorId===null&&row.action===action&&row.entityType==='Game'&&row.entityId===gameId
    &&row.metaJson===JSON.stringify(want)&&JSON.stringify(pin)===JSON.stringify(want),'foreign or changed authoring companion');return Object.freeze(want);}
/** Called only within ordinary fresh draft creation after the source scope. */
export async function pinJourneyWindowRelease(tx:Prisma.TransactionClient,gameId:string,release:typeof JOURNEY_WINDOW_RELEASE|undefined){if(release===undefined)return;
  demand(release===JOURNEY_WINDOW_RELEASE,'unsupported release');const game=await tx.game.findUniqueOrThrow({where:{id:gameId},include:{childProfile:true}});
  demand(game.status==='DRAFT'&&game.searchLevel==='detectives'&&!game.deletedAt&&!game.paidAt&&!game.readyAt&&!game.configJson
    &&!game.childProfile?.originalPhotoAssetId&&!game.childProfile?.identityAssetId&&!game.childProfile?.avatarAssetId,'prospective draft before photo only');
  demand(!await tx.order.findFirst({where:{gameId}})&&!await tx.generationJob.findFirst({where:{gameId}})
    &&!await tx.worldBudgetLedger.findUnique({where:{worldId:gameId+':board-wizard'}})
    &&!await tx.auditLog.findUnique({where:{id:'aud_source_family_'+gameId}}),'no checkout or paid work may exist');
  const pin=await expected(tx,gameId),metaJson=JSON.stringify(pin),old=await tx.auditLog.upsert({where:{id:journeyWindowReleaseId(gameId)},update:{},
    create:{id:journeyWindowReleaseId(gameId),actorType:'SYSTEM',action,entityType:'Game',entityId:gameId,metaJson}});
  demand(old.metaJson===metaJson,'conflicting authoring companion');await journeyWindowReleaseOf(tx,gameId);
}
