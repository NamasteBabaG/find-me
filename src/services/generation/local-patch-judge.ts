/**
 * Looking at a finished local patch the way a person does.
 *
 * The code can answer two questions about a patch: is the seam sound, and did
 * anything change outside the rectangle we declared. Three paid renders showed
 * that those two are not enough. One of them changed the crop convincingly and
 * simply did not contain our child at all - a large, confident, entirely wrong
 * result that every pixel check passes.
 *
 * So this asks the questions only a reader can answer, one hide at a time.
 *
 * WHAT IT DOES NOT ASK, by product decision: whether the picture still matches
 * the one it started from. An earlier version compared AFTER against BEFORE and
 * refused a hide whenever a bystander had moved, vanished or been repainted, and
 * that refused good pictures: a dog a hand-span to the left, a cat that shifted,
 * two children gone from a crowd of forty. Nobody plays the BEFORE. The game is
 * generated and sent without a person in the loop, so a judge that holds out for
 * an unchanged neighbourhood does not protect a player from anything - it just
 * throws away pictures that look right.
 *
 * What still refuses a hide is the picture itself being wrong: a body with no
 * head, a hand closed around nothing, a bucket floating where its owner stood, a
 * hard rectangular edge across the paving. Those are visible without the BEFORE,
 * and a child would see them.
 *
 * Two of the checks are only answerable against what was asked for, so the
 * caller passes it: which pose she was posed in, and the age the parent stated.
 *
 * Each hide gets its own verdict. One bad hide must not condemn its neighbours.
 */
import { z } from "zod";

export const LOCAL_PATCH_JUDGE = Object.freeze({
  model: "gpt-5.6-sol",
  /** LOW by product decision, like the final composite judge. */
  effort: "low" as const,
  /** Raised once faults carried a location each: 1200 truncated the answer, and a
   * truncated answer is discarded, so a good hide was thrown away for nothing. */
  maxOutputTokens: 3000,
  endpoint: "https://api.openai.com/v1/chat/completions",
  /** A judgement that has not arrived in four minutes is not going to. */
  timeoutMs: 240_000,
});

const check = z.enum(["pass", "fail", "unsure"]);

/** The three that decide, and the three that describe how well she sits there. */
export const BLOCKING_CHECKS = Object.freeze(["childPresent", "childOnlyOnce", "childComplete", "pictureWhole"] as const);
export const JUDGE_CHECKS = Object.freeze([...BLOCKING_CHECKS, "scaleRight", "groundContact", "styleMatch"] as const);

