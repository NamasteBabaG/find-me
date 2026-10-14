import { createHash } from "node:crypto";
import { visualReviewPolicy, VISUAL_REVIEW_DEFAULT_EFFORT, type VisualReviewEffort, type VisualReviewJudge, type VisualReviewPolicy, type VisualReviewRole } from "../../domain/generation/visual-review-policy";
import { visualReviewInputBound } from "../../domain/generation/visual-review-input-bound";
import { requestAnthropicVisualReview } from "../../infra/generation/anthropic-visual-review";
import { visualReviewCharge } from "../../infra/generation/visual-review-pricing";
import { purchaseOnce, type PurchaseLedger, type RetainedPurchaseStore } from "./paid-operation";
import type { BudgetJson } from "./world-budget";
import { requestJudgeWire, localPatchBoardJudgePrompt, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels,
  diagnoseLocalPatchBoardAnswer, parseLocalPatchBoardVerdicts, JUDGE_IMAGE_DETAIL, type LocalPatchBoardJudgeRequest, type LocalPatchJudgeResult } from "./local-patch-judge";

export type VisualReviewQuestion = {
  readonly role: VisualReviewRole;
  readonly effort: VisualReviewEffort;
  /** Absent: the role's standing judge, as every historical question. */
  readonly judge?: VisualReviewJudge;
  readonly prompt: string;
  readonly images: readonly Buffer[];
  readonly labels: readonly string[];
};
export type PreparedVisualReview = VisualReviewQuestion & { readonly policy: VisualReviewPolicy; readonly fingerprint: string };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Policy, labels and every image participate in the paid identity. A new
 * model/effort must never replay a historical judgement under its new name. */
export function prepareVisualReview(question: VisualReviewQuestion): PreparedVisualReview {
  const policy = visualReviewPolicy(question.role, question.effort, question.judge);
  if (!question.prompt.trim() || question.images.length < 1 || question.images.length > 30
    || question.labels.length !== question.images.length || question.labels.some(l => !l.trim())
    || question.images.some(b => !b.length || b.length > 5 * 1024 * 1024)) throw Error("Invalid visual review evidence");
  const images = question.images.map(b => Buffer.from(b)), labels = [...question.labels];
  const fingerprint = sha(JSON.stringify({ policy, prompt: question.prompt, labels, images: images.map(sha) }));
  return { ...question, images, labels, policy, fingerprint };
}

export type VisualReviewMaxCharge =
  | { readonly ok: true; readonly inputTokens: number; readonly outputTokens: number; readonly microUsd: number }
  | { readonly ok: false; readonly reason: string };
/** The most a prepared question can be billed: its input bound (visual-review-input-bound.ts)
 * with its full output cap, thinking and reasoning included, priced by the rate card that
 * prices its real bill. Every input token gets the highest rate the card can give it: these
 * requests set no Anthropic cache breakpoint, and no OpenAI cache state prices a token above
 * the card's ordinary rate. */
export function visualReviewMaxCharge(question: PreparedVisualReview): VisualReviewMaxCharge {
  const { policy } = question;
  const bound = visualReviewInputBound({ provider: policy.provider, model: policy.model, detail: policy.provider === "openai" ? JUDGE_IMAGE_DETAIL : null,
    prompt: question.prompt, labels: question.labels, images: question.images });
  if (!bound.ok) return bound;
  const charge = visualReviewCharge(policy, policy.model, policy.provider === "anthropic"
    ? { input_tokens: bound.inputTokens, output_tokens: policy.maxOutputTokens }
    : { prompt_tokens: bound.inputTokens, completion_tokens: policy.maxOutputTokens });
  if (charge.costUnknown) return { ok: false, reason: `The rate card cannot price ${bound.inputTokens} input tokens for ${policy.model}` };
  return { ok: true, inputTokens: bound.inputTokens, outputTokens: policy.maxOutputTokens, microUsd: Math.ceil(charge.costCents * 10_000) };
}

export function sceneQualityQuestion(request: LocalPatchBoardJudgeRequest, effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT): VisualReviewQuestion {
  const labels = localPatchBoardJudgeImageLabels(request);
  if (!labels) throw Error("The Opus policy requires explicitly labelled age-bound evidence");
  return { role: "scene-quality", effort, prompt: localPatchBoardJudgePrompt(request), images: localPatchBoardJudgeImages(request), labels };
}

