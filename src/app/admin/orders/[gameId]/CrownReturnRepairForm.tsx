import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { env } from "@/lib/env";
import { planPublishedCrownRepair,publishedCrownRepairOf } from "@/services/generation/published-crown-repair";
import { stageCrownReturnRepairAction } from "../../actions";

/** A software repair within the existing game/cap, never an art override. */
export async function CrownReturnRepairForm({gameId}:{gameId:string}){
 if(env().APP_ENV!=="qa")return null;const admin=await currentAdmin();if(!admin)return null;
 const c=getContainer(),{locale}=await getI18n(),he=locale==="he";
 const current=await publishedCrownRepairOf(c.db,gameId);
 if(current){if(current.pin.ownerId!==admin.id)return null;return <section className="fm-card fm-stack fm-stack--2" aria-label={he?"תיקון מסגרת השיער":"Crown return repair"}>
   <h3>{he?"תיקון מסגרת השיער":"Crown return repair"}</h3>
   <p role="status">{current.state.phase==="committed"?(he?"המסגרות תוקנו ועברו שיפוט חדש. ההתקדמות נשמרה.":"Corrected frames passed fresh review. Player progress was preserved."):
    current.state.phase==="staged"?(he?"התיקון נמצא בתור לשיפוט אוטומטי ב־MEDIUM.":"The corrected images are queued for automatic MEDIUM review."):
    (he?"התיקון לא התקבל במסגרת האיכות והתקציב הקיימת. פרטי האבחון נשמרו.":"The correction could not complete under the existing quality and budget limits. Diagnosis was retained.")}</p>
  </section>;}
 let plan;try{plan=await planPublishedCrownRepair(c,gameId);}catch{return null;}if(plan.pin.ownerId!==admin.id)return null;
 return <form action={stageCrownReturnRepairAction} className="fm-card fm-stack fm-stack--2">
  <h3>{he?"תיקון מסגרת השיער":"Crown return repair"}</h3>
  <p>{he?"תיקון ההרכבה משתמש בציורים שכבר שולמו. כל תמונה מתוקנת עוברת שיפוט MEDIUM אחד; כל 27 המחבואים והתקדמות המשחק נשמרים.":"Recompose from existing paid drawings. Each corrected image receives one MEDIUM assessment; all 27 hides and player progress are preserved."}</p>
  <p>{he?"התקרה נשארת $4 למשחק. יתרה נוכחית: ":"The game cap remains $4. Current remaining allowance: "}<b dir="ltr">${(plan.remainingMicroUsd/1e6).toFixed(3)}</b></p>
  <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="planSha256" value={plan.planSha256}/>
  <button className="fm-btn fm-btn--sea" type="submit">{he?"לתקן את מסגרת השיער":"Repair crown return frames"}</button>
 </form>;
}
