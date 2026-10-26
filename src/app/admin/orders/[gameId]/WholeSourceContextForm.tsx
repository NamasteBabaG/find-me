import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { env } from "@/lib/env";
import { readWholeSourceContextPin } from "@/services/generation/whole-source-context-pin";
import { planWholeSourceContextRepair } from "@/services/generation/whole-source-context-repair";
import { stageWholeSourceContextAction } from "../../actions";

/** QA operator control. Never an image approval or a new spending ceiling. */
export async function WholeSourceContextForm({ gameId, outcome }: { gameId: string; outcome?: string }) {
  if (env().APP_ENV !== "qa") return null;
  const admin = await currentAdmin(); if (!admin) return null;
  const c = getContainer(), { t } = await getI18n(), copy = t.adminIdentityRevision;
  const pin = await readWholeSourceContextPin(c.db,gameId);
  if (pin) {
    if (pin.ownerId !== admin.id) return null;
    const row = await c.db.targetVariantAsset.findUnique({where:{id:pin.selected.rowId}});
    const game = await c.db.game.findUnique({where:{id:gameId},select:{status:true}});
    const complete = row?.status === "GENERATED" && ["READY","DELIVERED"].includes(game?.status ?? "");
    const refused = row?.status === "FAILED" && row.attempts === 4;
    return <section className="fm-card fm-stack fm-stack--2" aria-label={copy.sourceContextTitle}>
      <h3>{copy.sourceContextTitle}</h3><p role="status">{complete ? copy.sourceContextComplete : refused ? copy.sourceContextRefused : copy.sourceContextQueued}</p>
    </section>;
  }
  let preview; try { preview=await planWholeSourceContextRepair(c,gameId,admin.id); } catch { return null; }
  return <form action={stageWholeSourceContextAction} className="fm-card fm-stack fm-stack--2">
    <h3>{copy.sourceContextTitle}</h3>
    <p>{copy.sourceContextDescription}</p>
    <p>{tf(copy.sourceContextBudget,{remaining:(preview.remainingMicroUsd/1e6).toFixed(3)})}</p>
    {outcome === "blocked" ? <p role="alert">{copy.sourceContextBlocked}</p> : null}
    <input type="hidden" name="gameId" value={gameId}/>
    <input type="hidden" name="planSha256" value={preview.planSha256}/>
    <button className="fm-btn fm-btn--sea" type="submit">{copy.sourceContextButton}</button>
  </form>;
}
