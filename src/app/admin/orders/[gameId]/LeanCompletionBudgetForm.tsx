import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { planLeanCompletionBudget } from "@/services/generation/lean-completion-budget";
import { LEAN_COMPLETION_BUDGET_CONFIRMATION } from "@/domain/generation/lean-completion-budget";
import { authorizeLeanCompletionBudgetAction } from "../../actions";

export async function LeanCompletionBudgetForm({ gameId }: { gameId: string }) {
  if (!await currentAdmin()) return null;
  let plan;
  try { plan = await planLeanCompletionBudget(getContainer(), gameId); } catch { return null; }
  const { t } = await getI18n(), p = t.adminIdentityRevision;
  return <form action={authorizeLeanCompletionBudgetAction} className="fm-card fm-stack fm-stack--2">
    <h3>{p.completionBudgetTitle}</h3><p>{p.completionBudgetDescription}</p>
    <p>{p.committed}: <b dir="ltr">${(plan.binding.committedMicroUsd / 1e6).toFixed(2)}</b> · {p.reserved}: <b dir="ltr">${(plan.binding.reservedMicroUsd / 1e6).toFixed(2)}</b> · {p.cap}: <b dir="ltr">$6.00</b></p>
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="planSha256" value={plan.planSha256} />
    <label><input type="checkbox" name="confirm" value={LEAN_COMPLETION_BUDGET_CONFIRMATION} required /> {p.completionBudgetConfirm}</label>
    <button className="fm-btn fm-btn--sea" type="submit">{p.completionBudgetGrant}</button>
  </form>;
}
