/** Responsive replay and persisted passport checks after the full owner walk. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const browser=process.env.BROWSER_CLI,session=process.env.BROWSER_SESSION;
if(!browser||!session)throw Error('BROWSER_CLI and a shell-warmed BROWSER_SESSION required');
const dir='storage/two-worlds-bar-20260919',out='output/two-worlds-20260919/playtest';
const game=JSON.parse(readFileSync(`${dir}/local-game.json`));
const owner=`http://localhost:3037/family/${game.childId}/play/${game.gameId}`;
const report={pages:[],layouts:[]};
function run(...args){const r=JSON.parse(execFileSync(browser,['--session',session,'--json',...args],{encoding:'utf8',timeout:60000}));if(!r.success)throw Error(JSON.stringify(r.error));return r.data;}
const snap=()=>run('snapshot','-i');
const ev=s=>run('eval',s).result;
function click(match){const s=snap(),p=Object.entries(s.refs??{}).find(([,v])=>v.role==='button'&&match(v.name));if(!p)throw Error(`Missing button: ${s.snapshot}`);run('click',`@${p[0]}`);}
function save(name){run('screenshot',path.resolve(`${out}/${name}.png`));}
function page(){return ev(`(()=>{const p=document.querySelector('.travel-passport__page');return {title:p?.querySelector('h2')?.textContent,state:p?.getAttribute('data-state'),items:p?.querySelectorAll('[data-collected="true"]').length,images:[...p?.querySelectorAll('img')??[]].map(i=>({loaded:i.complete&&i.naturalWidth>0})),overflow:{x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight}}})()`);}
function loadedPage(){
 // A cold local composition takes longer than the page-turn animation. Wait
 // for actual decoded pixels, not a fixed animation duration or empty <img>.
 for(let i=0;i<40;i++){const p=page();if(p.images.length===7&&p.images.every(i=>i.loaded))return p;run('wait','250');}
 throw Error(`Passport media did not decode: ${JSON.stringify(page())}`);
}
try{
 run('state','load',path.resolve(`${dir}/owner-browser-state.json`));run('set','viewport','390','844');run('open',owner);run('wait','1500');
 click(n=>n.includes('כל העולמות'));click(n=>n.startsWith('מסביב לעולם'));click(n=>n.startsWith('3. '));run('wait','2000');
 click(n=>n==='לשחק מחדש');run('wait','1000');
 report.replayStart=ev(`({replay:document.querySelector('.scene')?.getAttribute('data-replay'),found:document.querySelector('.scene')?.getAttribute('data-found-count'),collection:document.querySelector('[aria-label^="תגליות:"]')?.getAttribute('aria-label')})`);
 if(report.replayStart.replay!=='true'||report.replayStart.found!=='0'||!report.replayStart.collection?.includes('0 מתוך 6'))throw Error('Replay did not temporarily clear finds');
 console.log('MOBILE replay: Paris');
 const played=JSON.parse(execFileSync(process.execPath,['scripts/magic-bar-browser-check.mjs','--two-worlds','journey-paris-refresh-v7',session],{encoding:'utf8',timeout:240000}).trim());
 report.replay={targets:played.targets.length,discoveries:played.discoveries.length,overflow:played.overflow};
 click(n=>n==='פותחים את הדרכון שלי');run('wait','1500');click(n=>n==='פותחים את הדרכון שלי');run('wait','1200');
 report.layouts.push({size:'390x844',...loadedPage()});save('passport-mobile');
 for(const [w,h]of [[360,640],[1366,768],[1440,900]]){run('set','viewport',String(w),String(h));run('wait','500');report.layouts.push({size:`${w}x${h}`,...page()});save(`passport-${w}x${h}`);}
 for(const label of ['מסביב לעולם','ממלכת הקסם']){
  click(n=>n===label);run('wait','1000');
  for(let i=0;i<9;i++){
   if(i){click(n=>n==='לעמוד הבא');run('wait','1000');}
   const p=loadedPage();report.pages.push({world:label,...p});
   if(p.state!=='complete'||p.items!==6||!p.images.length||p.images.some(i=>!i.loaded))throw Error(`Incomplete persisted passport page: ${JSON.stringify(p)}`);
  }
 }
 if(report.layouts.some(p=>p.overflow.x>0||p.overflow.y>0))throw Error(`Passport overflow: ${JSON.stringify(report.layouts)}`);
 report.passport=snap();report.errors=run('errors');save('passport-final-page');
 run('open',owner);run('wait','1500');report.reloadedMap=snap();save('reloaded-complete-map');
 writeFileSync(`${out}/finish-complete.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,passportPages:report.pages.length,replay:report.replay,layouts:report.layouts.map(p=>({size:p.size,overflow:p.overflow}))}));
}catch(e){try{report.failure=snap();save('finish-failure');}catch{}writeFileSync(`${out}/finish-failure.json`,JSON.stringify({...report,error:String(e)},null,2));console.error(String(e).slice(0,4000));process.exitCode=1;}
finally{try{run('close');}catch{}}
