/** Records an explicit visual inspection, never infers human approval from a score. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {TWO_WORLD_PATCH_BOARDS,TWO_WORLD_STORAGE} from '../content/adventures/two-worlds-production';
import {TWO_WORLD_VISUAL_HOLDS} from '../content/adventures/two-worlds-release';
import {validateReviewedChildGeometry} from './lib/adventure-three-config';
// Native shipping crop coordinates, measured after inspecting returns and native contexts.
// Each tuple: selected attempt, visible x/y/w/h, face centre x/y. NOT mask envelopes.
const measured:Record<string,number[][]>={
 'journey-paris-refresh-v7':[[2,205,228,145,250,251,291],[1,160,203,179,346,245,254],[3,158,239,168,274,247,292]],
 'journey-tokyo-refresh-v6':[[1,152,226,218,285,253,325],[3,146,216,233,364,255,271],[3,174,248,180,262,284,289]],
 'journey-sydney-refresh-v6':[[1,147,146,207,519,254,219],[1,174,260,184,277,254,337],[3,181,215,154,434,234,282]],
 'magic-sweetworkshop-refresh-v3':[[2,178,244,186,245,257,340],[1,150,190,228,335,244,294],[3,133,218,219,300,248,294]],
 'journey-marrakech-refresh-v8':[[1,177,242,176,340,239,319],[1,171,201,107,322,220,244],[1,169,198,156,215,225,242]],
 'journey-china-refresh-v8':[[1,108,146,190,444,188,204],[2,122,158,165,256,180,221],[1,152,228,164,268,232,289]],
 'journey-antarctica-refresh-v7':[[1,186,222,131,247,240,266],[1,172,242,155,246,234,292],[1,178,241,214,242,246,307]],
 'journey-giza-refresh-v4':[[1,192,196,127,361,248,246],[1,226,267,122,156,282,316],[1,134,266,204,242,234,331]],
 'magic-dragoncave-refresh-v3':[[1,146,203,226,307,250,263],[2,69,112,316,368,200,212],[2,80,92,156,419,143,159]],
 'magic-icepalace-refresh-v2':[[1,149,208,192,337,237,263],[1,156,107,154,460,209,169],[2,172,260,133,226,223,316]],
 'magic-underwater-refresh-v2':[[1,142,201,260,315,215,269],[1,201,255,213,315,279,337],[1,222,210,189,257,284,275]],
 'magic-cloudcity-refresh-v1':[[1,151,258,178,233,236,338],[1,188,176,141,419,248,229],[1,112,110,234,457,297,182]],
 'magic-nightcarnival-refresh-v1':[[1,175,251,139,246,227,306],[1,170,173,173,418,245,242],[2,88,211,242,372,195,283]],
};
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
for(const b of TWO_WORLD_PATCH_BOARDS){
 const dir=`${TWO_WORLD_STORAGE}/${b.board}`,inputsSha256=hash(readFileSync(`${dir}/inputs.json`));
 const hold=TWO_WORLD_VISUAL_HOLDS[b.board];if(hold){writeFileSync(`${dir}/final-review.json`,JSON.stringify({accepted:false,inputsSha256,reviewer:'assistant-native-context-review',reason:hold,maximumAttemptsThisPass:2},null,2));continue;}
 const rows=measured[b.board];if(rows?.length!==3)throw Error(`Missing human geometry ${b.board}`);
 const vector=rows.map(r=>r[0]),groupName=`${b.board}-review-${vector.join('-')}.json`,groupBytes=readFileSync(`${dir}/${groupName}`),group=JSON.parse(groupBytes.toString());
 if(group.inputsSha256!==inputsSha256)throw Error('Review inputs changed');
 const hides=Object.fromEntries(b.hides.map((h,i)=>{const [attempt,x,y,w,height,headX,headY]=rows[i]!,prefix=`${dir}/${h.id}-attempt-${attempt}`,bytes=readFileSync(`${prefix}.png`),technical=JSON.parse(readFileSync(`${prefix}.json`,'utf8'));
  if(!technical.accepted||technical.costUnknown||technical.inputsSha256!==inputsSha256||technical.sha256!==hash(bytes)||group.patches[h.id]!==hash(bytes)||group.dispositions[h.id]?.state!=='acceptable')throw Error(`Cannot seal ${h.id}`);
  return [h.id,{attempt,sha256:hash(bytes),geometry:validateReviewedChildGeometry({x:x!,y:y!,w:w!,h:height!,headX:headX!,headY:headY!})}];
 }));
 writeFileSync(`${dir}/final-review.json`,JSON.stringify({accepted:true,reviewer:'assistant-native-context-review',scope:'Local pilot only. Not parent likeness approval or QA/catalog activation.',inputsSha256,avatarSha256:hash(readFileSync(`${dir}/avatar.png`)),groupReviews:{[b.board]:groupName},groupHashes:{[b.board]:hash(groupBytes)},hides,notes:'Inspected 512x768 returns and original-resolution contexts. Face and brown curls remain canonical; readable, supported age-five figure with no conspicuous cropped body or rectangular join. Bounded local pose/wardrobe/prop differences are visible and accepted for local playtest; not a claim of pixel-perfect source preservation. All six discovery cards lie outside personal return rectangles.'},null,2));
}
console.log(JSON.stringify({newBoardsApproved:TWO_WORLD_PATCH_BOARDS.length-Object.keys(TWO_WORLD_VISUAL_HOLDS).length,newBoardsHeld:Object.keys(TWO_WORLD_VISUAL_HOLDS).length,published:false}));
