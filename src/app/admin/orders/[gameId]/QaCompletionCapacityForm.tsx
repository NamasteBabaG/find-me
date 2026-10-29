import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { planQaCompletionCapacity } from "@/services/generation/qa-completion-capacity";
import { QA_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-completion-capacity";
import { authorizeQaCompletionCapacityAction } from "../../actions";

export async function QaCompletionCapacityForm({gameId}:{gameId:string}) {
  const actor=await currentAdmin();if(!actor)return null;
  let plan;try{plan=await planQaCompletionCapacity(getContainer(),gameId);}catch{return null;}
  if(plan.binding.state.ownerId!==actor.id)return null;
  const {t}=await getI18n(),p=t.adminQaCompletion;
  return <form action={authorizeQaCompletionCapacityAction} className="fm-card fm-stack fm-stack--2">
    <h3>{p.title}</h3><p>{p.description}</p>
    <p>{p.committed}: <b dir="ltr">${(plan.binding.committedMicroUsd/1e6).toFixed(2)}</b> · {p.reserved}: <b dir="ltr">${(plan.binding.reservedMicroUsd/1e6).toFixed(2)}</b> · {p.cap}: <b dir="ltr">$12.00</b></p>
    <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="planSha256" value={plan.planSha256}/>
    <label>{p.evidence}<input className="fm-input" name="ownerAuthorizationSha256" dir="ltr" required pattern="[a-f0-9]{64}" minLength={64} maxLength={64} autoComplete="off"/></label>
    <label><input type="checkbox" name="confirm" value={QA_COMPLETION_CONFIRMATION} required/>{p.confirm}</label>
    <button className="fm-btn fm-btn--sea" type="submit">{p.grant}</button>
  </form>;
}
