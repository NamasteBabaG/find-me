/** Bounded attempt-one orchestration of the EXISTING paid painter. No hidden
 * retries, no new API transport, no asset publication. Failed candidates stay failed.
 */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {applyTestSchema} from '../src/lib/test-schema';
import {TWO_WORLD_PATCH_BOARDS,TWO_WORLD_STORAGE} from '../content/adventures/two-worlds-production';
async function run(script:string,args:string[]){
  return await new Promise<number>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx',script,...args],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stdout.on('data',b=>process.stdout.write(b));
    // Script errors deliberately contain no environment values or provider headers.
    child.stderr.on('data',b=>process.stderr.write(b));
    child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
}
async function main(){
  const phase=process.argv[2];if(!phase||!['--pin','--render-first'].includes(phase))throw Error('Use --pin or --render-first');
  mkdirSync(TWO_WORLD_STORAGE,{recursive:true});
  if(phase==='--pin'){
    for(const b of TWO_WORLD_PATCH_BOARDS)if(await run('scripts/magic-bar-pilot.ts',['--two-worlds',b.board,'--dry-run']))throw Error(`Pin failed: ${b.board}`);
    const file=path.resolve(TWO_WORLD_STORAGE,'purchases.sqlite');
    if(!existsSync(file)){const db=new PrismaClient({datasources:{db:{url:`file:${file.replaceAll('\\','/')}`}}});try{await applyTestSchema(db,process.cwd());}finally{await db.$disconnect();}}
    return;
  }
  for(const b of TWO_WORLD_PATCH_BOARDS)if(!existsSync(`${TWO_WORLD_STORAGE}/${b.board}/inputs.json`))throw Error('Pin every source before paid work');
  if(!process.env.OPENAI_API_KEY){
    for(const file of ['C:/GNart/Work/find-me/.env.local','C:/GNart/Work/find-me/.env']){
      if(!existsSync(file))continue;
      const match=readFileSync(file,'utf8').match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
      if(match){process.env.OPENAI_API_KEY=match[1]!.trim().replace(/^['"]|['"]$/g,'');break;}
    }
  }
  if(!process.env.OPENAI_API_KEY)throw Error('Existing authorized key is unavailable');
  const pending=TWO_WORLD_PATCH_BOARDS.flatMap(b=>b.hides.map(h=>({board:b.board,hide:h.id})));
  const statuses:{board:string;hide:string;code:number;accepted:boolean}[]=[];
  let next=0,stop=false;
  const worker=async()=>{
    while(!stop){const item=pending[next++];if(!item)return;
      const code=await run('scripts/magic-bar-pilot.ts',['--two-worlds',item.board,'--render',item.hide,'1']);
      const resultPath=`${TWO_WORLD_STORAGE}/${item.board}/${item.hide}-attempt-1.json`;
      const result=existsSync(resultPath)?JSON.parse(readFileSync(resultPath,'utf8')):null;
      statuses.push({...item,code,accepted:result?.accepted===true});
      writeFileSync(`${TWO_WORLD_STORAGE}/first-pass-status.json`,JSON.stringify({statuses,remaining:Math.max(0,pending.length-next),stopped:stop},null,2));
      if(code!==0||result?.costUnknown||result?.refusedBecause==='stopped'){stop=true;console.log(JSON.stringify({phase:'batch-stopped',hide:item.hide,reason:'Inspect retained evidence; no automatic retry'}));}
    }
  };
  await Promise.all([worker(),worker()]);
  if(stop)throw Error('Batch stopped safely; inspect retained evidence');
  for(const board of TWO_WORLD_PATCH_BOARDS){
    const good=board.hides.every(h=>statuses.find(s=>s.hide===h.id)?.accepted);
    if(good && await run('scripts/magic-bar-review.ts',['--two-worlds',board.board,'1,1,1']))throw Error(`Judge stopped: ${board.board}`);
  }
  console.log(JSON.stringify({phase:'first-pass-complete',attempts:statuses.length,technicalAccepted:statuses.filter(s=>s.accepted).length,visualAcceptance:'pending-human-inspection'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
