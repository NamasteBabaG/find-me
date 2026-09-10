import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { WorldBudget, WorldBudgetError, type WorldBudgetAudit, type WorldChargeEvidence } from "../../services/generation/world-budget";
import { fixedSourceFailureReceipt, isSafeFixedSourceRequestId, type FixedSourceFailureReceipt, type FixedSourceFailureSink } from "./fixed-source-diagnostics";

const ENDPOINT = "https://api.openai.com/v1/images/edits";
/** The only two qualities this route may buy. HIGH and AUTO stay out. */
export type FixedSourceQuality = "low" | "medium";
/**
 * Every size this route may buy, and why each exists.
 *
 *  - `1024x1024` is the single-board sheet every frozen fingerprint was made
 *    with, and is left exactly as it was.
 *  - `1024x2160` is the shared world sheet: three columns of three 341x720
 *    cells. Its width is chosen so a ROW of three cells is exactly 1024, which
 *    lets the proven 1024-square observer read it with no rescaling at all; a
 *    1280-wide sheet would shrink by 0.8 and drop eye-to-chin from 65 pixels to
 *    52 before anything was measured.
 *  - `768x1152` is the local-patch size: a crop of the board with the child
 *    drawn INTO it, at the crop's own 1.5:1 so it maps back without stretching.
 *    The natural 512x768 region is NOT a legal request - 393,216 pixels is under
 *    the documented 655,360 minimum - so it is asked for at 768x1152 and reduced
 *    by exactly two thirds on the way back.
 *  - `1280x2160` and `3840x2160` remain available for the wider layouts that
 *    were costed. Above 2560x1440 the provider documents the resolution as
 *    experimental, which is a quality risk to watch rather than a size error.
 *
 * All are multiples of 16, inside the documented 1:3..3:1 ratio, and within the
 * 655,360..8,294,400 pixel range.
 */
export const FIXED_SOURCE_SIZES = ["768x1152", "1024x1024", "1024x2160", "1280x2160", "3840x2160"] as const;
export type FixedSourceSize = (typeof FIXED_SOURCE_SIZES)[number];
/** The version names the size, so a new size can never quietly reuse an old
 * identity. The 1024 string is untouched, so no frozen fingerprint moves. */
/**
 * A sprite sheet is cut out and composited, so it must arrive transparent. A
 * local patch is the board's own crop with the child drawn INTO it: it is opaque
 * by definition, and demanding a transparent pixel from it would reject a sheet
 * we had already paid for.
 */
export type FixedSourceBackground = "transparent" | "opaque";
export const fixedSourceVersion = (quality: FixedSourceQuality, size: FixedSourceSize, background: FixedSourceBackground = "transparent") =>
  size === "1024x1024" && background === "transparent"
    ? `fixed-source-${quality}/v1`
    : `fixed-source-${quality}-${size}${background === "opaque" ? "-opaque" : ""}/v1`;
export const fixedSourceSettings = (quality: FixedSourceQuality, size: FixedSourceSize = "1024x1024", background: FixedSourceBackground = "transparent") => Object.freeze({
  version: fixedSourceVersion(quality, size, background), model: "gpt-image-2", quality,
  size, background, output_format: "png", n: 1,
} as const);
/**
 * The provider's edit endpoint takes many reference images; this route's own
 * bound. Two - a board atlas and the identity - is what the single-board sheet
 * used. A shared sheet needs more, because one 1024-square atlas cannot carry
 * nine boards' worth of local light at a size anyone can see.
 */
export const FIXED_SOURCE_MAX_REFERENCES = 16;
/**
 * Ceiling on the billed base64 payload. It is the base64 of the PNG the
 * checkpoint store accepts, so anything the adapter lets through can still be
 * saved. Exported so the store's own test asserts against THIS value rather than
 * a copy of it: a window where a sheet is billed and then refused at save has
 * already cost money twice on this route.
 */
