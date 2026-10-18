import Link from "next/link";
import { notFound } from "next/navigation";
import { env, spendGuard } from "@/lib/env";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentUser } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { getContainer } from "@/services/container";
import { planSubjectUpgrade } from "@/services/generation/subject-upgrade";
import { applyOwnedQaSubjectUpgrade } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { robots: { index: false, follow: false } };

/** Private operator preflight on QA; no photo, email or credential is rendered. */
export default async function QaSubjectUpgradePage({ params }: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") notFound();
  await requireQaAccess();
  const user = await currentUser();
  if (!user) notFound();
  const { gameId } = await params, c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true } });
  if (game?.ownerId !== user.id) notFound();
  const [{ t }, plan] = await Promise.all([getI18n(), planSubjectUpgrade(c, { gameId, ownerId: user.id })]);
  const copy = t.qaSubjectUpgrade, allowedTester = spendGuard().testers.includes(user.email.toLowerCase());
  return <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
    <h1>{copy.title}</h1><p>{copy.description}</p>
    {plan.budget && <p>{copy.budget}: <b dir="ltr">${(plan.budget.committedMicroUsd / 1e6).toFixed(6)} / ${(plan.budget.capMicroUsd / 1e6).toFixed(2)}</b></p>}
    <p>{copy.reviews}: <b>{plan.subjectReviewsNeeded}</b></p>
    {!plan.eligible && <section role="status"><h2>{copy.blocked}</h2><ul>{plan.refusals.map(reason => <li key={reason}>{reason}</li>)}</ul></section>}
    {!allowedTester && <p role="status">{copy.tester}</p>}
    {plan.eligible && allowedTester && <form action={applyOwnedQaSubjectUpgrade}>
      <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="planSha256" value={plan.planSha256} />
      <button className="fm-btn" type="submit">{copy.apply}</button>
    </form>}
    <Link href={`/creating/${gameId}`}>{copy.back}</Link>
  </main>;
}
