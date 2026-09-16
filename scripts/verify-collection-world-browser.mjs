// UI verification against the opt-in, synthetic collection-world integration fixture.
// No production/QA database access and no direct mutation of player state.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const binary = process.env.QA_REVIEW_BROWSER_BIN;
if (!binary) throw new Error('Set QA_REVIEW_BROWSER_BIN');
const session = 'collection-e2e';
const run = args => execFileSync(binary, ['--session', session, ...args], {encoding:'utf8',timeout:60000}).trim();
const evaluate = script => JSON.parse(execFileSync(binary, ['--session',session,'eval','--stdin'], {input:script,encoding:'utf8',timeout:60000}));
const clickPoint = p => { run(['mouse','move',String(p.x),String(p.y)]); run(['mouse','down']); run(['mouse','up']); };
const results = [];
try {
  for (let board=0;board<9;board++) {
    run(['wait','.collect__fab:not(:disabled)']);
    run(['wait','1200']);
    const title=evaluate(`document.querySelector('.viewport').getAttribute('aria-label')`);
    const initialCollected=Number(evaluate(`document.querySelector('.collect__count').textContent.split('/')[0]`));
    run(['click','.collect__fab']);
    run(['wait','.collect__sheet[role=dialog]']);
    const ids=evaluate(`[...document.querySelectorAll('.collect__grid [data-discovery]')].map(e=>e.dataset.discovery)`);
    if(ids.length!==6)throw Error('Expected six discoveries');
    if(initialCollected===6)run(['click','.collect__fab']);
    for (const [i,id] of ids.entries()) {
      if(i<initialCollected)continue;
      run(['click',`[data-discovery="${id}"]`]);run(['wait','300']);
      for(let n=0;n<3;n++){run(['click','.collect__hint']);run(['wait','650']);}
      const p=evaluate(`(()=>{const r=document.querySelector('.discovery-hint-region--exact').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!document.elementFromPoint(x,y)?.closest('.viewport'))throw Error('Discovery covered by UI');return {x:Math.round(x),y:Math.round(y)}})()`);
      clickPoint(p);run(['wait','900']);
      const count=evaluate(`document.querySelector('.collect__count').textContent`);
      if(count!==`${i+1}/6`)throw Error('Wrong count '+count);
      clickPoint(p);run(['wait','150']);
      if(evaluate(`document.querySelector('.collect__count').textContent`)!==count)throw Error('Duplicate collection');
      if(i<5){run(['click','.collect__fab']);run(['wait','.collect__sheet[role=dialog]']);}
    }
    const initialFound=evaluate(`Number(document.querySelector('.scene').dataset.foundCount)`);
    for(let child=initialFound;child<3;child++) {
      run(['wait','.scene[data-mission-phase="searching"][data-turning="false"] .collect__fab:not(:disabled)']);
      for(let n=0;n<5&&!evaluate(`!!document.querySelector('.magnifier')`);n++){run(['click','.mission__hintbtn']);run(['wait','800']);}
      run(['wait','.magnifier']);
      const p=evaluate(`(()=>{const e=document.querySelector('.magnifier'),r=e.parentElement.getBoundingClientRect(),x=r.x+parseFloat(e.style.left),y=r.y+parseFloat(e.style.top);if(!document.elementFromPoint(x,y)?.closest('.viewport'))throw Error('Child covered by UI');return {x:Math.round(x),y:Math.round(y)}})()`);
      clickPoint(p);run(['wait','2200']);
      if(evaluate(`Number(document.querySelector('.scene').dataset.foundCount)`)!==child+1)throw Error('Child find did not register');
    }
    run(['wait','.complete__card']);
    run(['screenshot',`output/collection-e2e/board-${board+1}-complete.png`]);
    results.push({board:board+1,title,children:3,discoveries:6,duplicateProtected:true});
    console.log(JSON.stringify(results.at(-1)));
    if(board<8)run(['click','.complete__actions .fm-btn--lg']);
  }
} finally {
  await fs.writeFile('output/collection-e2e/browser-results.json',JSON.stringify({scope:'local native-pointer play of synthetic provider integration output, not live AI or likeness validation',results},null,2));
}