/** No fallback to an earlier model. Existing historical transports keep their
 * original contracts; this entry point is explicit and prospective. */
export async function requestVisualReview(apiKey: string, question: VisualReviewQuestion,
  fetchOnce: typeof fetch = fetch, timeoutMs?: number): Promise<LocalPatchJudgeResult> {
  const q = prepareVisualReview(question);
  if (!apiKey.trim()) throw Error(`${q.policy.provider === "anthropic" ? "ANTHROPIC" : "OPENAI"}_API_KEY is required for ${q.policy.model}`);
  const wire = q.policy.provider === "anthropic"
    ? { ...await requestAnthropicVisualReview(apiKey, { prompt: q.prompt, images: q.images, imageLabels: q.labels,
      effort: q.effort, timeoutMs, maxOutputTokens: q.policy.maxOutputTokens }, fetchOnce), verdict: null }
    : await requestJudgeWire(apiKey, { settings: q.policy, prompt: q.prompt, images: q.images, imageLabels: q.labels, timeoutMs }, fetchOnce);
  const charge = visualReviewCharge(q.policy, wire.model, wire.usage);
  return { ...wire, costUnknown: wire.costUnknown || charge.costUnknown };
}

export async function judgeSceneQuality(apiKey: string, request: LocalPatchBoardJudgeRequest,
  effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT, fetchOnce: typeof fetch = fetch) {
  const wire = await requestVisualReview(apiKey, sceneQualityQuestion(request, effort), fetchOnce, request.timeoutMs);
  return { ...wire, verdicts: parseVisualSceneVerdicts(wire.wireFault ? null : wire.raw,
    request.hides.map(h => h.hideId), request.contentVersion, request.reviewScope, request.assessmentMode) };
}

/** Accept one JSON document, optionally wrapped in one Markdown JSON fence.
 * Keep the provider's original text in the retained receipt. Never extract a
 * convenient JSON fragment from prose or weaken the existing verdict schema. */
export function parseVisualSceneVerdicts(...args: Parameters<typeof parseLocalPatchBoardVerdicts>) {
  const [raw, ...contract] = args;
  return parseLocalPatchBoardVerdicts(unfenced(raw), ...contract);
}

/** Why `parseVisualSceneVerdicts` refused the same text: a code and a JSON path, or null when it read every hide. */
export function diagnoseVisualSceneAnswer(...args: Parameters<typeof diagnoseLocalPatchBoardAnswer>) {
  const [raw, ...contract] = args;
  return diagnoseLocalPatchBoardAnswer(unfenced(raw), ...contract);
}
function unfenced(raw: string | null) {
  const text = raw?.trim() ?? null;
  return text?.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
}

/** The same durable purchase path as image generation. Credentials and evidence
 * are checked before any reserve. No retry, budget exception or approval waiver. */
export async function buyVisualReview(deps: { ledger: PurchaseLedger; store: RetainedPurchaseStore; apiKey: string; fetchOnce?: typeof fetch },
  input: { worldId: string; requestKey: string; reserveMicroUsd: number; question: VisualReviewQuestion }) {
  const q = prepareVisualReview(input.question);
  if (!deps.apiKey.trim()) throw Error(`${q.policy.provider === "anthropic" ? "ANTHROPIC" : "OPENAI"}_API_KEY is required before reserving a visual review`);
  return purchaseOnce(deps, { worldId: input.worldId, requestKey: input.requestKey, scope: "judge",
    operationFingerprint: q.fingerprint, reserveMicroUsd: input.reserveMicroUsd,
    buy: async ({ timeoutMs }) => {
      const reply = await requestVisualReview(deps.apiKey, q, deps.fetchOnce, timeoutMs ?? undefined);
      const charge = visualReviewCharge(q.policy, reply.model, reply.usage);
      const bytes = Buffer.from(JSON.stringify({ ...reply, policy: q.policy, fingerprint: q.fingerprint }));
      if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: `${q.policy.model} review charge unresolved` };
      return { bytes, evidence: { providerNamespace: `${q.policy.provider}:find-me-existing`, providerRequestId: reply.requestId,
        usageId: sha(JSON.stringify(reply.usage)), rawUsage: reply.usage as BudgetJson, model: reply.model!,
        amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" as const } };
    } });
}
