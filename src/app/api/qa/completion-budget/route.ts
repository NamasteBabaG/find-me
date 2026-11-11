import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { currentAdmin } from "@/lib/server/session";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { QA_FIVE_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-five-dollar-completion";
import { authorizeQaFiveCompletion, previewQaFiveCompletion, qaFiveCompletionStatus } from "@/services/generation/qa-five-dollar-completion";
import { QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION, QA_SUNBURST_TAIL_PLAN_SELECTOR } from "@/domain/generation/qa-sunburst-tail-completion";
import { authorizeQaSunburstTailCompletion, previewQaSunburstTailCompletion, qaSunburstTailCompletionStatus } from "@/services/generation/qa-sunburst-tail-completion";
import { JOURNEY_WALL_REPLACEMENT_CONFIRMATION, JOURNEY_WALL_REPLACEMENT_SELECTOR } from "@/domain/generation/journey-source-head";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * explicit-existing-qa-five-dollar-completion/v1, QA only, owner administrator only.
 * GET previews the frozen plan (JSON, or `view=form` for a plain operator page);
 * it never records anything. POST (JSON, or the page's form) records the single
 * cumulative five-dollar ceiling for the owner's own existing game with the exact
 * confirmation, the previewed plan hash and the hash of the owner's recorded
 * decision. Nothing here buys, ticks, releases an UNKNOWN or approves a picture.
 * Responses carry money and the named operation only, never private evidence.
 * Operator tooling (English), not consumer copy.
 *
 * `plan=sunburst-tail-v1` selects explicit-existing-qa-sunburst-tail-completion/v1
 * (the frozen finite Sunburst list) on both GET and POST, with its own
 * confirmation. Without a selector both methods keep the single-Paris v1 plan.
 */
type Plan = "five-v1" | "sunburst-tail-v1" | typeof JOURNEY_WALL_REPLACEMENT_SELECTOR;
/** Absent: the original v1 plan. Exactly the tail selector: the tail plan. Anything else: refused. */
const planOf = (req: Request): Plan | null => {
  const values = new URL(req.url).searchParams.getAll("plan");
  if (values.length === 0) return "five-v1";
  if (values.length !== 1) return null;
  const value = values[0];
  return value === QA_SUNBURST_TAIL_PLAN_SELECTOR || value === JOURNEY_WALL_REPLACEMENT_SELECTOR ? value : null;
};
const NO_STORE = { "Cache-Control": "no-store" };
const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" };
const gameIdOk = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const shaOk = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const refused = (code: string, status = 409) => NextResponse.json({ ok: false, code }, { status, headers: NO_STORE });
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const usd = (micro: number) => "$" + (micro / 1_000_000).toFixed(6);
const page = (title: string, body: string, status = 200) => new NextResponse(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
  + `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}dt{font-weight:600}input[type=text]{width:100%;font:inherit;padding:.5rem}`
  + `button{font:inherit;min-height:48px;padding:0 1.25rem;margin-top:1rem}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`, { status, headers: HTML });

async function boundedBody(req: Request) {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096)) throw Error("Invalid body length");
  const reader = req.body?.getReader();
  if (!reader) throw Error("Missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { void reader.cancel().catch(() => undefined); throw Error("Oversized body"); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } finally { reader.releaseLock(); }
}

async function owner(gameId: string) {
  const actor = await currentAdmin();
  if (!actor || env().APP_ENV !== "qa") return null;
  const game = await getContainer().db.game.findUnique({ where: { id: gameId }, select: { ownerId: true } });
  return game?.ownerId === actor.id ? actor : null;
}

export async function GET(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const query = new URL(req.url).searchParams, gameId = query.get("gameId"), form = query.get("view") === "form";
  if (!gameIdOk(gameId)) return form ? page("Five-dollar completion", "<p>Invalid game.</p>", 400) : refused("INVALID_REQUEST", 400);
  if (!await owner(gameId)) return form ? page("Five-dollar completion", "<p>Only the game's owner administrator may view this.</p>", 403) : refused("FORBIDDEN", 403);
  const plan = planOf(req);
  if (!plan) return form ? page("Five-dollar completion", "<p>Unknown plan.</p>", 400) : refused("INVALID_REQUEST", 400);
  const c = getContainer();
  if (plan === JOURNEY_WALL_REPLACEMENT_SELECTOR) {
    try {
      const { previewJourneyWallReplacement } = await import("@/services/generation/journey-source-head-recovery");
      return NextResponse.json({ ok: true, plan, confirmation: JOURNEY_WALL_REPLACEMENT_CONFIRMATION,
        ...await previewJourneyWallReplacement(c, gameId) }, { headers: NO_STORE });
    } catch { return refused("GREAT_WALL_REPLACEMENT_REFUSED"); }
  }
  if (plan === "sunburst-tail-v1") return tailGet(c, gameId, form);
  try {
    const status = await qaFiveCompletionStatus(c, gameId);
    if (status) {
      if (form) return page("Five-dollar completion", `<p>Already recorded. Status: <strong>${esc(status.status)}</strong>.</p>`
        + `<dl><dt>Ceiling</dt><dd>${usd(status.capMicroUsd)} total (birth ${usd(status.baseCapMicroUsd)})</dd>`
        + `<dt>Named operation</dt><dd>${esc(status.nextOperation.kind)}: ${esc(status.nextOperation.hideId)}</dd></dl>`);
      return NextResponse.json({ ok: true, recorded: true, status: status.status, baseCapMicroUsd: status.baseCapMicroUsd,
        capMicroUsd: status.capMicroUsd, nextOperation: status.nextOperation }, { headers: NO_STORE });
    }
    const preview = await previewQaFiveCompletion(c, gameId);
    const { ownerId: _owner, ...publicPreview } = preview;
    if (form) return page("Five-dollar completion", `<p>Recording this raises this one game's cumulative ceiling from ${usd(preview.baseCapMicroUsd)} `
      + `to ${usd(preview.capMicroUsd)}. It buys nothing and changes no bill, attempt or UNKNOWN reserve.</p>`
      + `<dl><dt>Game</dt><dd>${esc(gameId)}</dd><dt>Committed now</dt><dd>${usd(preview.committedMicroUsd)} (reserved ${usd(preview.reservedMicroUsd)}, `
      + `${preview.unknownCount} UNKNOWN kept whole)</dd><dt>Named operation</dt><dd>${esc(preview.nextOperation.kind)}: ${esc(preview.nextOperation.hideId)}, `
      + `needs ${usd(preview.nextOperation.requiredMicroUsd)}; ${usd(preview.nextOperation.remainingUnderBaseMicroUsd)} left under the original ceiling</dd>`
      + `<dt>Plan</dt><dd><code>${esc(preview.planSha256)}</code></dd></dl>`
      + `<form method="post" action="/api/qa/completion-budget"><input type="hidden" name="gameId" value="${esc(gameId)}">`
      + `<input type="hidden" name="planSha256" value="${esc(preview.planSha256)}">`
      + `<input type="hidden" name="confirmation" value="${esc(QA_FIVE_COMPLETION_CONFIRMATION)}">`
      + `<label for="evidence">SHA-256 of your recorded decision</label>`
      + `<input id="evidence" type="text" name="ownerAuthorizationSha256" required pattern="[a-f0-9]{64}" autocomplete="off" spellcheck="false">`
      + `<button type="submit">Record the five-dollar ceiling</button></form>`);
    return NextResponse.json({ ok: true, recorded: false, confirmation: QA_FIVE_COMPLETION_CONFIRMATION, ...publicPreview }, { headers: NO_STORE });
  } catch {
    return form ? page("Five-dollar completion", "<p>No plan can be recorded for this game now. Nothing was changed.</p>", 409) : refused("FIVE_DOLLAR_PLAN_REFUSED");
  }
}

const TAIL_TITLE = "Five-dollar Sunburst completion";
const TAIL_ACTION = "/api/qa/completion-budget?plan=" + QA_SUNBURST_TAIL_PLAN_SELECTOR;

/** The finite Sunburst list: every named operation and the list's full reservation. Preview only. */
async function tailGet(c: ReturnType<typeof getContainer>, gameId: string, form: boolean) {
  try {
    const status = await qaSunburstTailCompletionStatus(c, gameId);
    if (status) {
      if (form) return page(TAIL_TITLE, `<p>Already recorded. Status: <strong>${esc(status.status)}</strong>.</p>`
        + `<dl><dt>Ceiling</dt><dd>${usd(status.capMicroUsd)} total (birth ${usd(status.baseCapMicroUsd)})</dd>`
        + `<dt>Named operations</dt><dd><ul>${status.operations.map(op => `<li>${esc(op.kind)}: ${esc(op.hideId)}, ${usd(op.requiredMicroUsd)}</li>`).join("")}</ul></dd>`
        + `<dt>Full reservation</dt><dd>${usd(status.requiredMicroUsd)}</dd></dl>`);
      return NextResponse.json({ ok: true, recorded: true, plan: QA_SUNBURST_TAIL_PLAN_SELECTOR, status: status.status, baseCapMicroUsd: status.baseCapMicroUsd,
        capMicroUsd: status.capMicroUsd, requiredMicroUsd: status.requiredMicroUsd, operations: status.operations }, { headers: NO_STORE });
    }
    const preview = await previewQaSunburstTailCompletion(c, gameId);
    const { ownerId: _owner, ...publicPreview } = preview;
    if (form) return page(TAIL_TITLE, `<p>Recording this raises this one game's cumulative ceiling from ${usd(preview.baseCapMicroUsd)} `
      + `to ${usd(preview.capMicroUsd)} for exactly the operations below. It buys nothing and changes no bill, attempt, picture, review or UNKNOWN reserve.</p>`
      + `<dl><dt>Game</dt><dd>${esc(gameId)}</dd><dt>Committed now</dt><dd>${usd(preview.committedMicroUsd)} (reserved ${usd(preview.reservedMicroUsd)}, `
      + `${preview.unknownCount} UNKNOWN kept whole)</dd><dt>Named operations</dt><dd><ul>`
      + preview.operations.map(op => `<li>${esc(op.kind)}: ${esc(op.hideId)}, needs ${usd(op.requiredMicroUsd)} `
        + `(image ${usd(op.imageReserveMicroUsd)}, review ${usd(op.reviewCoverageMicroUsd)})</li>`).join("")
      + `</ul></dd><dt>Full reservation</dt><dd>${usd(preview.requiredMicroUsd)}; ${usd(preview.remainingUnderBaseMicroUsd)} left under the original ceiling; `
      + `${usd(preview.committedMicroUsd + preview.requiredMicroUsd)} of ${usd(preview.capMicroUsd)} if every operation is bought</dd>`
      + `<dt>Plan</dt><dd><code>${esc(preview.planSha256)}</code></dd></dl>`
      + `<form method="post" action="${esc(TAIL_ACTION)}"><input type="hidden" name="gameId" value="${esc(gameId)}">`
      + `<input type="hidden" name="planSha256" value="${esc(preview.planSha256)}">`
      + `<input type="hidden" name="confirmation" value="${esc(QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION)}">`
      + `<label for="evidence">SHA-256 of your recorded decision</label>`
      + `<input id="evidence" type="text" name="ownerAuthorizationSha256" required pattern="[a-f0-9]{64}" autocomplete="off" spellcheck="false">`
      + `<button type="submit">Record the five-dollar Sunburst ceiling</button></form>`);
    return NextResponse.json({ ok: true, recorded: false, plan: QA_SUNBURST_TAIL_PLAN_SELECTOR, confirmation: QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION, ...publicPreview }, { headers: NO_STORE });
  } catch {
    return form ? page(TAIL_TITLE, "<p>No plan can be recorded for this game now. Nothing was changed.</p>", 409) : refused("FIVE_DOLLAR_PLAN_REFUSED");
  }
}

export async function POST(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim();
  const form = contentType === "application/x-www-form-urlencoded";
  const plan = planOf(req), title = plan === "sunburst-tail-v1" ? TAIL_TITLE : "Five-dollar completion";
  const fail = (code: string, status = 409) => form ? page(title, `<p>Not recorded (${esc(code)}). Nothing was changed.</p>`, status) : refused(code, status);
  if (!plan) return fail("INVALID_REQUEST", 400);
  const confirmation = plan === JOURNEY_WALL_REPLACEMENT_SELECTOR ? JOURNEY_WALL_REPLACEMENT_CONFIRMATION
    : plan === "sunburst-tail-v1" ? QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION : QA_FIVE_COMPLETION_CONFIRMATION;
  const origin = req.headers.get("origin"), host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && req.headers.get("sec-fetch-site") !== "cross-site"; } catch { /* fail closed */ }
  if (!sameOrigin) return fail("FORBIDDEN", 403);
  let value: Record<string, unknown>;
  try {
    if (!form && contentType !== "application/json") throw Error("Unsupported request body");
    const bodyText = await boundedBody(req);
    if (form) {
      const data = new URLSearchParams(bodyText), names = [...new Set([...data.keys()])];
      if (names.some(name => data.getAll(name).length !== 1)) throw Error("Duplicate field");
      value = Object.fromEntries(names.map(name => [name, data.get(name)]));
    } else {
      const body: unknown = JSON.parse(bodyText);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid request");
      value = body as Record<string, unknown>;
    }
  } catch { return fail("INVALID_REQUEST", 400); }
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "confirmation,gameId,ownerAuthorizationSha256,planSha256" || !gameIdOk(value.gameId) || !shaOk(value.planSha256)
    || !shaOk(value.ownerAuthorizationSha256) || value.confirmation !== confirmation) return fail("INVALID_REQUEST", 400);
  const actor = await owner(value.gameId);
  if (!actor) return fail("FORBIDDEN", 403);
  if (plan === JOURNEY_WALL_REPLACEMENT_SELECTOR) {
    try {
      const { authorizeJourneyWallReplacement } = await import("@/services/generation/journey-source-head-recovery");
      const receipt = await authorizeJourneyWallReplacement(getContainer(), { gameId: value.gameId, operatorId: actor.id,
        expectedPlanSha256: value.planSha256, ownerAuthorizationSha256: value.ownerAuthorizationSha256 });
      return NextResponse.json({ ok: true, plan, capMicroUsd: receipt.capMicroUsd, requestKey: receipt.requestKey,
        authorizationSha256: receipt.authorizationSha256, providerCalls: 0 }, { headers: NO_STORE });
    } catch { return fail("GREAT_WALL_REPLACEMENT_REFUSED"); }
  }
  if (plan === "sunburst-tail-v1") {
    try {
      const receipt = await authorizeQaSunburstTailCompletion(getContainer(), { gameId: value.gameId, operatorId: actor.id,
        expectedPlanSha256: value.planSha256, ownerAuthorizationSha256: value.ownerAuthorizationSha256 });
      if (form) return page(title, `<p>Recorded. This game's cumulative ceiling is now ${usd(receipt.plan.capMicroUsd)} `
        + `(birth ${usd(receipt.plan.baseCapMicroUsd)}) for ${receipt.plan.operations.length} named Sunburst operation(s), `
        + `full reservation ${usd(receipt.plan.requiredMicroUsd)}. No provider was called and nothing was bought.</p>`
        + `<p>Authorization <code>${esc(receipt.authorizationSha256)}</code></p>`);
      return NextResponse.json({ ok: true, plan: QA_SUNBURST_TAIL_PLAN_SELECTOR, capMicroUsd: receipt.plan.capMicroUsd, baseCapMicroUsd: receipt.plan.baseCapMicroUsd,
        requiredMicroUsd: receipt.plan.requiredMicroUsd, operations: receipt.plan.operations.map(op => ({ kind: op.kind, hideId: op.hideId, requiredMicroUsd: op.requiredMicroUsd })),
        authorizationSha256: receipt.authorizationSha256, automaticExtension: false, providerCalls: 0 }, { headers: NO_STORE });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const reason = message.includes("Stale plan") || message.includes("plan changed") ? "PLAN_CHANGED"
        : message.includes("Concurrent") ? "CONCURRENT_CHANGE" : "FIVE_DOLLAR_AUTHORIZATION_REFUSED";
      console.warn("[qa-sunburst-tail-completion] blocked", { reason });
      return fail(reason);
    }
  }
  try {
    const receipt = await authorizeQaFiveCompletion(getContainer(), { gameId: value.gameId, operatorId: actor.id,
      expectedPlanSha256: value.planSha256, ownerAuthorizationSha256: value.ownerAuthorizationSha256 });
    if (form) return page("Five-dollar completion", `<p>Recorded. This game's cumulative ceiling is now ${usd(receipt.plan.capMicroUsd)} `
      + `(birth ${usd(receipt.plan.baseCapMicroUsd)}). No provider was called and nothing was bought.</p>`
      + `<p>Authorization <code>${esc(receipt.authorizationSha256)}</code></p>`);
    return NextResponse.json({ ok: true, capMicroUsd: receipt.plan.capMicroUsd, baseCapMicroUsd: receipt.plan.baseCapMicroUsd,
      authorizationSha256: receipt.authorizationSha256, automaticExtension: false, providerCalls: 0 }, { headers: NO_STORE });
  } catch (error) {
    // Coarse, non-identifying reasons only: no SQL, paths, digests or messages.
    const message = error instanceof Error ? error.message : "";
    const reason = message.includes("Stale plan") || message.includes("plan changed") ? "PLAN_CHANGED"
      : message.includes("Concurrent") ? "CONCURRENT_CHANGE" : "FIVE_DOLLAR_AUTHORIZATION_REFUSED";
    console.warn("[qa-five-completion] blocked", { reason });
    return fail(reason);
  }
}