export const FIXED_SOURCE_PAYLOAD_BYTES = 24 * 1024 * 1024;
/** Retained so existing LOW callers and their frozen fingerprints do not move. */
export const FIXED_SOURCE_SETTINGS = fixedSourceSettings("low");
/** Pixels in a sheet of that size, for decode bounds and payload limits. */
export const fixedSourcePixels = (size: FixedSourceSize) => {
  const [width, height] = size.split("x").map(Number) as [number, number];
  return { width, height, pixels: width * height };
};
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
  /** Further reference atlases beyond the board atlas and the identity. Omitted
   * leaves the capture byte-identical to every sheet bought before them. */
  referencePngs?: Buffer[];
  /**
   * Edit mask, same size as the image being edited. Its TRANSPARENT area is what
   * the provider may repaint; everything opaque is meant to survive untouched.
   * Prose alone did not achieve that - a first local patch repainted 14% of the
   * crop it was told to keep - so the region is stated in pixels instead.
   */
  maskPng?: Buffer;
  /** Obtained from prepareFixedSource; a changed reference/prompt cannot resume. */
  expectedFingerprint: string;
}
export interface FixedSourcePolicy {
  /** Omitted means LOW, so existing callers and their frozen fingerprints do not move. */
  quality?: FixedSourceQuality;
  /** Omitted means the 1024 single-board sheet, for the same reason. */
  size?: FixedSourceSize;
  /** Omitted means a transparent sprite sheet, for the same reason. */
  background?: FixedSourceBackground;
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
  // Enforced here, not merely declared in the type. A quality or size arriving
  // from JSON, a script argument or a plain JavaScript caller is not checked by
  // TypeScript at all, and this route reached a dispatchable capture for both
  // `high` and `9999x9999`. The refusal has to happen before the request is
  // built, because afterwards the only options left are a billed rejection or a
  // sheet at a quality nobody approved.
  if (input.quality !== undefined && input.quality !== "low" && input.quality !== "medium") {
    fail("invalid_input", "Only LOW and MEDIUM may be bought on this route");
  }
  if (input.size !== undefined && !(FIXED_SOURCE_SIZES as readonly string[]).includes(input.size)) {
    fail("invalid_input", "Sheet size is not one this route may buy");
  }
  if (input.background !== undefined && input.background !== "transparent" && input.background !== "opaque") {
    fail("invalid_input", "Background is not one this route may buy");
  }
  return structuredClone(input);
}

