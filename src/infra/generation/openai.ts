import sharp from "sharp";
import type {
  AvatarInput,
  AvatarOutput,
  AvatarProvider,
  CharacterOutput,
  SlotPatchRequest,
  SlotPatchResponse,
  TargetSpriteInput,
  TargetSpriteOutput,
} from "./types";

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
 *
 * Everything about *where* the crop comes from and *what* comes back out lives
 * in src/services/generation/patch.ts; this file only talks to the API.
 */

const API = "https://api.openai.com/v1/images/edits";
const SHEET_SIZE = 1024;
const AVATAR_SIZE = 512;

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

function costCentsFrom(model: string, usage: Usage | undefined): number {
  const rate = RATES[model] ?? RATES["gpt-image-1"]!;
  const textIn = usage?.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage?.input_tokens_details?.image_tokens ?? Math.max(0, (usage?.input_tokens ?? 0) - textIn);
  const imageOut = usage?.output_tokens ?? 0;
  const usd = (textIn * rate.textIn + imageIn * rate.imageIn + imageOut * rate.imageOut) / 1_000_000;
  // Round, do not ceil. A roll costs about 7.0 cents, and rounding every one of
  // them up to 8 overstated a nine-board game by roughly 14% — an error that
  // only ever pointed one way, in the number used to judge whether the product
  // makes money. Sub-cent precision is lost either way; a bias is not.
  return Math.round(usd * 100);
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
  attempts: number;
  durationMs: number;
  providerRequestId?: string;
}

export interface OpenAiOptions {
  /** Preferred model; falls back to gpt-image-1 when the account cannot use it. */
  model?: string;
  /** "low" | "medium" | "high" — medium is the quality the worlds were made at. */
  quality?: string;
  /** Images per minute this account may request. */
  perMinute?: number;
  /** How many times to retry one image before giving up. */
  tries?: number;
  /** Give up on a single request after this long. */
  timeoutMs?: number;
  /** Give up on one image ENTIRELY after this long, retries included. */
  budgetMs?: number;
}

export class OpenAiAvatarProvider implements AvatarProvider {
  readonly id = "openai" as const;
  private readonly limiter: RateLimiter;
  private readonly model: string;
  private readonly quality: string;
  private readonly tries: number;
  private readonly timeoutMs: number;
  private readonly budgetMs: number;

