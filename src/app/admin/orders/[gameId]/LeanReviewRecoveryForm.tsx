import { identitySourceRevisionSupported } from "@/services/generation/identity-source-revision";
import { identityRevisionPending } from "@/services/generation/identity-source-revision-state";
import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { LEAN_REVIEW_RECOVERY_CONFIRMATION, planLeanReviewRecovery } from "@/services/generation/lean-review-recovery";
import { applyLeanReviewRecoveryAction } from "../../actions";

const dollars = (microUsd: number) => `$${(microUsd / 1e6).toFixed(2)}`;

/**
 * local-patch-lean-review-recovery/v1: the explicit release of one lean world its continuation quota (2+4) parked. Shown
 * only to an administrator, and only while the read-only plan is eligible; the form carries that plan's digest, so the
 * release binds exactly what is shown. Nothing about the child, the photograph or the account is rendered.
 */
export async function LeanReviewRecoveryForm({ gameId }: { gameId: string }) {
  if (!(await currentAdmin())) return null;
  if (await identityRevisionPending(getContainer().db, gameId)) return null;
  if (await identitySourceRevisionSupported(getContainer(), gameId)) return null;
  const plan = await planLeanReviewRecovery(getContainer(), { gameId });
  if (!plan.eligible || !plan.ledger) return null;
  return <form className="fm-card fm-stack fm-stack--2" action={applyLeanReviewRecoveryAction}>
    <h2>שחרור עולם Lean שנעצר במכסת ההמשכים</h2>
    <p>{plan.held.length === 1 ? "תשובת שיפוט אחת שהספק סיים בכשל ממתינה" : `${plan.held.length} תשובות שיפוט שהספק סיים בכשל ממתינות`} להמשך,
      אחרי שהמכסה הקבועה (2+4) נוצלה. השחרור כותב הרשאה אחת, קשורה לעצירה ולספר החשבונות כפי שהם מוצגים כאן, ואינו משנה את המשחק, את ה-job או חיובים.
      החיובים הלא ודאיים נשארים שמורים במלואם, ותקרת התקציב אינה משתנה.</p>
    <p>מחויב: <b dir="ltr">{dollars(plan.ledger.committedMicroUsd)}</b> מתוך <b dir="ltr">{dollars(plan.ledger.capMicroUsd)}</b>,
      ונותרו <b dir="ltr">{dollars(plan.ledger.remainingMicroUsd)}</b>.</p>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="planSha256" value={plan.planSha256} />
    <label><input type="checkbox" name="confirm" value={LEAN_REVIEW_RECOVERY_CONFIRMATION} required /> מאשר/ת שקיבלתי הרשאה מפורשת להמשיך את העולם הזה. ההמשך כרוך בחיובי API נוספים עד התקרה.</label>
    <button className="fm-btn fm-btn--sea" type="submit">שחרור העולם והמשך היצירה</button>
  </form>;
}
