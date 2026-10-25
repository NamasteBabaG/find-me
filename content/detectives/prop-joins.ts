import { propJoinContractSchema } from '../../src/domain/generation/prop-join';
/** Public-source steering/front-wheel join. This is authored scene geometry,
 * never a child-specific correction or a change to the original paid source. */
export const DETECTIVE_PROP_JOIN = propJoinContractSchema.parse({
 version:'source-prop-registration/v1',boardId:'paris',hideId:'paris-detectives-hide-2',
 sourceSha256:'85e29b9efead0e06eea5b9cc40d9a7d2af84f114cb1bdf01338c9cbf381f01a4',
 crop:{left:2800,top:1220,width:512,height:768},child:{left:205,top:145,width:205,height:570},returned:{left:193,top:133,width:242,height:594},
 anchor:{left:376,top:700,width:59,height:53},pivotX:200,protectedAbove:350,
 maxScalePercent:150,minDy:-12,maxDy:20,minInitialScore:700,maxRelativeScore:.7
});