/** Free, deterministic capture; no credentials, reservation, image edit or network. */
export async function prepareFixedSource(input: Omit<FixedSourceRequest, "worldId" | "requestKey" | "expectedFingerprint">, policyInput: FixedSourcePolicy) {
  const policy = policyCopy(policyInput);
  // A shared sheet cannot be directed inside the single-board budget: at the
  // density the three-cell sheet uses, its cells need about 40,000 characters.
  // Wardrobe and drawing style are per BOARD and may be stated once, but light is
  // per LOCATION and must not be shared: a shaded shop, a sunlit pavement and a
  // spot under a lamp are three different exposures, and collapsing them is
  // exactly the flatness this route exists to avoid. So each cell keeps its own
  // light, fill, shadow and exposure, which lands near 24,000.
  //
  // The provider's reference documents a 32,000-character prompt; this is our own
  // guard, set below that and widened only for the sheet that needs it. The 1024
  // route keeps its original bound exactly.
  const promptLimit = (policy.size ?? "1024x1024") === "1024x1024" ? 8192 : 30_000;
  if (!safeMetadata(input.sourceGroupKey) || !text(input.prompt) || Buffer.byteLength(input.prompt) > promptLimit
    || !Buffer.isBuffer(input.stylePng) || !Buffer.isBuffer(input.identityPng)) fail("invalid_input", "Missing or oversized source inputs");
  // Own copies before any await: caller mutations cannot change dispatched bytes.
  const prompt = input.prompt, sourceGroupKey = input.sourceGroupKey;
  const stylePng = Buffer.from(input.stylePng), identityPng = Buffer.from(input.identityPng);
  const mask = input.maskPng === undefined ? undefined : Buffer.from(input.maskPng);
  const extras = (input.referencePngs ?? []).map(png => {
    if (!Buffer.isBuffer(png)) fail("invalid_input", "Reference list must contain PNG buffers");
    return Buffer.from(png);
  });
  if (2 + extras.length > FIXED_SOURCE_MAX_REFERENCES) fail("invalid_input", "Reference count exceeds the bound for this route");
  for (const png of [stylePng, identityPng, ...extras, ...(mask ? [mask] : [])]) {
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
  // With no extra atlases the capture keeps exactly the shape and key order every
  // sheet bought so far was fingerprinted with, so nothing frozen moves.
  const capture = {
    settings: fixedSourceSettings(policy.quality ?? "low", policy.size ?? "1024x1024", policy.background ?? "transparent"), sourceGroupKey, policy,
    promptSha256: hash(prompt),
    inputOrder: extras.length ? ["style", "identity", ...extras.map((_, i) => `reference-${i + 1}`)] : (["style", "identity"] as const),
    styleSha256: hash(stylePng), identitySha256: hash(identityPng),
    ...(extras.length ? { referenceSha256: extras.map(hash) } : {}),
    ...(mask ? { maskSha256: hash(mask) } : {}),
  };
  return { fingerprint: hash(JSON.stringify(capture)), capture, prompt, stylePng, identityPng, referencePngs: extras, maskPng: mask };
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
    // Order matches capture.inputOrder, so what was fingerprinted is what is sent.
    for (const [index, png] of (prepared.referencePngs ?? []).entries()) {
      form.append("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), `reference-${index + 1}.png`);
    }
    if (prepared.maskPng) form.append("mask", new Blob([new Uint8Array(prepared.maskPng)], { type: "image/png" }), "mask.png");
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
    // Decode bounds follow the size that was actually requested: a fixed
    // 1024-square bound would throw on a world sheet we had already been billed
    // for. The PAYLOAD bound must not move with it. It is the base64 of the 18 MB
    // the checkpoint store will accept, so anything this check lets through can
    // still be saved. Scaling it with pixel count instead opened an 18 MB-to-253 MB
    // window where a sheet is billed and then refused at save - the same fault
    // that has already cost money twice on this route, reintroduced from the
    // other side.
    const expected = fixedSourcePixels(prepared.capture.settings.size);
    if (b64.length > FIXED_SOURCE_PAYLOAD_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) return diagnosticFailure("invalid_output", "Billed image payload is invalid", "image-payload", "settled");
    const png = Buffer.from(b64, "base64");
    try {
      const image = sharp(png, { limitInputPixels: expected.pixels }), meta = await image.metadata();
      // An alpha channel is required of a sheet that will be CUT OUT, and must
      // not be required of a local patch: an opaque crop legitimately comes back
      // without one, and demanding it rejected a patch we had already been
      // billed for. Every gate on this path has to ask which kind of image it is.
      const transparent = prepared.capture.settings.background === "transparent";
      if (meta.format !== "png" || meta.width !== expected.width || meta.height !== expected.height
        || (transparent && !meta.hasAlpha) || (meta.pages ?? 1) !== 1) throw new Error();
      const raw = await image.ensureAlpha().raw().toBuffer();
      let clear = false, visible = false;
      for (let i = 3; i < raw.length; i += 4) { clear ||= raw[i] === 0; visible ||= raw[i]! > 0; }
      // A cut-out sheet must have somewhere to cut; a local patch must not.
      if (!visible || (transparent ? !clear : clear)) throw new Error();
    } catch { return diagnosticFailure("invalid_output", `Billed output lacks a nonempty transparent ${prepared.capture.settings.size} PNG; no automatic repair`, "image-raster", "settled"); }
    return { kind: "generated", png, pngSha256: hash(png), fingerprint: prepared.fingerprint,
      capture: prepared.capture, evidence, modelProvenance: body.data.model === undefined ? "requested-endpoint-model-not-returned" : "response-confirmed",
      audit: settled.audit, semanticApproval: "pending" };
  }
}
