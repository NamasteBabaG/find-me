import sharp from "sharp";
import { createHash } from "node:crypto";
import type {
  AvatarInput,
  AvatarOutput,
  AvatarProvider,
  CharacterInput,
  CharacterOutput,
  SlotMatteRequest,
  SlotMatteResponse,
  SlotPatchRequest,
  SlotPatchResponse,
  TargetSpriteInput,
  TargetSpriteOutput,
} from "./types";
import { AVATAR_SIZE, avatarFromSheet } from "./avatar-cut";
import { characterPrompt } from "./character-prompt";

/**
 * OpenAI image generation.
 *
 * Two calls, and only two, matter:
 *   1. `createCharacter` — the child, once, drawn in the worlds' style as a
 *      2×2 pose sheet. The top-left quadrant is a head-and-shoulders portrait
 *      (it becomes the round avatar); the rest are the poses the worlds need.
 *      Every later call references this sheet, which is what keeps her the
 *      same child in nine different worlds.
 *   2. `editSlotCrop` — paint her into one window of a world, given the crop,
 *      a mask and that sheet.
 *   3. `matteSlotCrop` — pass two of a hiding spot: given that render and the
 *      crop it was made from, hand back the child alone on transparency. The
 *      colour difference used to do this and cannot any more: gpt-image-2
 *      re-synthesises the whole masked window, so the difference is the
 *      window (see extractChild).
 *
 * Everything about *where* the crop comes from and *what* comes back out lives
 * in src/services/generation/patch.ts; this file only talks to the API.
 */

const API = "https://api.openai.com/v1/images/edits";
const SHEET_SIZE = 1024;
const PATCH_OUTPUT_PX = 1024;

/**
 * Token prices in USD per million, by model. gpt-image models bill by image
 * tokens, not per image, so the only honest cost is computed from `usage`.
 * Check against https://developers.openai.com/api/docs/pricing before trusting
 * a margin: these are the standard-tier numbers this code was written against.
 */
const RATES: Record<string, { textIn: number; imageIn: number; imageOut: number }> = {
  "gpt-image-2": { textIn: 5, imageIn: 8, imageOut: 30 },
  "gpt-image-1": { textIn: 5, imageIn: 10, imageOut: 40 },
};

type Usage = { total_tokens?: number; input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };

/**
 * Cents to a thousandth, never rounded to a whole cent here.
 *
 * Rounding every call to the cent read a 2.42-cent low roll as 2, and over
 * the eighty renders of one comparison the recorded total was 160 cents
 * against 193.6 recomputed from the very usage that was stored beside it —
 * an 18% understatement in the number that says whether the product makes
 * money. The whole-cent columns are rounded once, from the exact ledger
 * (see slot-patches.ts); the provider keeps the fraction.
 */
export function costCentsFrom(model: string, usage: Usage | undefined): number {
  const rate = RATES[model] ?? RATES["gpt-image-1"]!;
  const textIn = usage?.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage?.input_tokens_details?.image_tokens ?? Math.max(0, (usage?.input_tokens ?? 0) - textIn);
  const imageOut = usage?.output_tokens ?? 0;
  const usd = (textIn * rate.textIn + imageIn * rate.imageIn + imageOut * rate.imageOut) / 1_000_000;
  return Math.round(usd * 100 * 1000) / 1000;
}

