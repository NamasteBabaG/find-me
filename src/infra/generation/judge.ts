import sharp from "sharp";
import { createHash } from "node:crypto";
import type { JudgeAttempt, PatchJudge, PatchJudgement, PatchJudgeInput } from "./types";
import { BOARD_JUDGE_VERSION, BOARD_JUDGE_MODEL, BOARD_JUDGE_EFFORT, BOARD_FAST_JUDGE_MODEL, BOARD_JUDGE_MAX_TOKENS, boardJudgePrompt, parseBoardVerdict } from "./board-verdict";

/**
 * Production: inspect a final on-board composite with two complementary reviews.
 * The narrow flat-patch path described below is retained ONLY for historical
 * rejudge tools; generateSlotPatch always supplies boardCrop.
 *
 * Legacy identity-only check: does this finished patch actually show the child?
 *
 * The geometric checks in `childProblem` ask about shape — roughly the right
 * height, taller than wide, solid, near the spot — and a scooter, a horse's head
 * and a pair of legs all answer yes. Over one nine-board game four of
 * twenty-six accepted patches were not the child at all, and nothing downstream
 * could tell: the composer places whatever it is given, and automated QA checks
 * the rectangles, not the picture.
 *
 * So the picture gets looked at. The test is deliberately narrow and is the same
 * one the game itself needs: **her face has to be visible and it has to be her**.
 * A child peeking over a basket with only her head showing passes — that is the
 * hiding we asked for. A pair of legs does not, because a player cannot find
 * "Noa" in something with no face. Nor does a face sliced down its middle, nor a
 * cut-out holding three other children and not her at all — the largest, most
 * confident blob of a whole world's run was exactly that, and every rule that
 * measures rectangles waved it through.
 *
 * On world 2's twenty-seven spots it rejected three, and all three were real:
 * two children with half a face cut clean away, and one cut-out holding three
 * other children. I had looked at one of those on a contact sheet, called it a
 * good child and started loosening the prompt to let it through; at seven times
 * the size the missing half of her face is obvious. The judge was right twice
 * and I was wrong once, which is the whole reason it exists.
 *
 * Sheer narrowness is left to `childProblem`, which can measure it for nothing:
 * this asks only what looking can answer.
 */

const API = "https://api.openai.com/v1/chat/completions";

/** Judging is cheap next to a roll (~7¢), so the budget here is generous. */
const TIMEOUT_MS = 45_000;
export const STRONG_TIMEOUT_MS = 90_000;
const TRIES = 2;
const MAX_OUTPUT_TOKENS = 60;

/**
 * Who decides on the board.
 *
 * - `chain`: the fast reviewer first; a fail ends it, an uncertain or a pass
 *   goes to the strong reviewer, whose word is final. (Until 8 September an
 *   uncertain ended it too, and a fast fail on bodyPlacement was the end of
 *   six good peeks in one game.)
 * - `screen`: the fast reviewer may only end it on the checks it is good at
 *   — identity, faceIntegrity, anatomy — so a fast fail on placement, scale,
 *   age or style is a question for the strong reviewer, not an answer.
 * - `strong`: the strong reviewer alone.
 *
 * The pilot on the labelled set (docs/CLAUDE_JUDGE_PLACEMENT_FIX_REPORT_2026-09-08.md)
 * chooses the default; the environment can override it (JUDGE_POLICY).
 */
export type JudgePolicy = "chain" | "screen" | "strong";
export const DEFAULT_JUDGE_POLICY: JudgePolicy = "screen";
/** The checks the fast reviewer is trusted to fail on its own under `screen`. */
export const FAST_FINAL_CHECKS = ["identity", "faceIntegrity", "anatomy"] as const;

export interface JudgeOptions {
  /** A vision-capable chat model. */
  model?: string;
  timeoutMs?: number;
  /** Budgeted experiments use exactly one wire request, without hidden retries. */
  tries?: number;
  policy?: JudgePolicy;
}

export class OpenAiPatchJudge implements PatchJudge {
  readonly id = "openai" as const;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly tries: number;
  private readonly policy: JudgePolicy;

