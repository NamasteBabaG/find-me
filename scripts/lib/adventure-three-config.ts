import { GameConfigSchema, type GameConfig, type SceneConfig, type SpriteRef } from "../../src/domain/game/config";
import { cropOf, maskForHide } from "../../src/domain/scene/local-patch-hides";
import { THREE_PATCH_BOARDS, ADVENTURE_THREE_BOARDS } from "../../content/adventures/three-boards";
export type ReviewedChildGeometry={x:number;y:number;w:number;h:number;headX:number;headY:number};
export function validateReviewedChildGeometry(g:ReviewedChildGeometry):ReviewedChildGeometry {
  if(!g||[g.x,g.y,g.w,g.h,g.headX,g.headY].some(v=>typeof v!=='number'||!Number.isFinite(v))||g.w<=0||g.h<=0||g.x<0||g.y<0||g.x+g.w>512||g.y+g.h>768||g.headX<g.x||g.headX>g.x+g.w||g.headY<g.y||g.headY>g.y+g.h)throw new Error('Reviewed child geometry must contain its face inside the actual patch');
  return g;
}

/** Pure assembly: only an explicit caller with existing GAME assets can publish.
 * No catalog registration, provider calls, fallback child or payment changes. */
export function threeBoardConfig(input: {gameId:string;childName:string;avatarUrl:string;patchUrls:Record<string,string>;composedAt:string;fixture?:boolean;geometry?:Record<string,ReviewedChildGeometry>}): GameConfig {
  const scenes:SceneConfig[]=THREE_PATCH_BOARDS.map(board=>{
    const plan=ADVENTURE_THREE_BOARDS.boards.find(p=>p.boardSlug===board.board);
    if(plan?.status!=="ready")throw new Error("Missing approved art");
    const targets=board.hides.map((hide,i)=>{
      const url=input.patchUrls[hide.id];if(!url)throw new Error(`Missing patch: ${hide.id}`);
      if(!hide.hint)throw new Error(`Missing hint: ${hide.id}`);
      const hintText=({
        'adventure-giza':['חפשו ליד קורות העץ והאבנים בצד שמאל','הציצו בין הצמחים ליד ארגזי השוק','חפשו מאחורי חומת האבן ליד הספינקס'],
        'adventure-amazon':['חפשו בין החוקרים ליד הגזע העבה','מי מתכופף ליד שפת הנהר והשורשים?','הציצו בין העלים ליד החוקרים בצד ימין'],
        'adventure-newyork':['חפשו ליד מדרגות חנות הפרחים','חפשו ליד הברז וציורי הגיר','חפשו בין המטיילים ליד מעקה המטרו'],
      } as Record<string,string[]>)[board.board]?.[i] ?? hide.hint.he;
      const c=cropOf(hide),m=maskForHide(hide);
      const reviewed=input.geometry?.[hide.id];
      if(!input.fixture&&!reviewed)throw new Error(`Actual child geometry is required: ${hide.id}`);
      const g=reviewed?validateReviewedChildGeometry(reviewed):{x:m.left,y:m.top,w:m.width,h:m.height,headX:m.left+m.width/2,headY:m.top+m.height*.18};
      const hitRect={x:(c.left+g.x)/3840,y:(c.top+g.y)/2160,w:g.w/3840,h:g.h/2160};
      const center={x:hitRect.x+hitRect.w/2,y:hitRect.y+hitRect.h/2};
      const sprite:SpriteRef={kind:"image",url,width:c.width,height:c.height,rect:{x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160},hitRect,anchor:{x:(c.left+g.headX)/3840,y:(c.top+g.headY)/2160}};
      const slot=(id:string)=>({id,x:center.x,y:center.y,scale:.2,rotation:0,zIndex:10+i,layer:"front" as const,flip:false,hintZone:{...center,r:.12},hintText});
      return {id:hide.targetId,targetType:"personal-child",difficulty:(i+1) as 1|2|3,mission:`מצאו את ${input.childName}`,item:`מחבוא ${i+1}`,success:["מצאתם אותי!"],animation:"peek" as const,slots:[slot(`${hide.id}-A`),slot(`${hide.id}-B`)] as [ReturnType<typeof slot>,ReturnType<typeof slot>],sprite};
    });
    return {slug:board.board,worldSlug:plan.worldSlug,version:plan.sceneVersion,name:plan.name.he,tagline:input.fixture?"בדיקת חיבור — סימוני TEST במקום ילד":"שלושה מחבואים ושש תגליות",artStatus:"final",playMode:"find-any",appearancesPerBoard:3,findsRequiredToAdvance:3,
      art:{base:plan.art.base,width:3840,height:2160,thumbnail:plan.art.base.replace("base.webp","thumb.webp"),palette:{sky:"#bedceb",ground:"#dcc091",accent:"#dbad37"}},
      targets,ambient:[],celebration:{kind:"confetti",completeText:"מצאתם את שלושת המחבואים! הגלויה שלכם באלבום."},collectible:{id:`${board.board}-stamp`,name:plan.name.he,icon:"✦"},sounds:{}};
  });
  return GameConfigSchema.parse({version:1,gameId:input.gameId,locale:"he",child:{name:input.childName,avatarUrl:input.avatarUrl},styleVersion:"adventure-three-v1",packageTier:"ONE_WORLD",composedAt:input.composedAt,scenes,
    worlds:[{slug:"adventure-trail",version:1,name:"המסע שלי בעולם",tagline:"גיזה · אמזונס · ניו יורק",intro:"שלושה מקומות, תשעה מחבואים ואוסף של תגליות.",
      map:{width:1536,height:1024,art:"/worlds/journey/map.webp",palette:{sky:"#bedceb",ground:"#dcc091",accent:"#dbad37"}},
      nodes:scenes.map((s,i)=>({boardSlug:s.slug,routeIndex:i+1,x:[.2,.5,.8][i],y:[.62,.4,.6][i],labelAnchor:"bottom",markerScale:1,travelStyle:"walk"})),
      collectible:{id:"adventure-trail-stamps",name:"חותמות המסע",piece:"חותמת",icon:"✦"},completion:{title:"מצאתם את כל המחבואים!",text:"הגלויות באלבום. אפשר לחזור ולאסוף את התגליות שעוד מחכות לכם.",icon:"🌍"}}]});
}
