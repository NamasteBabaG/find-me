/** Local-only browser replay. Input: disposable [{locale,url,config}] fixtures.
 * Never changes game state through JS: finds use real pointer events. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [input, session = 'finale-short'] = process.argv.slice(2);
const browser = process.env.BROWSER_CLI;
assert.ok(input && browser, 'Fixture JSON and BROWSER_CLI required');
const fixtures = JSON.parse(readFileSync(input, 'utf8'));
const out = 'output/passport/short-viewports'; mkdirSync(out, {recursive:true});
function run(...args) {
 const r = JSON.parse(execFileSync(browser, ['--session',session,'--json',...args], {encoding:'utf8',timeout:60000}));
 assert.ok(r.success, JSON.stringify(r.error)); return r.data;
}
const read = js => run('eval',js).result;
function clickText(text) { run('find','role','button','click','--name',text,'--exact'); }
function pause(ms) { run('wait',String(ms)); }
function tap(rect) {
 const p=read(`(()=>{const r=document.querySelector('.stage').getBoundingClientRect();return {x:r.x+${rect.x+rect.w/2}*r.width,y:r.y+${rect.y+rect.h/2}*r.height}})()`);
 assert.ok(p.x>0 && p.y>0 && p.x<read('innerWidth') && p.y<read('innerHeight'));
 run('mouse','move',String(Math.round(p.x)),String(Math.round(p.y))); run('mouse','down'); run('mouse','up');
}
const report=[];
for(const f of fixtures){
 assert.equal(new URL(f.url).hostname,'localhost','Private fixture only');
 const scene=f.config.scenes[0], board=f.config.adventure.boards[0];
 run('set','viewport','1440','900'); run('open','about:blank'); run('open',f.url); pause(800);
 if(read(`Boolean(document.querySelector('.gift'))`)) {
  clickText(f.locale==='he'?'פותחים את המתנה':'🎁 Open the gift'); pause(1400);
  clickText(f.locale==='he'?'לפתיחת ההרפתקה ✨':'Start the adventure ✨'); pause(500);
 }
 if(!read(`Boolean(document.querySelector('.stage'))`)) clickText(scene.name);
 pause(3500);
 run('snapshot','-i');
 for(const d of board.discoveries){ tap(d.hitRect); pause(350); }
 for(let n=0;n<3;n++){
  const id=read(`document.querySelector('.stage__target[data-found="false"]')?.dataset.target`);
  const target=scene.targets.find(t=>t.id===id); assert.ok(target,id);
  const sprite=target.spriteByVariant?.A??target.sprite;
  assert.ok(sprite.hitRect,'Measured target required'); tap(sprite.hitRect); pause(3400);
  assert.equal(read(`Number(document.querySelector('.scene')?.dataset.foundCount)`),n+1);
 }
 assert.equal(read(`document.querySelectorAll('.passport-finale__items [data-collected="true"]').length`),6);
 for(const [w,h] of [[1440,900],[1366,768],[1366,700],[1366,650],[1366,620],[1280,600],[390,844],[360,640]]){
  run('set','viewport',String(w),String(h)); pause(250);
  const m=read(`(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return {gap:d.scrollHeight-d.clientHeight,top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...d.querySelectorAll('button:not(:disabled)')].map(e=>{const b=e.getBoundingClientRect();return{text:e.textContent,top:b.top,bottom:b.bottom,height:b.height}})}})()`);
  report.push({locale:f.locale,w,h,...m});
  run('screenshot',path.resolve(out,`${f.locale}-${w}x${h}.png`));
  writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));
  assert.equal(m.gap,0,JSON.stringify(report.at(-1)));
  assert.equal(m.overflow,0);
  assert.ok(m.buttons.every(b=>b.top>=0 && b.bottom<=h && b.height>=48),JSON.stringify(m.buttons));
  assert.ok(read(`Array.from(document.querySelectorAll('.passport-finale__actions button:not(:disabled)')).every(b=>{const r=b.getBoundingClientRect(),s=document.createRange();s.selectNodeContents(b);const t=s.getBoundingClientRect();return t.left>=r.left && t.right<=r.right && t.top>=r.top && t.bottom<=r.bottom})`),'Button text must fit its touch target');
 }
 const exit=read(`(()=>{const b=document.querySelector('.passport-finale__actions button'),r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 run('mouse','move',String(Math.round(exit.x)),String(Math.round(exit.y))); run('mouse','down'); run('mouse','up'); pause(700);
 assert.ok(!read(`document.body.innerText.includes('0 of 0') || document.body.innerText.includes('0 מתוך 0')`));
 assert.ok(!read(`Boolean(document.querySelector('dialog[open]'))`));
 assert.ok(read(`Boolean([...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')??b.textContent).includes(${JSON.stringify(scene.name)})))`));
 assert.deepEqual(run('errors').errors,[]);
}
console.log(JSON.stringify({passed:report.length,metrics:path.join(out,'metrics.json')}));
