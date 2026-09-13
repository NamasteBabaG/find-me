import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentAdmin } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { readLocalPatchQualityPilot } from "@/services/generation/local-patch-quality-pilot";
import { stageIdentityPilotAction, resumeIdentityPilotAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Operational, authenticated page only. Loading it cannot buy or resume work. */
export default async function IdentityPilotPage({ params, searchParams }: {
  params: Promise<{ gameId: string }>; searchParams: Promise<{ outcome?: string }>;
}) {
  await requireQaAccess();
  if (env().APP_ENV !== "qa" || !(await currentAdmin())) notFound();
  const { gameId } = await params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) notFound();
  const c = getContainer();
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true } });
  if (!game || game.deletedAt || game.styleVersion !== "local-patch-world-v1" || game.scenes.length !== 9
    || game.scenes.some(scene => scene.sceneVersion !== 9)) notFound();
  const [job, rows, i18n, query, pilot] = await Promise.all([
    c.db.generationJob.findUnique({ where: { id: `job_${gameId}` }, select: { status: true, currentStep: true, lastError: true } }),
    c.db.targetVariantAsset.findMany({ where: { variant: "A", provider: "local-patch", assetId: { not: null }, targetInstance: { gameScene: { gameId } } },
      select: { id: true, assetId: true, attempts: true, status: true, judgeJson: true } }),
    getI18n(), searchParams, readLocalPatchQualityPilot(c, gameId),
  ]);
  const t = i18n.t.identityPilot;
  const notice = query.outcome === "staged" ? t.staged : query.outcome === "resumed" ? t.resumed : query.outcome === "blocked" ? t.blocked : null;
  const field = (name: string, label: string, length = 160) => <label className="fm-stack fm-stack--1"><span>{label}</span>
    <input className="fm-input" name={name} dir="ltr" required maxLength={length} autoComplete="off" /></label>;
  const reason = <label className="fm-stack fm-stack--1"><span>{t.reason}</span><textarea className="fm-input" name="reason" required minLength={10} maxLength={1_000} rows={3} /></label>;
  return <div className="fm-stack fm-stack--3">
    <Link href={`/admin/orders/${gameId}`}>{t.back}</Link><h1>{t.title}</h1><p>{t.note}</p>
    {notice ? <p role="status">{notice}</p> : null}
    <section className="fm-card"><h2>{t.status}</h2><p dir="ltr">{game.status} / {job?.status} / {job?.currentStep}</p><p>{job?.lastError}</p></section>
    {pilot ? <section className="fm-card" dir="ltr"><code>{pilot.pilotId} | {pilot.hideId} | {pilot.state}</code><br />
      <code>{pilot.candidateSha256 ?? "—"}</code></section> : null}
    <section className="fm-card fm-stack fm-stack--2"><h2>{t.candidate}</h2>{rows.map(row => {
      let evidence: { hide?: unknown; judgedSha256?: unknown } = {};
      try { evidence = JSON.parse(row.judgeJson ?? "{}"); } catch { /* no invented binding */ }
      return <div key={row.id} dir="ltr"><code>{typeof evidence?.hide === "string" ? evidence.hide : row.id} | {row.status} | {row.attempts} | {row.assetId}</code><br />
        <code>{typeof evidence?.judgedSha256 === "string" ? evidence.judgedSha256 : "—"}</code><br />
        <Link href={`/api/assets/${row.assetId}`}>{t.open}</Link></div>;
    })}</section>
    <form action={stageIdentityPilotAction} className="fm-card fm-stack fm-stack--2">
      <h2>{t.stage}</h2><input type="hidden" name="gameId" value={gameId} />
      {field("hideId", t.hideId)}{field("expectedAssetId", t.assetId)}{field("expectedSha256", t.sha, 64)}{reason}
      <label><input type="checkbox" required name="confirm" value="one-bounded-image-then-stop" /> {t.stageConfirm}</label>
      <button type="submit" className="fm-btn fm-btn--secondary">{t.stage}</button>
    </form>
    <form action={resumeIdentityPilotAction} className="fm-card fm-stack fm-stack--2">
      <h2>{t.resume}</h2><input type="hidden" name="gameId" value={gameId} />
      {field("pilotId", t.pilotId)}{field("expectedCandidateSha256", t.candidateSha, 64)}{reason}
      <label><input type="checkbox" required name="confirm" value="resume-candidates-for-automatic-review" /> {t.resumeConfirm}</label>
      <button type="submit" className="fm-btn fm-btn--secondary">{t.resume}</button>
    </form>
  </div>;
}