export const localPatchVerdictSchema = z.object({
  childPresent: check.describe("the child from the reference portrait is in the marked area"),
  /**
   * She may appear once and only once. Re-rendering a hide in a shorter pose box
   * left the earlier standing child's head above the new mask and painted a
   * kneeling one below it: two of her, a step apart, both perfectly drawn. Every
   * other check passed, because nothing was broken and nothing was missing - the
   * picture was simply wrong in the one way the game cannot survive, since a
   * player finds her twice and the second one never clears.
   */
  childOnlyOnce: check.describe("the child appears exactly once - no second copy of the same child anywhere in the picture"),
  /**
   * Occlusion is the point, not a defect. The whole look the product is after is
   * a child standing behind a market stall or a passer-by with part of her out of
   * sight, so "whole" means nothing of her is missing or sliced off - not that
   * all of her is visible.
   */
  childComplete: check.describe("the child is drawn whole: no part is sliced off or missing, though the child may be partly hidden behind something in front of them"),
  /**
   * The one check that replaced three. `replacementClean`, `noOrphans` and the
   * seam half of `sceneDrift` were all asking the same thing in different words -
   * is anything in this picture broken - while the other half of `sceneDrift` was
   * asking something the product does not care about.
   */
  pictureWhole: check.describe("nothing in the picture is broken or half-drawn: no body without a head, no limb with no owner, no hand closed on nothing, no floating prop, no smear, no hard rectangular edge"),
  scaleRight: check.describe("the child's height matches children of THEIR OWN AGE at that depth, not the toddlers nearby"),
  groundContact: check.describe("the child rests on whatever holds them - feet, knees or seat - with a contact shadow, not floating"),
  styleMatch: check.describe("drawn in the same illustration style, light and saturation"),
  verdict: z.enum(["pass", "fail", "unsure"]),
  reason: z.string().trim().min(1).max(400),
  /**
   * Every failed check has to say WHERE. A fault nobody can find is a fault
   * nobody can fix, and one round produced a leftover leg that neither the
   * operator nor the product owner could locate. A located claim can be checked;
   * an unlocated one cannot, so the schema stops accepting them.
   */
  faults: z.array(z.preprocess(raw => {
    // The model answers this field in several shapes across runs: a sentence, an
    // object keyed `where`, an object keyed `location`. All three are the same
    // information, and rejecting two of them on shape discarded real findings -
    // a cat moved between her feet, an extra child added at the edge. So the
    // shapes are normalised here rather than argued with.
    if (typeof raw === "string") return { check: "unspecified", where: raw };
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      const where = [r.where, r.location, r.detail, r.description].find(v => typeof v === "string" && v.trim());
      if (typeof where === "string") return { check: typeof r.check === "string" && r.check.trim() ? r.check : "unspecified", where };
    }
    return raw;
  }, z.object({
    check: z.string().trim().min(1).max(40),
    where: z.string().trim().min(1).max(300).describe("where in the AFTER image, in plain words"),
  }).strict())).max(8).default([]),
}).strict().transform(v => {
  const normalised = { ...v };

  // The prompt already says: if you cannot point at it, mark it unsure. So an
  // unlocated failure is CONVERTED, not rejected. Rejecting the whole answer
  // threw away two complete, useful judgements over one unnamed field.
  const downgraded: string[] = [];
  if (!v.faults.length) {
    for (const key of JUDGE_CHECKS) if (v[key] === "fail") { normalised[key] = "unsure"; downgraded.push(key); }
  }

  // The overall verdict is DERIVED, always, and never taken from the model's own
  // summary line. Answers came back saying the child was missing or uncertain
  // while still declaring "pass", and trusting that line counted them as
  // successes. The rule is the one the prompt states: the three that matter must
  // all pass, and nothing may be a fail.
  // A fault that NAMES a check and does not find that check already failing is
  // evidence the fields do not carry. `pass` beside a fault was caught; `unsure`
  // beside a fault was not, and `scaleRight: unsure` with a fault describing a
  // head three times the size of the child beside it still derived a clean pass,
  // because scaleRight is not one of the blocking four and nothing else looked.
  // The description is the evidence and the field is only the summary.
  const contradicted: string[] = [];
  for (const key of JUDGE_CHECKS) {
    if (normalised[key] !== "fail" && v.faults.some(f => f.check === key)) {
      if (normalised[key] === "pass") normalised[key] = "unsure";
      contradicted.push(key);
    }
  }

  // A fault nobody could route is still a fault somebody saw.
  //
  // The parser accepts three shapes for a fault and gives the shapeless one
  // `check: "unspecified"`, which matched no check and therefore contradicted
  // none of them. An answer with every field green, its own summary saying fail,
  // and a sentence describing a headless passer-by came out of here as a clean
  // pass - the worst shape this gate can fail in, because the game is sent with
  // nobody looking. The prompt now says every fault must name a check; one that
  // does not is a reason to look, never a reason to buy.
  const known = new Set<string>(JUDGE_CHECKS);
  const unclassified = v.faults.filter(f => !known.has(f.check)).map(f => f.where);

  const anyFail = JUDGE_CHECKS.some(key => normalised[key] === "fail");
  const blocking = BLOCKING_CHECKS.some(key => normalised[key] !== "pass");
  // A downgraded failure is NOT an approval. The model said something was wrong
  // and could not say where; that is a reason to look, never a reason to pass.
  // Without this a located-fault rule quietly turned every unlocated failure
  // into a clean sheet.
  const softened = downgraded.length > 0 || contradicted.length > 0 || unclassified.length > 0;
  const derived = anyFail ? "fail" as const : blocking || softened ? "unsure" as const : "pass" as const;
  return { ...normalised, verdict: derived, downgraded, contradicted, unclassified, claimedVerdict: v.verdict, verdictOverridden: derived !== v.verdict };
});
export type LocalPatchVerdict = z.infer<typeof localPatchVerdictSchema>;

export type LocalPatchExpectation = {
  /** How her body meets the world in the pose that was asked for. */
  readonly support?: string;
  /** The age the parent stated. Never guessed, and left out when unknown. */
  readonly ageYears?: number | null;
};