  constructor(private readonly apiKey: string, options: OpenAiOptions = {}) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for GENERATION_PROVIDER=openai");
    this.model = options.model ?? "gpt-image-2";
    this.quality = options.quality ?? "medium";
    this.tries = options.tries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    // Three retries of three minutes is nine minutes of work inside a request
    // the platform kills at five, and that is exactly how slices died mid-spot
    // with the lease still held. The retry count is the ceiling; this is the
    // limit that actually binds.
    this.budgetMs = options.budgetMs ?? 150_000;
    this.limiter = new RateLimiter(options.perMinute ?? 5);
  }

  /** One multipart edit call, with the model fallback and retries. */
  private async call(parts: { images: Array<{ buffer: Buffer; name: string }>; mask?: Buffer; prompt: string; size: string; label: string }): Promise<CallResult> {
    const started = Date.now();
    let lastError = "";
    let model = this.model;
    const deadline = started + this.budgetMs;
    for (let attempt = 1; attempt <= this.tries; attempt++) {
      // Never start a request there is no time to finish. Returning the reason
      // beats being killed halfway: the spot stays unfinished and retryable
      // instead of taking the whole slice down with it.
      const left = deadline - Date.now();
      if (left < 15_000) {
        lastError = lastError || `out of time after ${Math.round((Date.now() - started) / 1000)}s`;
        break;
      }
      await this.limiter.take();
      const form = new FormData();
      form.append("model", model);
      for (const img of parts.images) form.append("image[]", new Blob([new Uint8Array(img.buffer)], { type: "image/png" }), img.name);
      if (parts.mask) form.append("mask", new Blob([new Uint8Array(parts.mask)], { type: "image/png" }), "mask.png");
      form.append("prompt", parts.prompt);
      form.append("size", parts.size);
      form.append("quality", this.quality);
      form.append("n", "1");
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
          attempts: attempt,
          durationMs: Date.now() - started,
          providerRequestId: res.headers.get("x-request-id") ?? undefined,
        };
      }
      lastError = json.error?.message ?? `HTTP ${res.status}`;
      // An account without access to the newer model should not fail the game.
      if (model !== "gpt-image-1" && /model|not found|does not exist|access|permission|verif/i.test(lastError)) {
        console.warn(`[openai] ${model} unavailable for ${parts.label} (${lastError}); falling back to gpt-image-1`);
        model = "gpt-image-1";
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(2000 * attempt, Math.max(0, deadline - Date.now()))));
        continue;
      }
      break;
    }
    throw new Error(`OpenAI images/edits failed for ${parts.label}: ${lastError}`);
  }

  async createCharacter(input: AvatarInput): Promise<CharacterOutput> {
    const photo = await squarePhoto(input.originalPhoto, input.crop, SHEET_SIZE);
    const styled = Boolean(input.styleRef);
    const prompt = [
      styled
        ? `The FIRST image is a photograph of a child. The SECOND image is a piece of the illustrated world she has to live inside, drawn by the illustrator you are standing in for.`
        : `The image is a photograph of a child.`,
      styled
        ? `Draw her as a character in the SECOND image's style, copied exactly: the same dark ink outline around every shape, the same flat cel shading and speckled paper texture, the same saturated colours and warm daylight, the same simplified cartoon faces with large eyes. She has to look cut out of that picture and dropped on a blank sheet — one of those children, not a guest.`
        : `Redraw her as an illustrated character in a warm storybook collage style: soft gouache texture, clean confident outlines, friendly proportions, bright daylight palette.`,
      // Naming the failure is what stops it. Asked only for "an illustration",
      // the model reaches for its own house style — a soft, airbrushed, almost
      // photographic child, who then cannot be painted into a cel-shaded world
      // without looking pasted on.
      styled ? `Do NOT draw a soft, airbrushed, painterly or realistic illustration. No photographic skin, no rendered strands of hair, no subtle gradients.` : ``,
      `Keep her recognisable from the photograph — the same hair colour and hairstyle, skin tone, eye colour and expression${styled ? `, simplified into that style` : ``}.`,
      `Return one square image divided into a clean 2 by 2 grid of four drawings of the SAME child on a plain flat light background, with no text, no labels and no frames:`,
      `top-left a head-and-shoulders portrait facing the viewer; top-right the full body standing, facing the viewer;`,
      `bottom-left the full body from behind, three-quarter view; bottom-right the child crouching and peeking, as if hiding.`,
      `Same outfit in all four drawings.`,
    ]
      .filter(Boolean)
      .join(" ");
    const images = [{ buffer: photo, name: "photo.png" }];
    if (input.styleRef) images.push({ buffer: await sharp(input.styleRef).resize(SHEET_SIZE, SHEET_SIZE, { fit: "cover" }).png().toBuffer(), name: "style.png" });
    const out = await this.call({ images, prompt, size: `${SHEET_SIZE}x${SHEET_SIZE}`, label: `character:${input.childName}` });
    const sheet = await sharp(out.png).resize(SHEET_SIZE, SHEET_SIZE, { fit: "cover" }).png().toBuffer();
    return {
      sheetPng: sheet,
      sheetWidth: SHEET_SIZE,
      sheetHeight: SHEET_SIZE,
      avatarPng: await avatarFromSheet(sheet),
      avatarWidth: AVATAR_SIZE,
      avatarHeight: AVATAR_SIZE,
      costCents: out.costCents,
      model: out.model,
      usage: out.usage,
      providerRequestId: out.providerRequestId,
      durationMs: out.durationMs,
      attempts: out.attempts,
    };
  }

  async editSlotCrop(request: SlotPatchRequest): Promise<SlotPatchResponse> {
    const meta = await sharp(request.crop).metadata();
    const size = 1024;
    const crop = await sharp(request.crop).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
    // OpenAI's mask is an alpha channel: transparent where the model may paint.
    const paint = await sharp(request.paintMask).resize(size, size).extractChannel(0).raw().toBuffer();
    const alpha = Buffer.alloc(size * size);
    for (let i = 0; i < alpha.length; i++) alpha[i] = paint[i]! > 128 ? 0 : 255;
    // ensureAlpha().removeAlpha() forces a known 3-channel image, so the joined
    // channel is unambiguously the alpha the API asks for.
    const mask = await sharp(crop).ensureAlpha().removeAlpha().joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
    const reference = await sharp(request.reference).resize({ width: size, height: size, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    const out = await this.call({
      images: [
        { buffer: crop, name: "scene.png" },
        { buffer: reference, name: "character.png" },
      ],
      mask,
      prompt: `${request.prompt} The first image is the scene to edit; the second image is the character reference sheet for the child (use her face, hair and outfit; do not copy its background or its grid).`,
      size: `${size}x${size}`,
      label: request.label,
    });
    // Back to the crop's own pixels so the diff compares like with like.
    const png = await sharp(out.png).resize(meta.width ?? size, meta.height ?? size, { kernel: "lanczos3" }).png().toBuffer();
    return { png, costCents: out.costCents, model: out.model, usage: out.usage, providerRequestId: out.providerRequestId, durationMs: out.durationMs, attempts: out.attempts };
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

/** The parent's crop applied, padded to a square the model can read. */
async function squarePhoto(photo: Buffer, crop: AvatarInput["crop"], size: number): Promise<Buffer> {
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

/** Round face sticker cut from the sheet's top-left portrait, with the white outline. */
async function avatarFromSheet(sheet: Buffer): Promise<Buffer> {
  const half = SHEET_SIZE / 2;
  const portrait = await sharp(sheet).extract({ left: 0, top: 0, width: half, height: half }).resize(AVATAR_SIZE, AVATAR_SIZE).png().toBuffer();
  const ring = 22;
  const inner = AVATAR_SIZE / 2 - ring;
  const circle = Buffer.from(`<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${inner}" fill="#fff"/></svg>`);
  const outline = Buffer.from(`<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2 - 2}" fill="#fff"/></svg>`);
  const masked = await sharp(portrait).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
  return sharp(outline).composite([{ input: masked, blend: "over" }]).png().toBuffer();
}
