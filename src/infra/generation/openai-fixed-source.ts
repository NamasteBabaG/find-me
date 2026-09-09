import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { WorldBudget, WorldBudgetError, type WorldBudgetAudit, type WorldChargeEvidence } from "../../services/generation/world-budget";
import { fixedSourceFailureReceipt, isSafeFixedSourceRequestId, type FixedSourceFailureReceipt, type FixedSourceFailureSink } from "./fixed-source-diagnostics";

const ENDPOINT = "https://api.openai.com/v1/images/edits";
/** The only two qualities this route may buy. HIGH and AUTO stay out. */
export type FixedSourceQuality = "low" | "medium";
export const fixedSourceSettings = (quality: FixedSourceQuality) => Object.freeze({
  version: `fixed-source-${quality}/v1`, model: "gpt-image-2", quality,
  size: "1024x1024", background: "transparent", output_format: "png", n: 1,
} as const);
/** Retained so existing LOW callers and their frozen fingerprints do not move. */
export const FIXED_SOURCE_SETTINGS = fixedSourceSettings("low");
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const usageSchema = z.object({
  input_tokens: count, output_tokens: count.positive(), total_tokens: count.optional(),
  input_tokens_details: z.object({ text_tokens: count, image_tokens: count }).passthrough(),
}).passthrough().superRefine((u, ctx) => {
  if (!Number.isSafeInteger(u.input_tokens + u.output_tokens)
    || u.input_tokens !== u.input_tokens_details.text_tokens + u.input_tokens_details.image_tokens
    || u.total_tokens !== undefined && u.total_tokens !== u.input_tokens + u.output_tokens) {
    ctx.addIssue({ code: "custom", message: "Inconsistent usage totals" });
  }
});