  constructor(
    private readonly apiKey: string,
    options: JudgeOptions = {},
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the patch judge");
    this.model = options.model ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this.tries = options.tries ?? TRIES;
    this.policy = options.policy ?? DEFAULT_JUDGE_POLICY;
    if (!Number.isInteger(this.tries) || this.tries < 1 || this.tries > 2) throw new Error("judge tries must be 1 or 2");
  }

  async judge(input: PatchJudgeInput): Promise<PatchJudgement> {
    if (!input.boardCrop) return this.assess(input);
    const strong = () => this.assess(input, BOARD_JUDGE_MODEL).catch((): PatchJudgement => ({
      verdict: "unknown", reason: "second reviewer could not complete",
      version: BOARD_JUDGE_VERSION, model: BOARD_JUDGE_MODEL,
      costCents: 0, costUnknown: true, attempts: [],
    }));
    if (this.policy === "strong") return { ...(await strong()), policy: "strong" };
    // Neither model is a release oracle. In captured defects, each missed a
    // different placement error. Approval requires both.
    const first = await this.assess(input, BOARD_FAST_JUDGE_MODEL);
    if (first.verdict === "bad" && fastMayDecide(first, this.policy)) return { ...first, policy: `${this.policy}:fast` };
    // An answer that could not be verified (another model served, no usage,
    // no readable verdict) is not a doubt about the picture: it fails closed
    // without a second paid call, as before.
    if (first.verdict === "unknown" && !first.checks) return { ...first, policy: `${this.policy}:fast` };
    // A fast reviewer that looked and could not decide, or failed on a check
    // it is not trusted with, hands the picture to the strong reviewer with
    // its own answer kept for the record and the bill.
    const second = await strong();
    return { ...second, policy: `${this.policy}:strong`, reviews: [first, second], attempts: [...first.attempts ?? [], ...second.attempts ?? []], costCents: first.costCents + second.costCents, costUnknown: Boolean(first.costUnknown || second.costUnknown) };
  }

  /** One named reviewer on its own, for pilots that measure the reviewers separately (scripts/judge-pilot.ts). Paid. */
  async reviewWith(input: PatchJudgeInput, model: string): Promise<PatchJudgement> {
    return this.assess(input, model);
  }