function flatUsage(usage: Usage | undefined): Record<string, number> | undefined {
  if (!usage) return undefined;
  const out: Record<string, number> = {};
  if (usage.total_tokens !== undefined) out.totalTokens = usage.total_tokens;
  if (usage.input_tokens !== undefined) out.inputTokens = usage.input_tokens;
  if (usage.output_tokens !== undefined) out.outputTokens = usage.output_tokens;
  if (usage.input_tokens_details?.text_tokens !== undefined) out.textInputTokens = usage.input_tokens_details.text_tokens;
  if (usage.input_tokens_details?.image_tokens !== undefined) out.imageInputTokens = usage.input_tokens_details.image_tokens;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Image endpoints are rate-limited per minute (5/min on tier 1), and a game is
 * up to 27 calls, so the provider paces itself instead of bursting and failing.
 *
 * This counts only what THIS instance has sent. On a serverless host every
 * function instance has its own, so several games generating at once can still
 * exceed the account's limit between them — deliberately: the alternative is a
 * shared counter in the database on the hot path of every image. What actually
 * protects the account is the 429 handling below, and the fact that the job
 * lease allows one runner per game. If this ever becomes the binding constraint,
 * the fix is a queue with a global concurrency of one, not a cleverer limiter.
 */
class RateLimiter {
  private times: number[] = [];
  constructor(private readonly perMinute: number) {}

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < 60_000);
      if (this.times.length < this.perMinute) {
        this.times.push(now);
        return;
      }
      const wait = 60_000 - (now - this.times[0]!) + 50;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

interface CallResult {
  png: Buffer;
  model: string;
  usage?: Record<string, number>;
  costCents: number;
  /** The API answered without usage: the charge is unknown, not zero. */
  costUnknown?: boolean;
  attempts: number;
  durationMs: number;
  providerRequestId?: string;
}

export interface OpenAiOptions {
  /** Explicit model. Access failure never silently selects a different model. */
  model?: string;
  /** "low" | "medium" | "high" — medium is the quality the worlds were made at. */
  quality?: string;
  /**
   * Quality for the hiding spots alone.
   *
   * The identity sheet is drawn once per child and every one of her 27 hiding
   * spots is painted from it, so saving a few cents there would blur the source
   * of everything downstream. The spots are where the money is — 27 rolls
   * against one — so they are the only place worth turning down.
   */
  patchQuality?: string;
  /** Images per minute this account may request. */
  perMinute?: number;
  /** How many times to retry one image before giving up. */
  tries?: number;
  /** Give up on a single request after this long. */
  timeoutMs?: number;
  /** Give up on one image ENTIRELY after this long, retries included. */
  budgetMs?: number;
  /**
   * How faithfully the matte copies the render it is cutting from. Sent only
   * to a model that takes it (gpt-image-1; gpt-image-2 refuses the parameter,
   * 7 September 2026). If a model refuses it anyway the call is repeated
   * without it, and the response says which was served.
   */
  matteInputFidelity?: "high" | "low";
}

export class OpenAiAvatarProvider implements AvatarProvider {
  readonly id = "openai" as const;
  /** images/edits works in this square; the crop and the mask are fitted to it and the edit comes back in it. */
  readonly patchOutputPx = PATCH_OUTPUT_PX;
  private readonly limiter: RateLimiter;
  private readonly model: string;
  private readonly quality: string;
  private readonly patchQuality: string;
  private readonly tries: number;
  private readonly timeoutMs: number;
  private readonly budgetMs: number;
  private readonly matteInputFidelity: "high" | "low" | undefined;

  constructor(private readonly apiKey: string, options: OpenAiOptions = {}) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for GENERATION_PROVIDER=openai");
    this.model = options.model ?? "gpt-image-2";
    this.quality = options.quality ?? "medium";
    this.patchQuality = options.patchQuality ?? this.quality;
    this.tries = options.tries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    // Three retries of three minutes is nine minutes of work inside a request
    // the platform kills at five, and that is exactly how slices died mid-spot
    // with the lease still held. The retry count is the ceiling; this is the
    // limit that actually binds.
    this.budgetMs = options.budgetMs ?? 150_000;
    this.limiter = new RateLimiter(options.perMinute ?? 5);
    this.matteInputFidelity = options.matteInputFidelity ?? (this.model === "gpt-image-1" ? "high" : undefined);
  }

  /** One multipart edit call, with bounded retries on the explicitly selected model. */
  private async call(parts: { images: Array<{ buffer: Buffer; name: string }>; mask?: Buffer; prompt: string; size: string; label: string; quality?: string; background?: "transparent"; outputFormat?: "png"; inputFidelity?: "high" | "low"; deadlineAt?: number; maxAttempts?: number }): Promise<CallResult> {
    const started = Date.now();
    let lastError = "";
    const model = this.model;
    // The caller's deadline binds too: a request the slice cannot wait for is
    // not started, and one already running is cut at the slice's end.
    const deadline = Math.min(started + this.budgetMs, parts.deadlineAt ?? Number.POSITIVE_INFINITY);
    for (let attempt = 1; attempt <= Math.min(this.tries, parts.maxAttempts ?? this.tries); attempt++) {
      // Never start a request there is no time to finish. Returning the reason
      // beats being killed halfway: the spot stays unfinished and retryable
      // instead of taking the whole slice down with it.
      const left = deadline - Date.now();
      if (left < 15_000) {
        lastError = lastError || `out of time after ${Math.round((Date.now() - started) / 1000)}s`;
        break;
      }
      await this.limiter.take();
      if (deadline - Date.now() < 15_000) throw new Error(`out of time before image request for ${parts.label}`);
      const form = new FormData();
      form.append("model", model);
      for (const img of parts.images) form.append("image[]", new Blob([new Uint8Array(img.buffer)], { type: "image/png" }), img.name);
      if (parts.mask) form.append("mask", new Blob([new Uint8Array(parts.mask)], { type: "image/png" }), "mask.png");
      form.append("prompt", parts.prompt);
      form.append("size", parts.size);
      form.append("quality", parts.quality ?? this.quality);
      form.append("n", "1");
      if (parts.background) form.append("background", parts.background);
      if (parts.outputFormat) form.append("output_format", parts.outputFormat);
      if (parts.inputFidelity) form.append("input_fidelity", parts.inputFidelity);
      // Without a deadline one hung request stalls every remaining hiding spot;
      // a generation that has not answered in three minutes is not coming back.
      const perRequest = Math.min(this.timeoutMs, deadline - Date.now());
      const res = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: AbortSignal.timeout(perRequest) }).catch((err: Error) => err);
      if (res instanceof Error) {
        lastError = res.name === "TimeoutError" ? `timed out after ${Math.round(perRequest / 1000)}s` : res.message;
        continue;
      }
      const json = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: Usage; error?: { message?: string } };
      const b64 = json.data?.[0]?.b64_json;
      if (res.ok && b64) {
        return {
          png: Buffer.from(b64, "base64"),
          model,
          usage: flatUsage(json.usage),
          costCents: costCentsFrom(model, json.usage),
          costUnknown: json.usage ? undefined : true,
          attempts: attempt,
          durationMs: Date.now() - started,
          providerRequestId: res.headers.get("x-request-id") ?? undefined,
        };
      }
      lastError = json.error?.message ?? `HTTP ${res.status}`;
      // Not every image model takes input_fidelity. The matte is worth having
      // without it, so drop the parameter and ask again rather than fail.
      if (parts.inputFidelity && res.status === 400 && /input_fidelity/i.test(lastError)) {
        delete parts.inputFidelity;
        attempt -= 1; // nothing was generated; this is not one of the tries
        continue;
      }
      // The chosen image model is part of the content contract. Fail visibly
      // rather than spending again on an unapproved model with a different style.
      if (/model|not found|does not exist|access|permission|verif/i.test(lastError)) break;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(2000 * attempt, Math.max(0, deadline - Date.now()))));
        continue;
      }
      break;
    }
    throw new Error(`OpenAI images/edits failed for ${parts.label}: ${lastError}`);
  }

  async createCharacter(input: CharacterInput): Promise<CharacterOutput> {
    const contract = input.qaStyleContract;
    if (contract) {
      if (this.model !== "gpt-image-2" || this.quality !== "medium") throw new Error("CHARACTER_STYLE: the board-matched identity requires GPT Image 2 MEDIUM");
      if (contract.version !== "board-matched-identity/v1" || !/^[a-f0-9]{64}$/.test(contract.catalogSha256)
        || !/^[a-f0-9]{64}$/.test(contract.atlasSha256) || !input.styleRef
        || input.styleRef.length > 8 * 1024 * 1024
        || createHash("sha256").update(input.styleRef).digest("hex") !== contract.atlasSha256) {
        throw new Error("CHARACTER_STYLE: missing or changed mandatory board-people atlas");
      }
      const atlas = await sharp(input.styleRef, { limitInputPixels: 1_048_576 }).metadata();
      if (atlas.format !== "png" || atlas.width !== SHEET_SIZE || atlas.height !== SHEET_SIZE || (atlas.pages ?? 1) !== 1 || (atlas.orientation ?? 1) !== 1) {
        throw new Error("CHARACTER_STYLE: the verified atlas must be one unrotated1024-square PNG");
      }
    }
    const photo = await prepareCharacterPhoto(input.originalPhoto, input.crop, SHEET_SIZE);
    const styled = Boolean(input.styleRef);
    const prompt = characterPrompt({ styled, ageYears: input.ageYears, ...(contract ? { qaStyleContractVersion: contract.version } : {}) });
    const images = [{ buffer: photo, name: "photo.png" }];
    if (input.styleRef) images.push({ buffer: contract ? Buffer.from(input.styleRef) : await sharp(input.styleRef).resize(SHEET_SIZE, SHEET_SIZE, { fit: "cover" }).png().toBuffer(), name: "style.png" });
    const out = await this.call({ images, prompt, size: `${SHEET_SIZE}x${SHEET_SIZE}`, label: `character:${input.childName}`,
      deadlineAt: input.deadlineAt, ...(contract ? { maxAttempts: 1 } : {}) });
    const sheet = await sharp(out.png).resize(SHEET_SIZE, SHEET_SIZE, { fit: "cover" }).png().toBuffer();
    return {
      sheetPng: sheet,
      sheetWidth: SHEET_SIZE,
      sheetHeight: SHEET_SIZE,
      avatarPng: await avatarFromSheet(sheet, SHEET_SIZE),
      avatarWidth: AVATAR_SIZE,
      avatarHeight: AVATAR_SIZE,
      costCents: out.costCents,
      costUnknown: out.costUnknown,
      model: out.model,
      usage: out.usage,
      providerRequestId: out.providerRequestId,
      durationMs: out.durationMs,
      attempts: out.attempts,
    };
  }

  async editSlotCrop(request: SlotPatchRequest): Promise<SlotPatchResponse> {
    const meta = await sharp(request.crop).metadata();
    const { crop, reference, mask, promptSent, size } = await prepareSlotEdit(request);
    const out = await this.call({
      images: [
        { buffer: crop, name: "scene.png" },
        { buffer: reference, name: "character.png" },
      ],
      mask,
      prompt: promptSent,
      size: `${size}x${size}`,
      quality: request.quality ?? this.patchQuality,
      label: request.label,
      deadlineAt: request.deadlineAt,
    });
    // Back to the crop's own pixels so the diff compares like with like. The
    // model's own output is handed back too: it is the only picture that shows
    // what was drawn before the downscale, and a rejection cannot be understood
    // without it.
    const png = await sharp(out.png).resize(meta.width ?? size, meta.height ?? size, { kernel: "lanczos3" }).png().toBuffer();
    return { png, rawPng: out.png, promptSent, costCents: out.costCents, costUnknown: out.costUnknown, model: out.model, usage: out.usage, providerRequestId: out.providerRequestId, durationMs: out.durationMs, attempts: out.attempts };
  }

  async matteSlotCrop(request: SlotMatteRequest): Promise<SlotMatteResponse> {
    const meta = await sharp(request.edited).metadata();
    const width = meta.width ?? PATCH_OUTPUT_PX;
    const height = meta.height ?? PATCH_OUTPUT_PX;
    const { images, promptSent, size } = await prepareSlotMatte(request);
    const parts = {
      images,
      prompt: promptSent,
      size: `${size}x${size}`,
      quality: request.quality ?? this.patchQuality,
      label: `${request.label}:matte`,
      outputFormat: "png" as const,
      inputFidelity: this.matteInputFidelity,
      deadlineAt: request.deadlineAt,
    };
    const out = await this.call(parts);
    const bill = { rawPng: out.png, promptSent, costCents: out.costCents, costUnknown: out.costUnknown, model: out.model, usage: out.usage, providerRequestId: out.providerRequestId, durationMs: out.durationMs, attempts: out.attempts, inputFidelity: parts.inputFidelity ?? null };
    // The model answers with its own framing kept and everything but the child
    // painted magenta (background: "transparent" was tried first and turned the
    // request into a sticker: the child came back re-composed, three times her
    // size, in the middle of the frame). The key turns the magenta into alpha,
    // and the result is fitted back to the crop's pixels with that alpha intact.
    //
    // From here on nothing may throw: the call above was paid for, and an
    // exception would take its bill, its request id and its picture with it.
    try {
      const png = await fitMatte(out.png, width, height);
      return { png, ...bill };
    } catch (err) {
      return { png: Buffer.alloc(0), ...bill, problem: err instanceof Error ? err.message : String(err) };
    }
  }

  /** The cover avatar comes from the character sheet, so it is never a second bill. */
  async createAvatar(input: AvatarInput): Promise<AvatarOutput> {
    const c = await this.createCharacter(input);
    return { png: c.avatarPng, width: c.avatarWidth, height: c.avatarHeight, costCents: c.costCents, providerRequestId: c.providerRequestId };
  }

  /** Sprites are slot patches now; the pipeline calls editSlotCrop directly. */
  async createTargetSprite(_input: TargetSpriteInput): Promise<TargetSpriteOutput> {
    return { kind: "composed", costCents: 0 };
  }
}

