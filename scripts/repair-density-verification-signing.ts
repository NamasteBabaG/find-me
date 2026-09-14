/** Correct only our newly created, unused verification link. No family game writes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {env} from '../src/lib/env';
import {getContainer} from '../src/services/container';
import {tokenForLink,verifyLinkToken} from '../src/services/share-link.service';
import {hashToken} from '../src/lib/ids';
async function main(){
 const e=env();if(e.NODE_ENV==='production'||e.DATABASE_URL!=='file:C:/GNart/Work/find-me/work/adventure-three-boards-20260914/storage/adventure-three-local.sqlite')throw Error('Isolated local DB required');
 const c=getContainer(),old=JSON.parse(readFileSync('storage/adventure-three-preflight/bar-game.json','utf8')),oldToken=new URL(old.player).pathname.split('/').pop()!;
 const familyLink=await c.db.shareLink.findUniqueOrThrow({where:{id:oldToken.split('.')[0]}});if(!verifyLinkToken(c,familyLink,oldToken))throw Error('Must match unchanged family server signing configuration');
 const file='storage/adventure-density-preflight/verification-game.json',meta=JSON.parse(readFileSync(file,'utf8')),gameId='game_adventure_bar_density_verify_v3';if(meta.gameId!==gameId)throw Error('Unexpected game');
 const result=await c.db.$transaction(async tx=>{
  const game=await tx.game.findUniqueOrThrow({where:{id:gameId}});if(game.sceneCount!==9||game.status!=='DELIVERED'||game.deletedAt)throw Error('Unexpected verification game');
  const row=await tx.shareLink.findUniqueOrThrow({where:{id:new URL(meta.player).pathname.split('/').pop()!.split('.')[0]}});if(row.gameId!==gameId||!row.active)throw Error('Unexpected verification link');
  const token=tokenForLink(c,row);await tx.shareLink.update({where:{id:row.id},data:{tokenHash:hashToken(token)}});return `${c.appUrl}/play/${token}`;
 });
 writeFileSync(file,JSON.stringify({...meta,player:result},null,2));console.log(JSON.stringify({verificationOnly:true,player:result,familyUnchanged:true}));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1)});