  private async assess(input: PatchJudgeInput, contextModel?: string): Promise<PatchJudgement> {
    // The patch is transparent where it is not the child; flattened onto a flat
    // grey its silhouette reads clearly instead of dissolving into white.
    const patch = await sharp(input.patchPng)
      .resize(512, 512, { fit: "contain", background: { r: 130, g: 130, b: 130, alpha: 1 } })
      .flatten({ background: { r: 130, g: 130, b: 130 } })
      .png()
      .toBuffer();
    const sheet = await sharp(input.reference).resize(512, 512, { fit: "inside" }).png().toBuffer();

    // Legacy flat rejudge experiments retain their exact prompt, model and token cap.
    const contextual = Boolean(input.boardCrop);
    const modelRequested = contextModel ?? this.model;
    const reasoning = modelRequested === BOARD_JUDGE_MODEL;
    // The strong reviewer thinks before it answers; at 60 s it timed out on
    // newyork/bench in game 2 and on the first pilot case (8 September), and
    // a timeout is an unknown charge. Ninety seconds inside the tick
    // (JUDGE_MIN_MS allows for it); a pilot may pass more.
    const requestTimeoutMs = reasoning ? Math.max(this.timeoutMs, STRONG_TIMEOUT_MS) : this.timeoutMs;
    const images = input.boardCrop
      ? [await sharp(input.boardCrop).resize(768, 768, { fit: "inside" }).png().toBuffer(), patch, sheet]
      : [patch, sheet];
    const prompt = contextual ? boardJudgePrompt(input.childName, input.ageYears, input.recipe) : judgePrompt(input.childName);
    const attempts: JudgeAttempt[] = [];
    let checks: PatchJudgement["checks"];
    const result = (verdict: PatchJudgement["verdict"], reason: string): PatchJudgement => ({
      verdict, reason, promptSent: prompt,
      costCents: attempts.reduce((sum, attempt) => sum + attempt.costCents, 0),
      costUnknown: attempts.some((attempt) => attempt.costUnknown),
      model: attempts.at(-1)?.model ?? modelRequested,
      attempts,
      // The board and the patch as encoded for the wire; the sheet is the
      // identity asset the game already keeps.
      ...(contextual ? { version: BOARD_JUDGE_VERSION, checks, imageHashes: images.map(b => createHash("sha256").update(b).digest("hex")), wireImages: images.slice(0, 2) } : {}),
    });

    let lastError = "";
    for (let attempt = 1; attempt <= (contextual ? 1 : this.tries); attempt++) {
      let res: Response;
      try {
        res = await fetch(API, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelRequested,
            ...(reasoning ? { max_completion_tokens: BOARD_JUDGE_MAX_TOKENS, reasoning_effort: BOARD_JUDGE_EFFORT, service_tier: "default", store: false } : { max_tokens: contextual ? 320 : MAX_OUTPUT_TOKENS, temperature: 0 }),
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: [
              { type: "text", text: prompt },
              ...images.map(b => ({ type: "image_url", image_url: { url: `data:image/png;base64,${b.toString("base64")}`, ...(contextual ? { detail: "high" } : {}) } })),
            ] }],
          }),
          // 150s image call + 45s precheck + 60s Sol + 30s slice + 15s I/O
          // fits the 300s host ceiling. A timeout holds; never bypass review.
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch (err) {
        lastError = err instanceof Error && err.name === "TimeoutError" ? `timed out after ${Math.round(requestTimeoutMs / 1000)}s` : "judge transport failed";
        attempts.push({ requestId: null, model: null, usage: null, costCents: 0, costUnknown: true, status: null });
        // A lost answer may have been charged; another call cannot make it known.
        break;
      }
      const requestId = res.headers.get("x-request-id");
      let json: { model?: string; service_tier?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }>; usage?: Record<string, unknown>; error?: { message?: string } };
      try {
        const raw: unknown = await res.json();
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid response object");
        json = raw;
      }
      catch {
        attempts.push({ requestId, model: null, usage: null, costCents: 0, costUnknown: true, status: res.status });
        lastError = "could not read the provider response";
        break;
      }
      const model = typeof json.model === "string" ? json.model : modelRequested;
      const charge = judgeCharge(model, json.usage);
      const content = json.choices?.[0]?.message?.content;
      attempts.push({ requestId, model, usage: json.usage ?? null, ...charge, status: res.status, responseText: content });
      if (!res.ok) {
        lastError = json.error?.message ?? `HTTP ${res.status}`;
        // Missing usage is conservatively unknown, including HTTP errors.
        if (charge.costUnknown || /model|does not exist|access|permission/i.test(lastError)) break;
        continue;
      }
      if (contextual && (json.model !== modelRequested || charge.costUnknown)) return result("unknown", "judge model or usage could not be verified");
      if (reasoning && (json.choices?.[0]?.finish_reason !== "stop" || Number(json.usage?.completion_tokens) > BOARD_JUDGE_MAX_TOKENS || (json.service_tier && json.service_tier !== "default"))) {
        if (json.service_tier && json.service_tier !== "default") attempts.at(-1)!.costUnknown = true;
        return result("unknown", "judge completion, output cap or service tier could not be verified");
      }
      const parsed = contextual ? parseBoardVerdict(content) : parseVerdict(content);
      if (parsed) {
        if ("checks" in parsed) checks = parsed.checks;
        return result(parsed.verdict, parsed.reason);
      }
      lastError = "could not read the verdict";
      if (charge.costUnknown) break;
    }
    return result("unknown", lastError || "no answer");
  }
}

/** Under `screen`, a fast fail decides only when one of the checks it is trusted with failed. */
export function fastMayDecide(first: PatchJudgement, policy: JudgePolicy): boolean {
  if (policy === "chain") return true;
  const checks = first.checks;
  if (!checks) return true;
  return FAST_FINAL_CHECKS.some((key) => checks[key] === "fail");
}

