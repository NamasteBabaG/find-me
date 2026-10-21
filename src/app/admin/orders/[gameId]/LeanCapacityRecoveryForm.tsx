import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { planLeanCapacityRecovery } from "@/services/generation/lean-capacity-recovery";
import { LEAN_CAPACITY_RECOVERY_CONFIRMATION } from "@/domain/generation/lean-capacity-recovery";
import { authorizeLeanCapacityRecoveryAction } from "../../actions";

export async function LeanCapacityRecoveryForm({ gameId }: { gameId: string }) {
  if (!await currentAdmin()) return null;
  let plan;
  try { plan = await planLeanCapacityRecovery(getContainer(), gameId); } catch { return null; }
  const { t } = await getI18n(), p = t.adminIdentityRevision;
  return <form action={authorizeLeanCapacityRecoveryAction} className="fm-card fm-stack fm-stack--2">
    <h3>{p.capacityRecoveryTitle}</h3><p>{p.capacityRecoveryDescription}</p>
    <p>{p.committed}: <b dir="ltr">${(plan.binding.committedMicroUsd / 1e6).toFixed(2)}</b> · {p.reserved}: <b dir="ltr">${(plan.binding.reservedMicroUsd / 1e6).toFixed(2)}</b> · {p.cap}: <b dir="ltr">$12.00</b></p>
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="planSha256" value={plan.planSha256} />
    <label><input type="checkbox" name="confirm" value={LEAN_CAPACITY_RECOVERY_CONFIRMATION} required /> {p.capacityRecoveryConfirm}</label>
    <button className="fm-btn fm-btn--sea" type="submit">{p.capacityRecoveryGrant}</button>
  </form>;
}