/** Shared wire inputs: qualification tools must exercise the production mask/units. No API call. */
export const SLOT_WIRE_VERSION = "slot-wire-v2-real-alpha";
export async function prepareSlotEdit(request: SlotPatchRequest) {
  const size = PATCH_OUTPUT_PX;
  const crop = await sharp(request.crop).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  const paint = await sharp(request.paintMask).resize(size, size).extractChannel(0).raw().toBuffer();
  const alpha = Buffer.alloc(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = paint[i]! > 128 ? 0 : 255;
  // Do NOT queue ensureAlpha/removeAlpha/joinChannel together: libvips operation
  // order can restore a fully opaque channel, silently disabling the edit mask.
  // Build an explicit RGB raw image and append exactly ONE alpha channel.
  const mask = await sharp(Buffer.alloc(size * size * 3, 255), { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
  const reference = await sharp(request.reference).resize({ width: size, height: size, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const promptSent = `${request.prompt} The first image is the scene to edit; the second image is the character reference sheet for the child (that is who the child is: the same face, hair, skin tone and build; the clothes may change to suit the place; do not copy its background or its grid).`;
  return { size, crop, mask, reference, promptSent };
}

/** Shared wire inputs of pass two; the harness and the pipeline send the same thing. No API call. */
export const MATTE_WIRE_VERSION = "matte-wire-v5-occlusion-modes";

/**
 * Magenta to alpha.
 *
 * The key is whatever the model painted, measured from the frame's border:
 * one render came back on (248,10,223), another on (245,8,240), and a fixed
 * tolerance around #FF00FF read the first as "no key at all". A pixel's
 * opacity is how far it sits from that key along the magenta axis — how much
 * less "red-and-blue over green" it is than the key — which is the same for
 * a dark hair strand and a pale cheek, where a plain colour distance is not
 * (a half blend of key and dark hair is far from the key and looked opaque).
 *
 * Where a pixel is decides the rest. A pixel two or more pixels inside the
 * half-opaque silhouette is the child, opaque, whatever its colour — so a pink
 * shirt stays a pink shirt. The rim keeps its measured alpha with the key's
 * share of colour taken out (pixel = a·child + (1−a)·key, solved for the
 * child). Purple clothes would key partly at their rim; the prompt forbids
 * them on the child.
 */
export const MAGENTA_KEY = { border: 4, minKey: 120, solid: 0.5, erode: 2, reach: 3, faint: 0.08, speck: 0.25 } as const;
export async function keyMagenta(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h;
  // The key: the mean colour of the frame's border.
  const key = [0, 0, 0]; let count = 0;
  const B = MAGENTA_KEY.border;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y >= B && y < h - B && x >= B && x < w - B) continue;
    const i = (y * w + x) * 3;
    key[0] = key[0]! + data[i]!; key[1] = key[1]! + data[i + 1]!; key[2] = key[2]! + data[i + 2]!; count++;
  }
  for (let k = 0; k < 3; k++) key[k] = key[k]! / count;
  const magentaOf = (r: number, g: number, b: number) => Math.min(r, b) - g;
  const keyMagenta = magentaOf(key[0]!, key[1]!, key[2]!);
  if (keyMagenta < MAGENTA_KEY.minKey) throw new Error(`the matte did not come back on a magenta key (border is ${key.map((v) => Math.round(v)).join(",")})`);
  // Opacity along the magenta axis, per pixel.
  const est = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = magentaOf(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!);
    est[i] = Math.max(0, Math.min(1, 1 - m / keyMagenta));
  }
  // Inside: every pixel within `erode` of it is at least half opaque. The
  // frame's edge counts as inside, so a child cut by the crop keeps her edge.
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = est[i]! >= MAGENTA_KEY.solid ? 1 : 0;
  const inside = new Uint8Array(n);
  const e = MAGENTA_KEY.erode;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solid[i]) continue;
    let ok = 1, sum = 0, count = 0;
    for (let dy = -e; dy <= e && ok; dy++) for (let dx = -e; dx <= e; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      const j = yy * w + xx;
      if (!solid[j]) { ok = 0; break; }
      sum += est[j]!; count++;
    }
    // A speck of key the model left between hair strands sits well inside the
    // silhouette but is far more magenta than the hair around it; a pink shirt
    // is as pink as its neighbours. The speck is rim, the shirt is body.
    inside[i] = ok && est[i]! >= sum / Math.max(1, count) - MAGENTA_KEY.speck ? 1 : 0;
  }
  const out = Buffer.alloc(n * 4);
  const R = MAGENTA_KEY.reach;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let alpha: number;
    if (inside[i]) alpha = 1;
    else if (est[i]! < MAGENTA_KEY.faint) alpha = 0;
    else {
      // The rim, measured against the body beside it: a dark or greenish body
      // sits below zero on the magenta axis, and a half blend of it with the
      // key reads above half unless the body's own value is taken into account.
      // The nearest body pixels, ring by ring, so a rim pixel where the hair
      // meets the collar borrows from one of them and not from a mix of both.
      const body = new Float64Array(3); let count = 0;
      for (let ring = 1; ring <= R && count === 0; ring++) {
        for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!inside[j]) continue;
          for (let k = 0; k < 3; k++) body[k] = body[k]! + data[j * 3 + k]!;
          count++;
        }
      }
      const bodyMagenta = count > 0 ? magentaOf(body[0]! / count, body[1]! / count, body[2]! / count) : 0;
      const pixelMagenta = magentaOf(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!);
      alpha = Math.max(0, Math.min(1, (keyMagenta - pixelMagenta) / Math.max(1, keyMagenta - bodyMagenta)));
      if (alpha < MAGENTA_KEY.faint) alpha = 0;
      if (alpha > 0) {
        if (count > 0) {
          // The rim is the body's own colour at the measured opacity: the
          // model's anti-aliasing mixed the key into these pixels, and a
          // strand of hair that keeps a pink cast reads as a sticker edge.
          for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(body[k]! / count);
        } else {
          // A strand with no body beside it: un-blend, then cap what magenta is left.
          const spill = 1 - alpha;
          const c = [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round((data[i * 3 + k]! - spill * key[k]!) / alpha))));
          const cap = c[1]! + 8;
          out[i * 4] = Math.min(c[0]!, cap); out[i * 4 + 1] = c[1]!; out[i * 4 + 2] = Math.min(c[2]!, cap);
        }
        out[i * 4 + 3] = Math.round(alpha * 255);
        continue;
      }
    }
    if (alpha <= 0) { out[i * 4 + 3] = 0; continue; }
    out[i * 4] = data[i * 3]!; out[i * 4 + 1] = data[i * 3 + 1]!; out[i * 4 + 2] = data[i * 3 + 2]!;
    out[i * 4 + 3] = 255;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** The model's own magenta output, keyed and fitted back to the crop's pixels with its alpha intact. */