export function localPatchJudgePrompt(hideId: string, expectation: LocalPatchExpectation = {}): string {
  // Two checks cannot be answered without knowing what was asked for: a kneeling
  // child has no feet on the ground, and "the right height" means nothing until
  // you know whether she is four or eight. Both were being judged against a
  // standing eight-year-old by default, which is how a good kneeling render and
  // a genuinely small child came out the same.
  const asked = [
    expectation.support ? `The child was asked to rest ${expectation.support}; judge groundContact against THAT and nothing else.` : "",
    expectation.ageYears != null ? `The parent states the child is ${expectation.ageYears} years old; judge scaleRight against children of about that age at the child's depth, never against the toddlers.` : "",
  ].filter(Boolean);
  return [
    `You are checking ONE hiding place in a children's hidden-object picture, called "${hideId}".`,
    "You are given three images, in this order: the scene BEFORE, the same scene AFTER a child was drawn into it, and a reference portrait of that child.",
    "",
    "Judge the AFTER image on its own, as a picture. BEFORE is there only to show you the drawing style, the light, and how tall people are at each depth.",
    "DO NOT hunt for differences from BEFORE. If somebody who was in BEFORE has moved, gone, been repainted, or somebody new is there, that is NOT a fault and you must not report it. Nobody sees BEFORE.",
    "A child who was standing where the reference child now stands MAY have been replaced completely; that is allowed. What is not allowed is a picture left broken.",
    "",
    "Answer each of these with pass, fail or unsure:",
    "childPresent - the child from the reference portrait is genuinely in the picture, not merely some child",
    "childOnlyOnce - the reference child is in the picture EXACTLY ONCE. Look for a second child with the same face, hair and clothes anywhere in the frame, in any pose; two copies of the reference child is a fail even when both are beautifully drawn. Other children who simply resemble the reference child are fine",
    "childComplete - the child is drawn whole. Being partly hidden BEHIND a person, a stall or anything else in front of them is correct and wanted, and is not a fault; a fault is a piece of the child simply missing, or their body sliced off by a straight edge that is not an object",
    "pictureWhole - looking only at AFTER: nothing in the picture is broken or half-drawn. No body without a head, no arm or leg belonging to nobody, no hand closed around nothing, no bag or bucket floating with no one holding it, no smeared patch, no hard rectangular edge cutting across the ground or a wall",
    "scaleRight - the child's height matches other children of THEIR OWN AGE standing at that same depth; the smallest toddler nearby is not the ruler",
    "groundContact - the child rests on whatever holds them, with a painted contact shadow where their body meets it, and is not floating",
    "styleMatch - the child is drawn in the same illustration style, light and saturation as the people around them",
    ...(asked.length ? ["", "WHAT WAS ASKED FOR:", ...asked] : []),
    "",
    "Then give an overall verdict: pass only if childPresent, childOnlyOnce, childComplete and pictureWhole are all pass and nothing else is fail. Use unsure when you genuinely cannot tell.",
    "",
    "For EVERY check you mark fail, add an entry to faults saying exactly where it is in the AFTER image, in plain words a person could follow - \"a bare foot beside the child's left ankle\", \"a hard vertical edge down the sand to the child's right\". If you cannot point at it, the check is not a fail; mark it unsure instead.",
    `Every entry in faults MUST set "check" to one of these exact names: ${JUDGE_CHECKS.join(", ")}. If what you noticed belongs to none of them - a bystander who moved, a colour you would have chosen differently - it is not a fault at all: leave it out of faults and mention it in reason instead.`,
    "Reply with JSON only, with exactly these keys: childPresent, childOnlyOnce, childComplete, pictureWhole, scaleRight, groundContact, styleMatch, verdict, reason, faults.",
    "Keep reason under 300 characters and say what you actually saw.",
  ].join("\n");
}

export type LocalPatchJudgeRequest = {
  hideId: string;
  /** The scene before, the scene after, and the identity reference. */
  beforePng: Buffer; afterPng: Buffer; identityPng: Buffer;
  /** What the painter was asked for, so two of the checks have a yardstick. */
  expectation?: LocalPatchExpectation;
  /**
   * Overridable so a test can prove the clock enforces a maximum rather than
   * only that an AbortError is classified as one. Production never sets it.
   */
  timeoutMs?: number;
};

/**
 * Why the answer was not usable, when it was not. `null` means it was.
 *
 * Kept apart from the verdict on purpose: "the picture is wrong" and "the reply
 * was not trustworthy" are different facts, and only the first is about the
 * picture. Collapsing them is how a wrong model, a truncated answer and a reply
 * with no receipt all became approvals.
 */
export type JudgeWireFault = "http" | "no-content" | "not-json" | "schema" | "truncated" | "wrong-model" | "no-receipt" | "timeout";

export type LocalPatchJudgeResult = {
  verdict: LocalPatchVerdict | null;
  raw: string | null;
  usage: Record<string, unknown> | null;
  requestId: string | null;
  /** What the provider says it ran, and how it stopped. */
  model: string | null;
  finishReason: string | null;
  /** Set when the reply could not be trusted, whatever it said about the picture. */
  wireFault: JudgeWireFault | null;
  /**
   * True when this call may have been billed and we cannot say how much: no
   * usage, or the request died after dispatch. An unknown charge is not zero.
   */
  costUnknown: boolean;
};

const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * The model named in the reply must be the one we asked for, or a dated
 * snapshot of it. `startsWith` alone accepts `gpt-5.6-solarbitrary`, which is a
 * different model wearing a prefix.
 */
