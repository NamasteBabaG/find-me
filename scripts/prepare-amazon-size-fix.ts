import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {THREE_PATCH_BOARDS,ADVENTURE_THREE_BOARDS} from '../content/adventures/three-boards';
import {LocalPatchBoardSchema,assertPlaceable} from '../src/domain/scene/local-patch-hides';
import {ReadyAdventureBoardSchema} from '../src/domain/adventure/content';
const file='content/adventures/expansion/amazon-size.json';
if(existsSync(file))throw Error('Frozen inputs already exist');
const original=THREE_PATCH_BOARDS.find(b=>b.board==='adventure-amazon')!;
const patchBoard=LocalPatchBoardSchema.parse({...original,hides:original.hides.map((h,i)=>i!==1?h:{...h,mask:{left:205,top:15,width:265,height:335},placement:{...h.placement!,depth:'near',standingHeightPx:440,
 support:'Both shoes and the crouching body are supported on the dry gravel/root bank at the upper RIGHT, immediately below the wooden dock. Feet end around crop y=315. No floating body, no foot in the river; retain the bank and its waterline.',
 comparators:'This is a NEAR riverbank child, not a miniature distant figure. His whole crouched figure is approximately 280-300 crop pixels tall, with a clearly readable face and curls roughly 95-105 pixels tall. Match the head scale of the nearby foreground explorer, adjusted only for age five. A previous 215px crouching child was too small. Increase the entire figure proportionally, NOT just his head. Keep his whole head below the dock and his feet on the same bank.',
 lighting:'Use the nearby warm ochre explorer and forest foliage for directional light: warm upper-left soft highlights, cool green bounce in the shadow, irregular painted contours and clearly drawn face. Preserve Bar identity, no photographic cutout.',
 occlusion:'Keep the full face and curls readable. Only small plant leaves may overlap a lower leg, not the face.'}})});
assertPlaceable(patchBoard,{width:3840,height:2160});
const plan=ReadyAdventureBoardSchema.parse({...ADVENTURE_THREE_BOARDS.boards.find(b=>b.boardSlug==='adventure-amazon')!,sceneVersion:10});
mkdirSync('content/adventures/expansion',{recursive:true});
writeFileSync(file,JSON.stringify({patchBoard,plan},null,2));
