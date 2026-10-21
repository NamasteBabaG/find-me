import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { IDENTITY_SOURCE_REVISION_CONFIRMATION, IDENTITY_SOURCE_RETRY_CONFIRMATION, planIdentitySourceRevision } from "@/services/generation/identity-source-revision";
import { identityRevisionPending, identityRevisionHeldOf, identityRevisionDeferralsOf, identityRevisionDiagnosticCode, identityRevisionPausedOf } from "@/services/generation/identity-source-revision-state";
import { beginIdentitySourceRevisionAction, retryIdentitySourceRevisionAction } from "../../actions";

export async function IdentitySourceRevisionForm({ gameId }: { gameId: string }) {
  if (!await currentAdmin()) return null;
  const c = getContainer(), { t } = await getI18n(), p = t.adminIdentityRevision;
  if (await identityRevisionPending(c.db, gameId)) {
    const held = await identityRevisionHeldOf(c.db, gameId), deferrals = await identityRevisionDeferralsOf(c.db, gameId), paused = await identityRevisionPausedOf(c.db, gameId);
    return <section className="fm-card fm-stack fm-stack--2"><h2>{p.title}</h2><p>{held ? p.held : p.started}</p>
      {held ? <p>{p.diagnosis}: <code>{identityRevisionDiagnosticCode(held.metaJson)}</code></p> : paused ? <p>{p.paused}</p> : deferrals >= 3 ? <p>{p.delayed} ({deferrals})</p> : null}
      {held ? <form action={retryIdentitySourceRevisionAction} className="fm-stack fm-stack--2">
        <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="heldId" value={held.id} />
        <label><input type="checkbox" name="confirm" value={IDENTITY_SOURCE_RETRY_CONFIRMATION} required /> {p.retryConfirm}</label>
        <button className="fm-btn fm-btn--sea" type="submit">{p.retry}</button>
      </form> : null}</section>;
  }
  let plan;
  try { plan = await planIdentitySourceRevision(c, gameId); } catch { return null; }
  const money = (value: number) => `$${(value / 1e6).toFixed(2)}`;
  return <form action={beginIdentitySourceRevisionAction} className="fm-card fm-stack fm-stack--2">
    <h2>{p.title}</h2><p>{p.description}</p>
    <p>{p.committed}: <b dir="ltr">{money(plan.committedMicroUsd)}</b> · {p.reserved}: <b dir="ltr">{money(plan.unknownMicroUsd)}</b> · {p.cap}: <b dir="ltr">{money(plan.capMicroUsd)}</b></p>
    {plan.completion ? <p>{p.newPictures}: <b>{plan.completion.newPicturesStillNeeded}</b> · {p.appearanceChecks}: <b>{plan.completion.currentCanonicalReviewsStillNeeded}</b>. {p.capacityNotice}</p> : null}
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="planSha256" value={plan.planSha256} />
    <label><input type="checkbox" name="confirm" value={IDENTITY_SOURCE_REVISION_CONFIRMATION} required /> {p.confirm}</label>
    <button className="fm-btn fm-btn--sea" type="submit">{p.begin}</button>
  </form>;
}