export function isTheModelWeAsked(model: string | null): boolean {
  if (model === null) return false;
  if (model === LOCAL_PATCH_JUDGE.model) return true;
  // A dated snapshot and nothing else. Built by hand rather than by interpolating
  // the model name into a pattern: the name contains a `.`, which a regex reads
  // as "any character", so a pattern made that way is looser than it looks.
  const suffix = model.slice(LOCAL_PATCH_JUDGE.model.length);
  return model.startsWith(`${LOCAL_PATCH_JUDGE.model}-`) && /^-\d{4}-\d{2}-\d{2}$/.test(suffix);
}

/** One judgement. The caller owns the ledger; this only asks, checks and parses. */
export async function judgeLocalPatch(apiKey: string, request: LocalPatchJudgeRequest,
  fetchOnce: typeof fetch = fetch): Promise<LocalPatchJudgeResult> {
  const prompt = localPatchJudgePrompt(request.hideId, request.expectation ?? {});
  const image = (png: Buffer) => ({ type: "image_url" as const, image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" as const } });
  const abort = new AbortController();
  // A request with no deadline is a run that can hang for as long as the network
  // lets it, holding a reservation nobody will settle.
  const timer = setTimeout(() => abort.abort(), request.timeoutMs ?? LOCAL_PATCH_JUDGE.timeoutMs);
  let response: Response;
  try {
    response = await fetchOnce(LOCAL_PATCH_JUDGE.endpoint, {
      method: "POST", redirect: "error", signal: abort.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_PATCH_JUDGE.model, reasoning_effort: LOCAL_PATCH_JUDGE.effort,
        max_completion_tokens: LOCAL_PATCH_JUDGE.maxOutputTokens, service_tier: "default", store: false,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, image(request.beforePng), image(request.afterPng), image(request.identityPng)] }],
      }),
    });
  } catch {
    // Dispatched and then lost: the provider may still have billed it.
    clearTimeout(timer);
    return { verdict: null, raw: null, usage: null, requestId: null, model: null, finishReason: null, wireFault: "timeout", costUnknown: true };
  }

  // The timer stays armed until the BODY is read. Clearing it on the headers
  // left a slow or stalled body outside every deadline the call has, which is
  // the shape a hung judgement actually takes: headers in milliseconds, then
  // nothing.
  const requestId = response.headers.get("x-request-id");
  let body: { model?: string; choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: Record<string, unknown> } | null;
  try {
    body = await response.json() as typeof body;
  } catch {
    clearTimeout(timer);
    return { verdict: null, raw: null, usage: null, requestId, model: null, finishReason: null, wireFault: abort.signal.aborted ? "timeout" : "not-json", costUnknown: true };
  } finally { clearTimeout(timer); }
  const raw = body?.choices?.[0]?.message?.content ?? null;
  const model = typeof body?.model === "string" ? body.model : null;
  const finishReason = typeof body?.choices?.[0]?.finish_reason === "string" ? body.choices[0]!.finish_reason! : null;
  const usage = body?.usage ?? null;
  // Tokens are what the charge is computed from, so a reply without them is a
  // charge we cannot state. `costUnknown` is the honest answer, not zero.
  const billed = !!usage && numeric(usage.prompt_tokens) && numeric(usage.completion_tokens);
  const refuse = (wireFault: JudgeWireFault): LocalPatchJudgeResult =>
    ({ verdict: null, raw, usage, requestId, model, finishReason, wireFault, costUnknown: !billed });

  if (!response.ok) return refuse("http");
  if (typeof raw !== "string") return refuse("no-content");
  // A reply from a model we did not ask for is not this judge's judgement, and
  // its effort setting - which the whole cost decision rests on - is unknown.
  //
  // Both of these are REQUIRED, not checked-when-present. Skipping the check on
  // a missing field let a reply with no `model` and no `finish_reason` through
  // as a clean pass, which is the same hole with the field left out instead of
  // filled in wrongly. And the match is exact or an explicit dated snapshot of
  // the same model: `startsWith` accepted `gpt-5.6-solarbitrary`.
  if (!isTheModelWeAsked(model)) return refuse("wrong-model");
  // `length` means the answer stopped mid-sentence. What survived may parse.
  if (finishReason !== "stop") return refuse("truncated");
  if (!requestId) return refuse("no-receipt");

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return refuse("not-json"); }
  const result = localPatchVerdictSchema.safeParse(parsed);
  // A truncated or malformed answer is never an approval.
  if (!result.success) return refuse("schema");
  return { verdict: result.data, raw, usage, requestId, model, finishReason, wireFault: null, costUnknown: !billed };
}
