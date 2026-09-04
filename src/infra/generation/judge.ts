import sharp from "sharp";
import type { PatchJudge, PatchJudgement } from "./types";

/**
 * Does this finished patch actually show the child?
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
const TRIES = 2;

export interface JudgeOptions {
  /** A vision-capable chat model. */
  model?: string;
  timeoutMs?: number;
}

export class OpenAiPatchJudge implements PatchJudge {
  readonly id = "openai" as const;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly apiKey: string,
    options: JudgeOptions = {},
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the patch judge");
    this.model = options.model ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async judge(input: { patchPng: Buffer; reference: Buffer; childName: string; label: string }): Promise<PatchJudgement> {
    // The patch is transparent where it is not the child; flattened onto a flat
    // grey its silhouette reads clearly instead of dissolving into white.
    const patch = await sharp(input.patchPng)
      .resize(512, 512, { fit: "contain", background: { r: 130, g: 130, b: 130, alpha: 1 } })
      .flatten({ background: { r: 130, g: 130, b: 130 } })
      .png()
      .toBuffer();
    const sheet = await sharp(input.reference).resize(512, 512, { fit: "inside" }).png().toBuffer();

    const prompt = [
      `The FIRST image is one cut-out taken from an illustrated hidden-object picture.`,
      `The SECOND image is the reference sheet for ${input.childName}, the child that cut-out is supposed to show.`,
      `Do not assume the child is a girl or a boy: the reference sheet is the only thing that says who they are.`,
      `Answer only whether the cut-out shows THAT CHILD, drawn whole as far as it goes.`,
      `"ok" — it is that child, their face can be seen, and what is there is complete in itself: a head and shoulders over a wall, or a child cut off at the waist by something in front of them, both count.`,
      `"bad" — it is an object, an animal, scenery, a different person, a body with no face, half a face with the other half cut clean away, or nothing recognisable.`,
      `Reply with JSON only: {"verdict":"ok"|"bad","reason":"<at most eight words>"}`,
    ].join(" ");

    let lastError = "";
    for (let attempt = 1; attempt <= TRIES; attempt++) {
      const res = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 60,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/png;base64,${patch.toString("base64")}` } },
                { type: "image_url", image_url: { url: `data:image/png;base64,${sheet.toString("base64")}` } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      }).catch((err: Error) => err);

      if (res instanceof Error) {
        lastError = res.name === "TimeoutError" ? `timed out after ${Math.round(this.timeoutMs / 1000)}s` : res.message;
        continue;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!res.ok) {
        lastError = json.error?.message ?? `HTTP ${res.status}`;
        // A model this account cannot use is a configuration problem, not a
        // flaky call — saying so once beats retrying into the same wall.
        if (/model|does not exist|access|permission/i.test(lastError)) break;
        continue;
      }
      const parsed = parseVerdict(json.choices?.[0]?.message?.content);
      if (!parsed) {
        lastError = "could not read the verdict";
        continue;
      }
      return { ...parsed, costCents: costOf(this.model, json.usage), model: this.model };
    }
    // Never guess. A judge that cannot answer must not quietly approve, and must
    // not reject work that may be perfectly good either.
    return { verdict: "unknown", reason: lastError || "no answer", costCents: 0, model: this.model };
  }
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
 * Cents for one judgement. Rough on purpose: it is fractions of a cent against a
 * 7-cent roll, and it exists so the number shows up in the game's total rather
 * than hiding.
 */
function costOf(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined): number {
  if (!usage) return 0;
  const mini = /mini|small|nano/i.test(model);
  const inPer1M = mini ? 15 : 250; // cents per million input tokens
  const outPer1M = mini ? 60 : 1000;
  const cents = ((usage.prompt_tokens ?? 0) * inPer1M + (usage.completion_tokens ?? 0) * outPer1M) / 1_000_000;
  return Math.round(cents * 100) / 100;
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
