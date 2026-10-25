import { EXPLORERS_OPERATIONAL_RELEASE } from "@/domain/generation/explorers-operational-policy";
import { DETECTIVES_OPERATIONAL_RELEASE, detectivesOperationalQualified } from "@/domain/generation/detectives-operational-policy";
import { SOURCE_BODY_REPAIR_MANIFEST_SHA256 } from "../../../../content/detectives/source-body-repair";
import { promises as dns } from "node:dns";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { NextResponse } from "next/server";
import { NEW_QA_WORLD_BUDGET_POLICY, NEW_QA_WORLD_CAP_MICRO_USD, newQaWorldBudgetEnabled } from "@/domain/generation/qa-world-budget-policy";
import { getContainer } from "@/services/container";
import { env } from "@/lib/env";
import { BOARD_JUDGE_VERSION } from "@/infra/generation/board-verdict";
import { deliverWithProblemsOf } from "@/services/container";
import { visualReviewPolicy } from "@/domain/generation/visual-review-policy";
import { DUAL_VISUAL_REVIEW_V3 } from "@/services/generation/visual-review-release";
import { lowPainterQualified } from "@/services/generation/painter-release";
import { qualityBatchQualified } from "@/services/generation/quality-channel";
import { LEAN_WORLD_CAP_MICRO_USD, leanReleaseQualified } from "@/services/generation/lean-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Can this deployment actually reach the things it needs?
 *
 * Exists because a rotated database password looks exactly like a healthy site
 * until someone tries to buy something: pages render, the database is only
 * touched further in, and Vercel does not apply a changed environment variable
 * until the next deploy. This answers the question in one request.
 *
 * Public outside QA; the QA password gate also covers diagnostics. It
 * says whether things work and never what they are. No hostnames, no
 * connection strings, no counts.
 */
