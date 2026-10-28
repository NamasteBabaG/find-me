/** Deterministic child-free packaging. Usage: node scripts/prepare-kingdom-detectives.mjs <native-source-directory>
 * The reviewed authoring file pins native bytes. No generation, AI enhancement or crop is performed.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = process.cwd(), input = process.argv[2];
if (!input) throw Error('Provide the directory containing the frozen native illustrations');
const authoring = JSON.parse(await readFile(path.join(root, 'content/detectives/kingdom/authoring-v1.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rect = ([left, top, width, height]) => ({ left, top, width, height });
const normalized = ([x, y, w, h], b) => ({ x:x/b.nativeWidth, y:y/b.nativeHeight, w:w/b.nativeWidth, h:h/b.nativeHeight });
const source = { version:'kingdom-detectives-source/v1', worldSlug:'kingdom', runtimeReady:false, boards:[], boundaryHeadZones:[] };
const runtime = { version:'kingdom-detectives-runtime/v1', sceneVersion:13, worldSlug:'kingdom', sourceRelease:source.version, boards:[] };
const styles = [];
for (const b of authoring.boards) {
  if (path.basename(b.sourceFileName) !== b.sourceFileName) throw Error('Native filename must be local');
  const bytes = await readFile(path.join(input, b.sourceFileName));
  const meta = await sharp(bytes).metadata();
  if (hash(bytes)!==b.nativeSha256 || meta.width!==b.nativeWidth || meta.height!==b.nativeHeight || (meta.pages??1)!==1 || (meta.orientation??1)!==1) throw Error('Native source changed: '+b.board);
  const width = b.nativeWidth*2, height = b.nativeHeight*2;
  const art = `public/scenes/kingdom-${b.board}-detectives-v1/base.webp`;
  const packed = await sharp(bytes).resize(width,height,{kernel:'lanczos3'}).webp({lossless:true,effort:6}).toBuffer();
  await mkdir(path.dirname(path.join(root,art)), {recursive:true});
  await writeFile(path.join(root,art),packed);
  const s = {path:art,sha256:hash(packed),width,height};
  const relative = (box,crop) => rect([(box[0]-crop[0])*2,(box[1]-crop[1])*2,box[2]*2,box[3]*2]);
  const definition = {board:b.board,art,ground:b.ground,sittable:true,
    wardrobe:'Age-appropriate practical fantasy clothing from this board. Preserve the reference child face, hair and age. Matte hand-painted fabric and skin; no glow or photographic smoothing.',
    hides:b.roles.map((r,i)=>({id:r.id,left:r.crop[0]*2,top:r.crop[1]*2,pose:r.pose,targetId:`hide-${i+1}`,wardrobe:r.outfit,
      mask:relative(r.box,r.crop),returnRect:relative(r.returned,r.crop),hint:r.hint,
      placement:{depth:r.box[1]<300?'deep':r.box[1]<620?'middle':'near',standingHeightPx:r.standingHeight*2,
        support:r.activity,lighting:b.light,occlusion:'Preserve all neighboring faces, hands, shared props, rails and foreground occluders. Replace only the selected source child.',
        comparators:'Keep the original source child body scale and supported pose. Match adjacent people at the same depth; preserve reference face, hair and age.'}}))};
  source.boards.push({board:b.board,...s,definition});
  source.boundaryHeadZones.push({board:b.board,sourceArt:art,sourceSha256:s.sha256,hides:b.roles.map(r=>({hideId:r.id,heads:r.neighbors.map(n=>rect(n.head.map(v=>v*2)))}))});
  const personalZones = b.roles.map(r=>normalized(r.crop,b));
  const direction = {orientation:'landscape',aspect:'16:9',spread:'activity-across-width-and-height',perspective:'shallow',scaleTreatment:'similar-size-people',illustration:'storybook-hand-drawn',identityPrecedence:'reference-face-hair-age',
    locationCues:b.cues.map(([en,he])=>({en,he})),microStories:b.roles.map(r=>r.hint)};
  const discoveries = b.discoveries.map(d=>({id:d.id,name:d.name,hint:d.hint??{en:`Look for: ${d.name.en}.`,he:`חפשו באיור: ${d.name.he}.`},category:d.category,
    description:{kind:'story',text:{en:`A small detail in this illustrated story: ${d.name.en}.`,he:`פרט קטן מתוך הסיפור שבאיור: ${d.name.he}.`}},
    visibleRect:normalized(d.box,b),hitRect:normalized([d.box[0]+d.box[2]*0.2,d.box[1]+d.box[3]*0.2,d.box[2]*0.6,d.box[3]*0.6],b),cardCrop:normalized(d.box,b)}));
  const adventure = {boardSlug:b.board,worldSlug:'kingdom',name:b.name,direction,plannedHides:3,collectionUi:'guided-v1',status:'ready',sceneVersion:13,
    art:{base:art.slice(6),sha256:s.sha256,width,height},personalZones,discoveries,
    postcard:{id:`${b.board}-detectives-postcard`,title:{en:`A memory from ${b.name.en}`,he:`מזכרת: ${b.name.he}`},targetId:'hide-1',crop:personalZones[0]}};
  runtime.boards.push({board:b.board,source:s,definition,adventure,sourceNeighbors:b.roles.map(r=>({boardId:b.board,hideId:r.id,neighbors:r.neighbors.map(n=>({sourceId:n.sourceId,head:rect(n.head.map(v=>v*2))}))}))});
  styles.push({boardId:b.board,art,sha256:s.sha256,width,height,crop:rect(b.roles[0].crop.map(v=>v*2))});
}
for(const [name,value] of [['source-v1.json',source],['runtime-v1.json',runtime],['identity-style-v1.json',styles]]) await writeFile(path.join(root,'content/detectives/kingdom',name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({boards:source.boards.length,hides:runtime.boards.reduce((n,b)=>n+b.definition.hides.length,0),discoveries:runtime.boards.reduce((n,b)=>n+b.adventure.discoveries.length,0),transform:'exact 2x Lanczos3, lossless WebP; no native 4K claim'}));