/** The judgement as it is written to the row: without the wire images, which are kept as assets. */
export function judgementForJson(judgement: PatchJudgement): PatchJudgement {
  const { wireImages: _wire, reviews, ...rest } = judgement;
  return { ...rest, ...(reviews ? { reviews: reviews.map(judgementForJson) } : {}) };
}

/** Keep wording identical across old/new evaluations; capture it in evidence. */
export function judgePrompt(childName: string): string {
  return [
      `The FIRST image is one cut-out taken from an illustrated hidden-object picture.`,
      `The SECOND image is the reference sheet for ${childName}, the child that cut-out is supposed to show.`,
      `Do not assume the child is a girl or a boy: the reference sheet is the only thing that says who they are.`,
      `The clothes may differ from the sheet — the child is dressed for the place. Judge by face, hair, skin tone and build, never by outfit.`,
      `Answer only whether the cut-out shows THAT CHILD, drawn whole as far as it goes.`,
      `"ok" — it is that child, their face can be seen, and what is there is complete in itself: a head and shoulders over a wall, or a child cut off at the waist by something in front of them, both count.`,
      `"bad" — it is an object, an animal, scenery, a different person, a body with no face, half a face with the other half cut clean away, or nothing recognisable.`,
      `Reply with JSON only: {"verdict":"ok"|"bad","reason":"<at most eight words>"}`,
    ].join(" ");

}

function parseVerdict(content: string | undefined): { verdict: "ok" | "bad"; reason: string } | null {
  if (!content) return null;
  try {
    const raw = JSON.parse(content) as { verdict?: unknown; reason?: unknown };
    if (raw.verdict !== "ok" && raw.verdict !== "bad") return null;
    return { verdict: raw.verdict, reason: typeof raw.reason === "string" ? raw.reason.slice(0, 120) : "" };
  } catch {
    return null;
  }
}

/**
 * Standard-rate cents from recorded usage, without per-request rounding.
 * Cached-token discounts are not assumed; this is not an invoice total.
 */
export function judgeCharge(model: string, usage: Record<string, unknown> | undefined): { costCents: number; costUnknown: boolean } {
  // Keep historical 5.4 accounting stable. For Sol, count cache writes at the
  // upper input rate, without assuming a discount; usage remains available.
  const rates = model === "gpt-5.6-sol" ? [500, 2000] : model === "gpt-5.4-2026-03-05" ? [250, 1500] : /^gpt-4o-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model) ? [15, 60] : /^gpt-4o(?:-\d{4}-\d{2}-\d{2})?$/.test(model) ? [250, 1000] : null;
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  if (!rates || typeof input !== "number" || !Number.isInteger(input) || input < 0 || typeof output !== "number" || !Number.isInteger(output) || output < 0) return { costCents: 0, costUnknown: true };
  return { costCents: (input * rates[0]! + output * rates[1]!) / 1_000_000, costUnknown: false };
}

/**
 * Conservative reservation for ONE existing 512px+512px mini judgement.
 * Two images each use at most one tile: 2*(2833+5667) tokens; UTF-8 bytes
 * upper-bound text tokens, plus 256 framing tokens, and max_tokens=60.
 * Standard (uncached) rates checked 2026-09-06; discounts are not assumed.
 * https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
 * https://developers.openai.com/api/docs/models/gpt-4o-mini
 */
export function judgeReserveCents(model: string, childName: string): number {
  if (model !== "gpt-4o-mini") throw new Error("budgeted rejudge is priced only for gpt-4o-mini");
  const input = 2 * (2833 + 5667) + Buffer.byteLength(judgePrompt(childName), "utf8") + 256;
  return Math.ceil(((input * 15 + MAX_OUTPUT_TOKENS * 60) / 1_000_000) * 1_000_000) / 1_000_000;
}

/**
 * The default: no opinion.
 *
 * Every provider is behind an interface and the mock is the default (CLAUDE.md),
 * and a dev box with no key must not have every hiding spot sent to review. It
 * answers "unknown", which is honest — nothing looked at the picture.
 */
export class NoPatchJudge implements PatchJudge {
  readonly id = "none" as const;
  async judge(): Promise<PatchJudgement> {
    return { verdict: "unknown", reason: "no judge configured", costCents: 0 };
  }
}