export async function GET(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const started = Date.now();
  const e = env();
  const db = await checkDb();
  const dualConfigured = Boolean(e.OPENAI_API_KEY?.trim() && e.ANTHROPIC_API_KEY?.trim());
  // A LOW painter outside its qualified configuration refuses every new draft, so say so here first.
  const painterUnqualified = e.APP_ENV === "qa" && e.LOCAL_PATCH_PAINTER === "low-v1" && !lowPainterQualified({ appEnv: e.APP_ENV,
    promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE, reviewRelease: e.LOCAL_PATCH_VISUAL_REVIEW === "dual-high-v3" ? DUAL_VISUAL_REVIEW_V3 : undefined });
  // A batch channel outside its configuration refuses every new draft; without credentials its pinned games stall.
  const batchRequested = e.APP_ENV === "qa" && e.LOCAL_PATCH_QUALITY_CHANNEL === "anthropic-batch-v1";
  const batchQualified = !batchRequested || qualityBatchQualified({ appEnv: e.APP_ENV,
    reviewRelease: e.LOCAL_PATCH_VISUAL_REVIEW === "dual-high-v3" ? DUAL_VISUAL_REVIEW_V3 : undefined });
  const batchConfigured = !batchRequested || (e.GENERATION_PROVIDER === "openai" && !!e.ANTHROPIC_API_KEY?.trim());
  // local-patch-lean/v1 outside its qualified configuration refuses every new draft; without Sol's background transport
  // a lean world cannot enroll or be judged.
  const leanRequested = e.APP_ENV === "qa" && e.LOCAL_PATCH_LEAN === "lean-v1";
  const leanQualified = !leanRequested || leanReleaseQualified({ appEnv: e.APP_ENV, promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE,
    reviewRelease: e.LOCAL_PATCH_VISUAL_REVIEW === "dual-high-v3" ? DUAL_VISUAL_REVIEW_V3 : undefined });
  const detectivesNewPolicy = e.STORAGE_PROVIDER === "db" && detectivesOperationalQualified({appEnv:e.APP_ENV,promptRelease:e.LOCAL_PATCH_PROMPT_RELEASE,identitySource:e.LOCAL_PATCH_IDENTITY_SOURCE,reviewRelease:e.LOCAL_PATCH_VISUAL_REVIEW==="dual-high-v3"?DUAL_VISUAL_REVIEW_V3:undefined,leanRelease:leanRequested?"local-patch-lean/v1":undefined});
  const leanConfigured = !leanRequested || (e.GENERATION_PROVIDER === "openai" && !!e.OPENAI_API_KEY?.trim());
  const ok = db.ok && !(e.APP_ENV === "qa" && e.LOCAL_PATCH_VISUAL_REVIEW !== "legacy" && !dualConfigured) && !painterUnqualified
    && batchQualified && batchConfigured && leanQualified && leanConfigured;
  const body = {
    ok,
    db,
    host: await hostCheck(),
    appEnv: e.APP_ENV,
    providers: { storage: e.STORAGE_PROVIDER, generation: e.GENERATION_PROVIDER, payment: e.PAYMENT_PROVIDER, email: e.EMAIL_PROVIDER, generationEnabled: e.GENERATION_ENABLED === "on" },
    patchQuality: e.GENERATION_PATCH_QUALITY ?? e.GENERATION_QUALITY,
    patchRetryQuality: e.GENERATION_PATCH_RETRY_QUALITY ?? null,
    qualityGate: { version: BOARD_JUDGE_VERSION, autoApproveClean: e.QA_AUTO_APPROVE === "true", deliverWithProblems: deliverWithProblemsOf(e.QA_AUTO_APPROVE === "true", e.APP_ENV, e.QA_DELIVER_WITH_PROBLEMS === "true") },
    visualReview: { newGames: e.APP_ENV === "qa" ? e.LOCAL_PATCH_VISUAL_REVIEW : "legacy",
      configured: dualConfigured,
      quality: { model: visualReviewPolicy("scene-quality").model, effort: "high" },
      continuity: { model: visualReviewPolicy("head-continuity").model, effort: "high" },
      explorersNewGames: detectivesNewPolicy ? {version:EXPLORERS_OPERATIONAL_RELEASE,reviewMode:"single-sol-medium/v1",model:"gpt-6.1-sol",effort:"medium",birthReviewMode:"single-sol-low/v1",birthEffort:"low",nativeHeadReturnEvidence:true,initialTier:"flex",oneUsableAssessmentPerImage:true,normalImageAttemptLimit:3,worldCapMicroUsd:4000000,automaticBudgetExtension:false} : null,
      detectivesNewGames: detectivesNewPolicy ? {version:DETECTIVES_OPERATIONAL_RELEASE,reviewMode:"single-sol-medium/v1",model:"gpt-6.1-sol",effort:"medium",birthReviewMode:"single-sol-low/v1",birthEffort:"low",nativeHeadReturnEvidence:true,initialTier:"flex",oneUsableAssessmentPerImage:true,normalImageAttemptLimit:3,worldCapMicroUsd:4000000,automaticBudgetExtension:false,sourceBodyManifestSha256:SOURCE_BODY_REPAIR_MANIFEST_SHA256} : null },
    // Which wording NEW hides and identities receive; stored ones keep their own.
    promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE,
    // The painting quality NEW local-patch drafts are pinned to; existing games keep their own.
    painter: { newGames: e.APP_ENV === "qa" ? e.LOCAL_PATCH_PAINTER ?? "by-version" : "by-version", qualified: !painterUnqualified },
    // Legacy channel configuration; new qualified Detectives use their combined SOL LOW policy; existing games keep their own.
    qualityChannel: { newGames: batchRequested ? "anthropic-batch-v1" : "sync", qualified: batchQualified, configured: batchConfigured },
    // Whether NEW local-patch drafts are pinned lean (local-patch-lean/v1), instead of the painter and channel above.
    lean: { newGames: leanRequested ? "lean-v1" : "off", qualified: leanQualified, configured: leanConfigured,
      ...(leanRequested ? { worldCapMicroUsd: LEAN_WORLD_CAP_MICRO_USD } : {}) },
    worldBudget: { newQaPolicy: newQaWorldBudgetEnabled({ appEnv: e.APP_ENV, storageId: e.STORAGE_PROVIDER ?? "",
      promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE, reviewRelease: e.LOCAL_PATCH_VISUAL_REVIEW === "dual-high-v3" ? DUAL_VISUAL_REVIEW_V3 : undefined })
      ? { version: NEW_QA_WORLD_BUDGET_POLICY, capMicroUsd: NEW_QA_WORLD_CAP_MICRO_USD } : null, historicalDefaultCapMicroUsd: 5_000_000 },
    // CLI deploys carry no git sha; APP_COMMIT is set at deploy time so what is
    // checked can be shown to be what is deployed.
    commit: (process.env.APP_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    tookMs: Date.now() - started,
  };
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

async function checkDb(): Promise<{ ok: boolean; code?: string; error?: string }> {
  try {
    // The cheapest query that proves a real round trip, and reads nobody's data.
    await getContainer().db.$queryRaw`select 1`;
    return { ok: true };
  } catch (err) {
    // Prisma's code is the useful half and leaks nothing: P1000 is a rejected
    // password, P1001 is a server it cannot reach. Scrubbing the message can
    // leave it empty, which is the least helpful thing to say at the one moment
    // anyone reads this.
    const code = typeof (err as { code?: unknown })?.code === "string" ? ((err as { code: string }).code) : undefined;
    const name = err instanceof Error ? err.name : "Error";
    return { ok: false, code: code ?? name, error: scrub(err) || meaningOf(code) };
  }
}

/**
 * Where DATABASE_URL points, and whether that can be reached over IPv4.
 *
 * The classic failure on this stack is not a bad password: Supabase's direct
 * host is IPv6-only and a serverless function egresses IPv4, so the same URL
 * works from a laptop and never from production. Reporting which addresses
 * resolve tells those two apart at a glance.
 *
 * The pooler hostname is a shared regional endpoint and names nobody, so it is
 * safe to print. The direct host carries the project ref, so it is not.
 */
async function hostCheck(): Promise<{ host: string; port: string; ipv4: number; ipv6: number; error?: string }> {
  let host = "";
  let port = "";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    host = u.hostname;
    port = u.port;
  } catch {
    return { host: "<unparseable>", port: "", ipv4: 0, ipv6: 0, error: "DATABASE_URL is not a URL" };
  }
  const shown = /\.pooler\.supabase\.com$/i.test(host) ? host : "<direct host>";
  try {
    const [v4, v6] = await Promise.all([dns.resolve4(host).catch(() => []), dns.resolve6(host).catch(() => [])]);
    return { host: shown, port, ipv4: v4.length, ipv6: v6.length, ...(v4.length === 0 && v6.length === 0 ? { error: "this hostname does not resolve" } : {}) };
  } catch (err) {
    return { host: shown, port, ipv4: 0, ipv6: 0, error: err instanceof Error ? err.message.slice(0, 80) : "lookup failed" };
  }
}

function meaningOf(code: string | undefined): string {
  if (code === "P1000") return "the database rejected the credentials in DATABASE_URL";
  if (code === "P1001") return "the database host cannot be reached from here";
  if (code === "P1002") return "the database host timed out";
  return "no detail available";
}

/**
 * A database error carries the connection string often enough that printing it
 * on a public endpoint would undo the rotation this route exists to verify.
 */
function scrub(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Prisma's messages open with a blank line and an "Invalid invocation" banner,
  // so taking line zero returned an empty string — which is this route's whole
  // purpose going missing at the one moment anyone reads it.
  const line =
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^invalid `?prisma/i.test(l))
      .join(" ") || raw.trim();
  return line
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")
    .replace(/\b[\w.-]+\.(?:supabase\.co|pooler\.supabase\.com)\b/gi, "<host>")
    .slice(0, 200);
}
