import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { boardWizardRecoveryForm, BOARD_WIZARD_RECOVERY_AUTHORITY } from "@/services/generation/board-wizard-recovery";

/** Server-only operational form. A human administrator must explicitly submit;
 * rendering, refreshing or opening the creating page cannot authorize spend. */
export async function BoardWizardRecoveryForm({ gameId }: { gameId: string }) {
  if (!(await currentAdmin())) return null;
  const data = await boardWizardRecoveryForm(getContainer(), gameId);
  if (!data) return null;
  return <form className="fm-card fm-stack fm-stack--2" method="post" action={`/api/admin/games/${encodeURIComponent(gameId)}/board-wizard-recovery`}>
    <h2>התאוששות ממדידה שלא הושלמה</h2>
    <p>בורד {data.boardId}. התמונה שכבר שולמה תישאר ללא שינוי. החיוב הלא־ודאי (${(data.retainedUnknownMicroUsd / 1_000_000).toFixed(2)}) נשאר בתקציב; כרגע התחייבנו ל־${(data.committedMicroUsd / 1_000_000).toFixed(2)} מתוך $4.</p>
    <input type="hidden" name="expectedStepsSha256" value={data.expectedStepsSha256} />
    <input type="hidden" name="expectedLedgerSha256" value={data.expectedLedgerSha256} />
    <label><input type="checkbox" name="confirm" value={BOARD_WIZARD_RECOVERY_AUTHORITY} required /> מאשר/ת מדידה נוספת אחת בלבד של אותו גיליון, בלי לרנדר מחדש את הבורד הזה ובלי למחוק את החיוב הלא־ודאי. יתר העולם ימשיך במסלול הרגיל תחת תקרת $4; המשחק יישאר לבדיקת QA פרטית ולא יפורסם אוטומטית.</label>
    <button className="fm-btn fm-btn--secondary" type="submit">אישור התאוששות והמשך בדיקת QA</button>
  </form>;
}
