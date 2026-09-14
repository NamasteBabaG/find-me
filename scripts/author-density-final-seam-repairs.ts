import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='storage/adventure-bar-density-20260914';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
for(const [slug,n,attempt] of [['paris',2,3],['marrakech',3,4]] as const){
 const hideId=`adventure-${slug}-density-v3-${n}`,input=readFileSync(`${dir}/${slug}-inputs.json`),board=JSON.parse(input.toString()).board,original=board.hides[n-1];
 const placement=slug==='paris'?{
  support:'Replace ONLY the young girl reaching toward the flower basket behind the postcard-reading man. Keep her original position and body angle. Turn only Bar\'s face slightly toward the viewer. Replace the entire girl including her dress and bag with Bar in a teal T-shirt and tan shorts; keep his feet at the original support. Preserve EVERY pixel of the postcard-reading man in front, especially his hat, head, hands and coat silhouette. Preserve the flower girl on the right and all baskets. DO NOT move the man to cover Bar. DO NOT zoom, crop, translate or recompose the scene.',
  occlusion:'The existing foreground man occludes Bar naturally in exactly the original position. Where original skirt, bag or shoe would remain outside Bar, restore the ground, not orphan clothing. The original woman behind the basket is unchanged.',
  lighting:'Canonical Image 2 defines Bar\'s broad oval face, brown eyes, small nose, gentle asymmetric smile and BROWN curls. Match that face, not the girl being replaced. Match only the local painted light and hand-drawn outlines.'
 }:{
  support:'At the wooden shape board in the bottom-right half, replace ONLY the kneeling yellow-shirt child to the right of the blue-shirt child. Preserve the whole original composition, framing and exact positions and proportions of all pots, the toy board, the blue-shirt child and the green-shirt child. Do not move Bar to the middle of the picture. Do not zoom or reframe. Keep the original child\'s knees, hands and scale while replacing the face and hair with the exact Bar portrait.',
  occlusion:'Preserve the COMPLETE blue-shirt neighbor and all their limbs on the left, and the green-shirt neighbor on the right. No cut-off neighboring body at the edit boundary. Only the yellow-shirt child is replaced.',
  lighting:'Use Bar\'s canonical face, brown eyes, youthful rounded cheeks and brown curls, with the existing warm painted light. Do not copy any neighbor\'s identity.'
 };
 const plan={hideId,inputsSha256:hash(input),attempt,checks:['faceLikeness','severeSeam','faceReadable'],maskOverride:slug==='paris'?{left:28,top:142,width:230,height:455}:original.mask,placementOverride:placement,...(attempt===4?{extraAttemptReason:'Final local repair of a visually rejected neighbor-cutting result; within the existing $3 ceiling, no automatic continuation'}:{})};
 const file=`${dir}/${hideId}-repair-plan-${attempt}.json`,text=JSON.stringify(plan,null,2);if(existsSync(file)&&readFileSync(file,'utf8')!==text)throw Error('Frozen repair plan changed');
 writeFileSync(file,text);writeFileSync(`${dir}/${hideId}-repair.json`,text);
}
console.log('Two explicit final seam repairs prepared; no provider calls');