export async function fitMatte(rawPng: Buffer, width: number, height: number): Promise<Buffer> {
  const keyed = await keyMagenta(rawPng);
  return sharp(keyed).resize(width, height, { kernel: "lanczos3" }).png().toBuffer();
}

export async function prepareSlotMatte(request: SlotMatteRequest) {
  const size = PATCH_OUTPUT_PX;
  const edited = await sharp(request.edited).resize(size, size, { kernel: "lanczos3" }).removeAlpha().png().toBuffer();
  const original = await sharp(request.original).resize(size, size, { kernel: "lanczos3" }).removeAlpha().png().toBuffer();
  const images = [
    { buffer: edited, name: "scene.png" },
  ];
  // Where the child was asked to be, as a picture: a scene with two swimmers in
  // it needs more than "the child is swimming" to say which one (amazon/canoe,
  // 7 September: the matte kept a girl who was already in the board).
  if (request.mask) images.push({ buffer: await sharp(request.mask).resize(size, size, { kernel: "nearest" }).removeAlpha().png().toBuffer(), name: "where.png" });
  if (request.reference) images.push({ buffer: await sharp(request.reference).resize(size, size).removeAlpha().png().toBuffer(), name: "identity.png" });
  const identityPrompt = request.reference ? ` The last image is the identity sheet of the child to keep. Match that child's face and hair; never keep another nearby child. The sheet is for identification only: do not copy its pose, framing or clothing.` : "";
  return { size, edited, original, images, promptSent: mattePrompt(request.hint, Boolean(request.mask), request.retryHint, request.mode) + identityPrompt };
}

