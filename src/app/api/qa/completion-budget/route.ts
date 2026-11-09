import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { currentAdmin } from "@/lib/server/session";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { QA_FIVE_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-five-dollar-completion";
import { authorizeQaFiveCompletion, previewQaFiveCompletion, qaFiveCompletionStatus } from "@/services/generation/qa-five-dollar-completion";

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
 */
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
  const c = getContainer();
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

export async function POST(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim();
  const form = contentType === "application/x-www-form-urlencoded";
  const fail = (code: string, status = 409) => form ? page("Five-dollar completion", `<p>Not recorded (${esc(code)}). Nothing was changed.</p>`, status) : refused(code, status);
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
    || !shaOk(value.ownerAuthorizationSha256) || value.confirmation !== QA_FIVE_COMPLETION_CONFIRMATION) return fail("INVALID_REQUEST", 400);
  const actor = await owner(value.gameId);
  if (!actor) return fail("FORBIDDEN", 403);
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
