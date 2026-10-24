import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { planDetectivesCompletionExtension, planDetectivesCompletionTail } from "@/services/generation/detectives-completion-budget";
import { DETECTIVES_EXTENSION_CONFIRMATION, DETECTIVES_TAIL_CONFIRMATION } from "@/domain/generation/detectives-completion-budget";
import { authorizeDetectivesCompletionExtensionAction, authorizeDetectivesCompletionTailAction } from "../../actions";

export async function DetectivesCompletionExtensionForm({ gameId }: { gameId: string }) {
  const actor = await currentAdmin();
  if (!actor) return null;
  let plan, tail = false;
  try { plan = await planDetectivesCompletionTail(getContainer(), gameId); tail = true; }
  catch { try { plan = await planDetectivesCompletionExtension(getContainer(), gameId); } catch { return null; } }
  if (plan.binding.ownerId !== actor.id) return null;
  const { t } = await getI18n(), p = t.adminIdentityRevision;
  return <form action={tail ? authorizeDetectivesCompletionTailAction : authorizeDetectivesCompletionExtensionAction} className="fm-card fm-stack fm-stack--2">
    <h3>{tail ? p.detectivesTailTitle : p.detectivesExtensionTitle}</h3><p>{tail ? p.detectivesTailDescription : p.detectivesExtensionDescription}</p>
    <p>{p.committed}: <b dir="ltr">${(plan.binding.committedMicroUsd / 1e6).toFixed(2)}</b> · {p.reserved}: <b dir="ltr">${(plan.binding.reservedMicroUsd / 1e6).toFixed(2)}</b> · {p.cap}: <b dir="ltr">${(plan.binding.capMicroUsd / 1e6).toFixed(2)}</b></p>
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="planSha256" value={plan.planSha256} />
    <label>{p.detectivesBudgetEvidence}<input className="fm-input" name="ownerAuthorizationSha256" dir="ltr" required pattern="[a-f0-9]{64}" minLength={64} maxLength={64} autoComplete="off" /></label>
    <label><input type="checkbox" name="confirm" value={tail ? DETECTIVES_TAIL_CONFIRMATION : DETECTIVES_EXTENSION_CONFIRMATION} required /> {tail ? p.detectivesTailConfirm : p.detectivesExtensionConfirm}</label>
    <button className="fm-btn fm-btn--sea" type="submit">{tail ? p.detectivesTailGrant : p.detectivesExtensionGrant}</button>
  </form>;
}
