import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION, localPatchRepairResumeForm } from "@/services/generation/local-patch-repair-resume";
import { resumeLocalPatchRepairsAction } from "../../actions";

export async function LocalPatchRepairResumeForm({ gameId }: { gameId: string }) {
  if (!(await currentAdmin())) return null;
  const candidate = await localPatchRepairResumeForm(getContainer(), gameId);
  if (!candidate) return null;
  return <form className="fm-card fm-stack fm-stack--2" action={resumeLocalPatchRepairsAction}>
    <h2>ניסיון תיקון נוסף למחבואים שנכשלו</h2>
    <p>היצירה הרגילה הסתיימה. {candidate.failedHides} מחבואים ממתינים לתיקון אחד נוסף לכל מחבוא. המחבואים שאושרו יישארו ללא שינוי; הניסיונות והחיובים הקודמים נשמרים, ותקרת התקציב אינה משתנה.</p>
    <input type="hidden" name="gameId" value={gameId} />
    <label><input type="checkbox" name="confirm" value={LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION} required /> מאשר/ת שקיבלתי הרשאה מפורשת מהמשתמש לניסיון נוסף אחד לכל מחבוא שנכשל. ניסיון התיקון עשוי להיות כרוך בחיוב API נוסף.</label>
    <button className="fm-btn fm-btn--sea" type="submit">אישור ניסיון תיקון נוסף והמשך יצירה</button>
  </form>;
}
