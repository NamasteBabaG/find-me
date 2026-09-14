import {readFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {verifyLinkToken} from '../src/services/share-link.service';
import {env} from '../src/lib/env';
async function main(){
 const db=new PrismaClient({datasources:{db:{url:'file:C:/GNart/Work/find-me/work/adventure-three-boards-20260914/storage/adventure-three-local.sqlite'}}});
 try{
 const old=JSON.parse(readFileSync('storage/adventure-three-preflight/bar-game.json','utf8'));
 const token=new URL(old.player).pathname.split('/').pop()!,row=await db.shareLink.findUniqueOrThrow({where:{id:token.split('.')[0]}});
 console.log(JSON.stringify({existingFamilyLinkMatchesCurrentEnv:verifyLinkToken({secret:env().SESSION_SECRET},row,token),existingFamilyLinkMatchesLocalDefault:verifyLinkToken({secret:'dev-only-session-secret-change-me'},row,token)}));
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Local signing inspection failed');process.exitCode=1});
