/** Full real-pointer owner journey. Keeps the browser parent alive on Windows.
 * No direct progress writes, synthetic application events or unlock seeding. */
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const browser=process.env.BROWSER_CLI;if(!browser)throw Error('BROWSER_CLI required');
const session=process.env.BROWSER_SESSION??'two-worlds-e2e',dir='storage/two-worlds-bar-20260919',out='output/two-worlds-20260919/playtest';
mkdirSync(out,{recursive:true});
const game=JSON.parse(readFileSync(`${dir}/local-game.json`)),inputs=JSON.parse(readFileSync(`${dir}/playtest-inputs.json`));
const report={started:new Date().toISOString(),boards:[],worlds:[],checks:[]};
function run(...args){console.log(`BROWSER ${args[0]}`);const r=JSON.parse(execFileSync(browser,['--session',session,'--json',...args],{encoding:'utf8',timeout:60000}));if(!r.success)throw Error(JSON.stringify(r.error));return r.data;}
const snapshot=()=>run('snapshot','-i');
function ref(role,match){const s=snapshot();const p=Object.entries(s.refs??{}).find(([,v])=>v.role===role&&match(v.name));if(!p)throw Error(`Missing ${role}: ${s.snapshot}`);return `@${p[0]}`;}
const click=match=>run('click',ref('button',match));
const evaluate=s=>run('eval',s).result;
try{
 run('open','http://localhost:3037/family');run('set','viewport','1440','900');
 const s=snapshot();if(Object.values(s.refs??{}).some(v=>v.role==='textbox')){
  run('fill',ref('textbox',n=>/email|מייל/i.test(n)),'two-worlds-bar-pilot@findme.local');click(n=>/sign-in link|קישור/i.test(n));run('wait','1500');
  const mailbox=`${dir}/assets/outbox/`,files=readdirSync(mailbox).filter(f=>f.endsWith('.json')).sort((a,b)=>statSync(mailbox+a).mtimeMs-statSync(mailbox+b).mtimeMs);
  const mail=JSON.parse(readFileSync(mailbox+files.at(-1)));if(mail.to!=='two-worlds-bar-pilot@findme.local')throw Error('Not the isolated mailbox');
  const url=mail.text.match(/http:\/\/localhost:3037\/auth\/magic-link\?\S+/)?.[0];if(!url)throw Error('Missing local sign-in link');run('open',url);
 }
 run('open',`http://localhost:3037/family/${game.childId}/play/${game.gameId}`);run('wait','1500');
 click(n=>n.includes('כל העולמות'));
 // Start in world two first: no dependency on finishing world one.
 for(const [world,label]of [['kingdom','ממלכת הקסם'],['journey','מסביב לעולם']]){
  report.worlds.push(snapshot());click(n=>n.startsWith(label));
  const plans=inputs.catalog.boards.filter(p=>p.worldSlug===world);
  click(n=>n.startsWith('1. '));run('wait','1500');
  for(const [i,p]of plans.entries()){
   console.log(`PLAY ${world} ${i+1}/9 ${p.boardSlug}`);
   const text=execFileSync(process.execPath,['scripts/magic-bar-browser-check.mjs','--two-worlds',p.boardSlug,session],{encoding:'utf8',timeout:180000});
   const check=JSON.parse(text.trim());report.boards.push({slug:p.boardSlug,discoveries:check.discoveries.length,targets:check.targets.length,overflow:check.overflow});
   writeFileSync(`${out}/walk-progress.json`,JSON.stringify(report,null,2));
   console.log(`PASS ${p.boardSlug}: 3 hides + 6 discoveries`);
   if(i<plans.length-1)click(n=>n==='למקום הבא');else click(n=>/עולמות/.test(n));
   run('wait','1200');
  }
 }
 report.finalHub=snapshot();run('screenshot',path.resolve(`${out}/two-worlds-complete.png`));
 click(n=>n==='הדרכון שלי');run('wait','1500');report.passport=snapshot();run('screenshot',path.resolve(`${out}/passport-cover.png`));
 report.errors=run('errors');report.finished=new Date().toISOString();
 run('state','save',path.resolve(`${dir}/owner-browser-state.json`));
 writeFileSync(`${out}/walk-complete.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,boards:report.boards.length,targets:report.boards.reduce((n,b)=>n+b.targets,0),discoveries:report.boards.reduce((n,b)=>n+b.discoveries,0)}));
}catch(e){
 try{report.failure=snapshot();run('screenshot',path.resolve(`${out}/walk-failure.png`));run('state','save',path.resolve(`${dir}/owner-browser-state.json`));}catch{}
 writeFileSync(`${out}/walk-failure.json`,JSON.stringify({...report,error:String(e).replace(/token=[^&\s]+/g,'token=[omitted]')},null,2));console.error(String(e).slice(0,4000));process.exitCode=1;
}finally{try{run('close');}catch{}}
