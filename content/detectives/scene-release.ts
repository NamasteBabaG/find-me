import { SceneDefinitionSchema } from "../../src/domain/scene/schema";
import { DETECTIVES_SCENE_VERSION } from "../../src/domain/scene/local-patch-versions";
import { maskOf } from "../../src/domain/scene/local-patch-hides";
import { detectiveFamilyForBoard } from "./families";

/** Scene13 selects its own Detective art, authored actors, hints and collection book.
 * Only common UI/known body-template metadata comes from the legacy scene definition;
 * no legacy art, target hint, action, transform or slot placement survives. */
export function detectiveSceneRelease(raw: unknown): unknown {
  const source=SceneDefinitionSchema.parse(raw), family=detectiveFamilyForBoard(source.slug),board=family.boards.find(b=>b.board===source.slug);
  const plan=family.adventure.boards.find(b=>b.boardSlug===source.slug);
  if (!board || !plan || plan.status!=="ready" || plan.sceneVersion!==DETECTIVES_SCENE_VERSION)
    throw Error(`DETECTIVES_SCENE: unknown family board ${source.slug}`);
  const {foreground:_foreground,...baseArt}=source.art;
  return {...source,version:DETECTIVES_SCENE_VERSION,artStatus:"final",
    name:plan.name,tagline:{en:"Find the little stories hidden in a busy illustrated scene.",he:"גלו את הסיפורים הקטנים שמסתתרים באיור העשיר."},
    art:{...baseArt,...plan.art,thumbnail:plan.art.base},ambient:[],bonus:undefined,
    artNotes:plan.direction.locationCues.map(c=>c.en),artComposition:plan.direction.microStories.map(c=>c.en).join(" "),
    playMode:"find-any",appearancesPerBoard:3,findsRequiredToAdvance:3,wardrobe:board.wardrobe,
    celebration:{...source.celebration,completeText:{en:"You found {name} three times — board complete!",he:"מצאתם את {name} שלוש פעמים — הבורד הושלם!"}},
    targets:board.hides.map((hide,i)=>{
      const template=source.targets[Math.min(i,source.targets.length-1)]!,box=maskOf(hide);
      const x=(box.left+box.width/2)/plan.art.width,y=(box.top+box.height/2)/plan.art.height;
      const {action:_action,expression:_expression,...neutral}=template;
      return {...neutral,id:hide.targetId,targetType:`${source.slug}_v13_${i+1}`,difficulty:i+1,
        mission:{en:"Find {name}",he:"מצאו את {name}"},item:{en:"the hidden detective",he:"הדמות המסתתרת"},
        success:[{en:"You found me!",he:"מצאתם אותי!"},{en:"What a great hiding place!",he:"איזה מקום מחבוא נהדר!"},{en:"Ready for another adventure?",he:"מוכנים לעוד הרפתקה?"}],
        // Generic scene slots are bounded preview metadata. Native render/player geometry comes from the authoritative hide/accepted row.
        slots:template.slots.map((_slot,variant)=>({id:`${hide.targetId}-${variant?"B":"A"}`,x,y,scale:Math.min(0.25,box.height/plan.art.height),
          hintText:hide.hint!,hintZone:{x,y,r:Math.max(0.04,box.width/plan.art.width)},flip:false,rotation:0,layer:"front",zIndex:10})),
      };
    }),
  };
}