export interface FixedSourceRequest {
  worldId: string;
  requestKey: string;
  /** Stable personalized source-bank key, shared by its consuming placements. */
  sourceGroupKey: string;
  prompt: string;
  stylePng: Buffer;
  identityPng: Buffer;
  /** Obtained from prepareFixedSource; a changed reference/prompt cannot resume. */
  expectedFingerprint: string;
}
export interface FixedSourcePolicy {
  /** Omitted means LOW, so existing callers and their frozen fingerprints do not move. */
  quality?: FixedSourceQuality;
  /** Explicit reviewed request upper bound, NOT a measured average image price. */
  reserveMicroUsd: number;
  /** Pins account/project billing scope, but must not contain credentials. */
  providerNamespace: string;
  /** Reviewed rate card in integer micro-USD/token. Do not silently use legacy rates. */
  rateCard: { id: string; textInput: number; imageInput: number; imageOutput: number };
  timeoutMs: number;
}
export class FixedSourceError extends Error {
  constructor(readonly code: "invalid_input" | "cost_unknown" | "ledger_unavailable" | "world_held" | "invalid_output", message: string,
    readonly diagnostic?: FixedSourceFailureReceipt, readonly diagnosticStored?: boolean) {
    super(message); this.name = "FixedSourceError";
  }
}
function fail(code: FixedSourceError["code"], message: string): never { throw new FixedSourceError(code, message); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function safeMetadata(value: string) {
  return text(value) && !/(?:\bsk-[\w-]{8,}|\bbearer\s+\S+|:\/\/|[\r\n])/i.test(value);
}
function policyCopy(input: FixedSourcePolicy): FixedSourcePolicy {
  if (!Number.isSafeInteger(input.reserveMicroUsd) || input.reserveMicroUsd <= 0
    || !safeMetadata(input.providerNamespace) || !safeMetadata(input.rateCard?.id)
    || ![input.rateCard.textInput, input.rateCard.imageInput, input.rateCard.imageOutput].every(n => Number.isSafeInteger(n) && n > 0)
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 240_000) {
    fail("invalid_input", "Invalid fixed-source billing policy");
  }
  return structuredClone(input);
}

/** Free, deterministic capture; no credentials, reservation, image edit or network. */
export async function prepareFixedSource(input: Omit<FixedSourceRequest, "worldId" | "requestKey" | "expectedFingerprint">, policyInput: FixedSourcePolicy) {
  const policy = policyCopy(policyInput);
  if (!safeMetadata(input.sourceGroupKey) || !text(input.prompt) || Buffer.byteLength(input.prompt) > 8192
    || !Buffer.isBuffer(input.stylePng) || !Buffer.isBuffer(input.identityPng)) fail("invalid_input", "Missing or oversized source inputs");
  // Own copies before any await: caller mutations cannot change dispatched bytes.
  const prompt = input.prompt, sourceGroupKey = input.sourceGroupKey;
  const stylePng = Buffer.from(input.stylePng), identityPng = Buffer.from(input.identityPng);
  for (const png of [stylePng, identityPng]) {
    if (png.length === 0 || png.length > 10 * 1024 * 1024) fail("invalid_input", "Reference byte limit exceeded");
    let m;
    try {
      const image = sharp(png, { limitInputPixels: 1024 * 1024, failOn: "warning" });
      m = await image.metadata();
      // Header validity is not image validity: reject truncated IDAT/reference
      // payloads for free instead of handing an undecodable file to paid work.
      await image.raw().toBuffer();
    }
    catch { fail("invalid_input", "Reference is not a readable bounded PNG"); }
    if (m.format !== "png" || !m.width || !m.height || m.width > 1024 || m.height > 1024 || (m.pages ?? 1) !== 1) fail("invalid_input", "Reference must be a single PNG at most 1024 square");
  }
  const capture = {
    settings: fixedSourceSettings(policy.quality ?? "low"), sourceGroupKey, policy,
    promptSha256: hash(prompt), inputOrder: ["style", "identity"] as const,
    styleSha256: hash(stylePng), identitySha256: hash(identityPng),
  };
  return { fingerprint: hash(JSON.stringify(capture)), capture, prompt, stylePng, identityPng };
}

export type FixedSourceResult = {
  kind: "already-recorded";
  fingerprint: string;
  /** Look up the durable source artifact. This result never grants a redispatch. */
  requestState: "pending" | "unknown" | "settled" | "linked";
  audit: WorldBudgetAudit;
} | {
  kind: "generated";
  png: Buffer;
  pngSha256: string;
  fingerprint: string;
  capture: Awaited<ReturnType<typeof prepareFixedSource>>["capture"];
  evidence: WorldChargeEvidence;
  modelProvenance: "response-confirmed" | "requested-endpoint-model-not-returned";
  audit: WorldBudgetAudit;
  semanticApproval: "pending";
};

/**
 * Public source-bank transport. Exactly one fetch after a durable reservation.
 * It never calls the legacy retrying avatar provider or selects HIGH/AUTO.
 * The caller must persist the source artifact and ledger association before
 * consumption; source measurement/style/identity/placement QA remain separate.
 * No production pipeline is enabled merely by constructing this provider.
 *
 * Current API docs (checked 2026-09-08) support Image2 transparency in preview:
 * https://developers.openai.com/api/docs/guides/image-generation#transparency
 * Upper-bound accuracy and a durable WorldBudget repository remain deployment
 * prerequisites. A provider overrun is recorded and stops work, not hidden.
 */
export class BudgetedOpenAiFixedSourceProvider {
  private readonly policy: FixedSourcePolicy;
  constructor(private readonly apiKey: string, private readonly budget: WorldBudget,
    policy: FixedSourcePolicy, private readonly fetchOnce: typeof fetch = fetch, private readonly onFailure?: FixedSourceFailureSink) {
    if (!text(apiKey)) fail("invalid_input", "Existing API key is required");
    this.policy = policyCopy(policy);
  }

  async generate(input: FixedSourceRequest): Promise<FixedSourceResult> {
    const { worldId, requestKey, expectedFingerprint } = input;
    if (!safeMetadata(worldId) || !safeMetadata(requestKey) || worldId.length > 500 || requestKey.length > 500) fail("invalid_input", "Nonsecret world and request IDs are required");
    const prepared = await prepareFixedSource(input, this.policy);
    if (prepared.fingerprint !== expectedFingerprint) fail("invalid_input", "Frozen source inputs changed");
    const form = new FormData();
    for (const [key, value] of Object.entries(prepared.capture.settings)) if (key !== "version") form.append(key, String(value));
    form.append("prompt", prepared.prompt);
    form.append("image[]", new Blob([new Uint8Array(prepared.stylePng)], { type: "image/png" }), "style.png");
    form.append("image[]", new Blob([new Uint8Array(prepared.identityPng)], { type: "image/png" }), "identity.png");
    let reservation;
    try {
      reservation = await this.budget.reserve(worldId, {
        requestKey, operationFingerprint: prepared.fingerprint, scope: "image", reserveMicroUsd: this.policy.reserveMicroUsd,
      });
    } catch (error) {
      // Database errors can include connection details. Expose only the budget's
      // typed control code and fixed text, never driver messages or raw causes.
      if (error instanceof WorldBudgetError) throw new WorldBudgetError(error.code, "Fixed-source reservation refused by the world budget");
      fail("ledger_unavailable", "Durable reservation was not confirmed; no image request was sent");
    }
    if (!reservation.acquired) return { kind: "already-recorded", fingerprint: prepared.fingerprint, requestState: reservation.request.state, audit: reservation.audit };

    let response: Response;
    let json: unknown;
    let jsonStatus: FixedSourceFailureReceipt["jsonStatus"] = "not-read", usageValid = false;
    let transport: FixedSourceFailureReceipt["transport"] = null;
    const diagnosticFailure = async (code: FixedSourceError["code"], message: string, reason: FixedSourceFailureReceipt["reason"], billing: FixedSourceFailureReceipt["billing"]): Promise<never> => {
      const receipt = fixedSourceFailureReceipt({ worldId, requestKey, fingerprint: prepared.fingerprint,
        quality: prepared.capture.settings.quality, reason, billing, response, json, jsonStatus, usageValid, transport });
      let stored = false;
      // A diagnostic storage failure never authorizes redispatch, zero cost, or
      // returning a paid image. The safe receipt also remains on the typed error.
      try { if (this.onFailure) { await this.onFailure(receipt); stored = true; } } catch { /* no driver/raw error messages */ }
      throw new FixedSourceError(code, message, receipt, stored);
    };
    const unknown = async (reason: string, category: FixedSourceFailureReceipt["reason"]): Promise<never> => {
      try { await this.budget.markUnknown(worldId, requestKey, reason); }
      catch { return diagnosticFailure("ledger_unavailable", "Request outcome unresolved; keep its reservation and reconcile the ledger before continuing", category, "unknown"); }
      return diagnosticFailure("cost_unknown", "Request billing is unknown; reservation retained and no retry dispatched", category, "unknown");
    };
    try {
      response = await this.fetchOnce(ENDPOINT, {
        method: "POST", redirect: "error", headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form, signal: AbortSignal.timeout(this.policy.timeoutMs),
      });
    } catch (error) {
      transport = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout"
        : error instanceof Error && error.name === "TypeError" ? "network-or-runtime" : "unclassified";
      return unknown("image-request-transport-failed", "transport");
    }
    try { json = await response.json(); jsonStatus = "parsed"; }
    catch { jsonStatus = "invalid"; return unknown("image-response-not-json", "response-not-json"); }
    const body = z.object({ model: z.string().optional(), usage: z.unknown().optional(), data: z.unknown().optional() }).passthrough().safeParse(json);
    const usage = usageSchema.safeParse(body.success ? body.data.usage : undefined);
    usageValid = usage.success;
    const requestId = response.headers.get("x-request-id");
    if (!body.success || !usage.success || !isSafeFixedSourceRequestId(requestId)
      || body.data.model !== undefined && body.data.model !== FIXED_SOURCE_SETTINGS.model) return unknown("image-charge-evidence-incomplete-or-model-unexpected", "charge-evidence");
    const u = usage.data, rates = this.policy.rateCard;
    // No cache discount assumed. Extra usage fields are intentionally not
    // persisted (the ledger is metadata-only, never a response/prompt dump).
    const amountMicroUsd = u.input_tokens_details.text_tokens * rates.textInput
      + u.input_tokens_details.image_tokens * rates.imageInput + u.output_tokens * rates.imageOutput;
    if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd <= 0) return unknown("image-charge-arithmetic-invalid", "charge-arithmetic");
    const evidence: WorldChargeEvidence = {
      providerNamespace: this.policy.providerNamespace, providerRequestId: requestId, usageId: requestId,
      model: FIXED_SOURCE_SETTINGS.model, amountMicroUsd, costBasis: "conservative-upper-estimate",
      rawUsage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens,
        input_tokens_details: { text_tokens: u.input_tokens_details.text_tokens, image_tokens: u.input_tokens_details.image_tokens } },
    };
    let settled;
    try { settled = await this.budget.settle(worldId, requestKey, evidence); }
    catch { return unknown("image-charge-settlement-not-confirmed", "charge-settlement"); }
    if (settled.audit.held) return diagnosticFailure("world_held", "Full charge recorded; budget is held and generated output is not released", "budget-held", "settled");
    // Record the bill BEFORE validating image shape, transparency or semantics.
    if (body.data.quality !== undefined && body.data.quality !== prepared.capture.settings.quality) return diagnosticFailure("invalid_output", "Billed response reported an unapproved image quality", "unexpected-quality", "settled");
    const data = z.array(z.object({ b64_json: z.string().min(1) })).length(1).safeParse(body.data.data);
    if (!response.ok || !data.success) return diagnosticFailure("invalid_output", "Billed request did not return exactly one image; no automatic repair", "image-data", "settled");
    const b64 = data.data[0]!.b64_json;
    if (b64.length > 24 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) return diagnosticFailure("invalid_output", "Billed image payload is invalid", "image-payload", "settled");
    const png = Buffer.from(b64, "base64");
    try {
      const image = sharp(png, { limitInputPixels: 1024 * 1024 }), meta = await image.metadata();
      if (meta.format !== "png" || meta.width !== 1024 || meta.height !== 1024 || !meta.hasAlpha || (meta.pages ?? 1) !== 1) throw new Error();
      const raw = await image.ensureAlpha().raw().toBuffer();
      let clear = false, visible = false;
      for (let i = 3; i < raw.length; i += 4) { clear ||= raw[i] === 0; visible ||= raw[i]! > 0; }
      if (!clear || !visible) throw new Error();
    } catch { return diagnosticFailure("invalid_output", "Billed output lacks a nonempty transparent 1024-square PNG; no automatic repair", "image-raster", "settled"); }
    return { kind: "generated", png, pngSha256: hash(png), fingerprint: prepared.fingerprint,
      capture: prepared.capture, evidence, modelProvenance: body.data.model === undefined ? "requested-endpoint-model-not-returned" : "response-confirmed",
      audit: settled.audit, semanticApproval: "pending" };
  }
}