/**
 * What pass two is asked. The child must not be redrawn, moved or completed:
 * the matte is placed on the board at the render's own coordinates, and a
 * part the scene hides has to stay hidden or she stops being behind anything.
 *
 * The occlusion sentence follows the spot's mode. In `layer` mode the object
 * that hides her is NOT in the render — it is drawn over her afterwards from
 * the board — so pass two must keep her whole; told that an object in front
 * of her is not the child it painted the stone block magenta over her chest,
 * and the board's own block was then drawn over the cut (giza/stones, game 2,
 * 8 September 2026). MATTE_WIRE_VERSION v5.
 */
export function mattePrompt(hint: string, withMask = false, retryHint?: string, mode: "open" | "clipped" | "layer" = "open"): string {
  return [
    "Use case: isolating one character from an illustration by keying.",
    "EDIT IMAGE 1 ONLY. It is the exact scene containing the target child. Do not rebuild it from any other input image. This is background removal from IMAGE 1, not a new illustration.",
    withMask ? "Image 2 is only a location guide: the white area marks the target near its centre. Keep the matching child closest to the CENTRE of that white area, not a similar child farther away. The location guide is not an image to edit." : "",
    "Return the first image with exactly the same framing: the child stays at the identical position and size in the frame, with the same pose, colours, linework and lighting. Do not zoom in, crop, move, resize, redraw, restyle or complete the child. Her head, her hands and her feet stay at exactly the pixels where image 1 has them.",
    "Paint every pixel that is not that child's own body, hair and clothes with flat, uniform, pure magenta #FF00FF: ground, water, sky, buildings, furniture, objects, animals, and every other person or child.",
    mode === "layer"
      ? "Nothing in image 1 is in front of this child: she was painted complete and in the open. Keep every visible part of her from the top of her head to her shoes; do not cut her at any object, and do not paint any part of her magenta because something in the scene seems close to her."
      : "An object between the viewer and the child (a bench, a barrel, a railing, a wall) is not the child: paint it magenta as well, including where it overlaps her, so only the part of the child that is visible in front of it remains and the edge follows that object's outline. Do not paint the hidden part of the child.",
    "No magenta, pink or purple tint anywhere on the child; no outline, glow, shadow or text on the magenta.",
    hint ? `Which child: ${hint}` : "",
    retryHint ? `Your previous answer was wrong: ${retryHint}` : "",
  ].filter(Boolean).join(" ");
}

/** Exact character-input photo preprocessing, shared by generation and its
 * identity review so the reviewer sees the user's selected child/crop,
 * padded to a square the model can read. */
export async function prepareCharacterPhoto(photo: Buffer, crop: AvatarInput["crop"], size = SHEET_SIZE): Promise<Buffer> {
  const img = sharp(photo, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("Cannot read photo dimensions");
  const box = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const left = Math.max(0, Math.min(w - 1, Math.round(box.x * w)));
  const top = Math.max(0, Math.min(h - 1, Math.round(box.y * h)));
  const width = Math.max(1, Math.min(w - left, Math.round(box.w * w)));
  const height = Math.max(1, Math.min(h - top, Math.round(box.h * h)));
  return img
    .extract({ left, top, width, height })
    .resize({ width: size, height: size, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}
