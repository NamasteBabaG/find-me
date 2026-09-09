/** Explicit, narrow LOW experiment. Historical MEDIUM evidence stays unchanged. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { BOARD_CHECKS, parseBoardVerdict } from "../src/infra/generation/board-verdict";
import { judgeCharge } from "../src/infra/generation/judge";

export const LOW_PAIR_ID = "fixed-medium-low-pair-20260908";
export const MEDIUM_PAIR_CASE = "work/fixed-sprite-pilot-20260908/standing-v1/automatic-occluded-joint-yuval-v1/freestanding-left-crates-candidate/judge-case.json";
export const MEDIUM_PAIR_REVIEW = "work/fixed-sprite-pilot-20260908/stages/occluded-joint-yuval-review-v1/result.json";
// Explicitly approved historical artifacts, not hashes learned from whatever is
// currently at these paths. Replacing a result cannot mint a new LOW sponsor.
export const MEDIUM_PAIR_HASHES = Object.freeze({
  case: "56c63b8e161704ea1b38f8948e3abe0df85f1a9cd925a7512b301431c1698833",
  review: "2ad1f083a1c57e04cc050bebebc8f2708c80647e8334fc20348eb19f8076f444",
  sourceRequest: "b6d17ea0ead69d3f694730919ed85c84ae710e14edfe6320117a7ba7a012a254",
});
export const NOA_MEDIUM_PAIR = Object.freeze({
  caseFile: "work/fixed-sprite-pilot-20260908/standing-v1/automatic-occluded-joint-noa-v1/freestanding-left-crates-candidate/judge-case.json",
  reviewFile: "work/fixed-sprite-pilot-20260908/stages/occluded-joint-noa-review-v1/result.json",
  hashes: Object.freeze({ case: "64456fce9cbf316ef4975ed8457153d40ec8df23815eb819ac56b888a3684c56", review: "9fd26a8afd18a775dcc41ee76b037642a9e1a5b25e8fbbb2d97f488a14e71748", sourceRequest: "56af33f96e74b41dff3986766ae2ba65a376ca7d47d85080ec1ce35bc9c140e7" }),
});
const YUVAL_MEDIUM_PAIR = { caseFile: MEDIUM_PAIR_CASE, reviewFile: MEDIUM_PAIR_REVIEW, hashes: MEDIUM_PAIR_HASHES };
export const LOW_PAIR_SCALE_STEP_PX = 0.2;
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`LOW_PAIR: ${message}`); }

type Verified = Awaited<ReturnType<typeof import("./fixed-pose-evidence").validateFixedPoseReviewCase>>;
export interface MediumPairSnapshot {
  caseBytes: Buffer; reviewBytes: Buffer; inputsBytes: Buffer; requestBytes: Buffer;
  prompt: Buffer; style: Buffer; identity: Buffer; verified: Verified;
}

/** Pure consistency test seam; NOT authorization. Only successfulMediumPair()
 * pins the approved historical files and performs the actual geometry replay. */
export function verifyMediumPairSnapshot(snapshot: MediumPairSnapshot, files = { caseFile: MEDIUM_PAIR_CASE, reviewFile: MEDIUM_PAIR_REVIEW }) {
  const { caseBytes, reviewBytes, inputsBytes, requestBytes, prompt, style, identity, verified } = snapshot;
  const review = JSON.parse(reviewBytes.toString("utf8"));
  const caseData = JSON.parse(caseBytes.toString("utf8"));
  const inputs = JSON.parse(inputsBytes.toString("utf8"));
  const sourceDir = path.dirname(inputs.sourceFile);
  const request = JSON.parse(requestBytes.toString("utf8"));
  demand(request.policy?.imageQuality === "medium" && request.settings?.quality === "medium", "baseline is not MEDIUM");
  demand(isDeepStrictEqual(caseData, verified.caseData) && verified.evidence.caseSha256 === sha(caseBytes)
    && verified.evidence.inputsSha256 === sha(inputsBytes), "replay used different case or inputs bytes");
  demand(caseData.control === false && verified.manifest.ok === true && verified.evidence.geometryPassed === true
    && verified.evidence.geometryFailureAllowed === false && review.geometryPassed === true && review.visualChecksPassed === true
    && review.verdict === "ok" && review.costUnknown === false && review.held === false && review.model === "gpt-5.6-sol"
    && BOARD_CHECKS.every(k => review.checks?.[k] === "pass") && Object.keys(review.checks).length === BOARD_CHECKS.length,
  "baseline has not passed geometry and all seven known-cost visual checks");
  const boundEvidence = ["caseSha256", "manifestSha256", "inputsSha256", "contractSha256", "contextSha256", "nativeSha256", "patchSha256", "imageRequestId", "observationRequestId", "reference"] as const;
  demand(boundEvidence.every(key => isDeepStrictEqual(review.evidence?.[key], verified.evidence[key]))
    && review.evidence?.geometryPassed === true && review.evidence?.geometryFailureAllowed === false,
  "baseline review is not bound to the reconstructed composite");
  demand(Array.isArray(review.attempts) && review.attempts.length === 1, "baseline must have one complete review attempt");
  const attempt = review.attempts[0];
  const parsed = parseBoardVerdict(attempt.responseText, []);
  const charge = judgeCharge(attempt.model, attempt.usage);
  const usage = attempt.usage;
  demand(attempt.model === "gpt-5.6-sol" && attempt.status === 200 && /^req_[A-Za-z0-9_-]+$/.test(attempt.requestId)
    && attempt.costUnknown === false && parsed?.verdict === "ok" && isDeepStrictEqual(parsed.checks, review.checks)
    && charge.costUnknown === false && charge.costCents > 0 && charge.costCents === review.costCents && attempt.costCents === review.costCents
    && Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens > 0
    && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens > 0 && usage.completion_tokens <= 8000
    && Number.isSafeInteger(usage?.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens,
  "baseline review receipt or usage is invalid");
  // Re-reads must still be the bytes the evidence validator captured. This closes
  // the gap between its replay and returning generation inputs to the caller.
  for (const [file, bytes] of [[caseData.inputs, inputsBytes], [path.join(sourceDir, "request.json"), requestBytes],
    [path.join(sourceDir, "prompt.txt"), prompt], [path.join(sourceDir, "style.png"), style], [path.join(sourceDir, "identity.png"), identity]] as const) {
    const matches = verified.evidence.capturedFiles.filter(entry => path.resolve(entry.file) === path.resolve(file));
    demand(matches.length === 1 && matches[0]!.sha256 === sha(bytes) && matches[0]!.bytes === bytes.length, "paired source bytes differ from replay capture");
  }
  demand(request.promptSha256 === sha(prompt) && Array.isArray(request.inputs) && request.inputs.length === 2
    && request.inputs[0]?.file === "style.png" && request.inputs[0]?.sha256 === sha(style) && request.inputs[0]?.bytes === style.length
    && request.inputs[1]?.file === "identity.png" && request.inputs[1]?.sha256 === sha(identity) && request.inputs[1]?.bytes === identity.length,
  "paired source request does not bind the exact prompt and references");
  const search = verified.manifest.scaleSearch as { search?: { policy?: { version?: unknown; stepPx?: unknown; maxCandidates?: unknown } }; provenance?: { policySha256?: unknown } } | undefined;
  const scalePolicy = search?.search?.policy;
  demand(scalePolicy?.version === "fixed-scale-solver/v1" && scalePolicy.stepPx === LOW_PAIR_SCALE_STEP_PX && scalePolicy.maxCandidates === 65
    && search?.provenance?.policySha256 === sha(JSON.stringify(scalePolicy)), "baseline scale search policy changed");
  return { prompt, style, identity, verified, proof: {
    version: "medium-low-pair/v1", baselineCaseFile: path.resolve(files.caseFile), baselineCaseSha256: sha(caseBytes),
    baselineReviewFile: path.resolve(files.reviewFile), baselineReviewSha256: sha(reviewBytes), baselineSourceRequestSha256: sha(requestBytes),
    promptSha256: sha(prompt), styleSha256: sha(style), identitySha256: sha(identity),
    slotsFileSha256: inputs.slotsFileSha256, contractSha256: verified.evidence.contractSha256,
    recipeSha256: sha(JSON.stringify(caseData.recipe)), scalePolicySha256: search!.provenance!.policySha256,
    changedParameter: "image quality: medium to low", unchangedSize: "1024x1024", scaleStepPx: LOW_PAIR_SCALE_STEP_PX,
    limitation: "One paired stochastic sample, not an estimated quality or success rate",
  } };
}

/** Free baseline reconstruction before any LOW payment; no credential access.
 * Fixed pins are checked BEFORE recursive replay: LOW cannot sponsor LOW. */
export async function successfulMediumPair(pair: "yuval" | "noa" = "yuval") {
  demand(pair === "yuval" || pair === "noa", "unknown approved pair");
  const frozen = pair === "noa" ? NOA_MEDIUM_PAIR : YUVAL_MEDIUM_PAIR;
  const caseBytes = await readFile(frozen.caseFile), reviewBytes = await readFile(frozen.reviewFile);
  demand(sha(caseBytes) === frozen.hashes.case && sha(reviewBytes) === frozen.hashes.review, "approved baseline case or review hash changed");
  const caseData = JSON.parse(caseBytes.toString("utf8"));
  const inputsBytes = await readFile(caseData.inputs), inputs = JSON.parse(inputsBytes.toString("utf8"));
  const sourceDir = path.dirname(inputs.sourceFile), requestBytes = await readFile(path.join(sourceDir, "request.json"));
  const request = JSON.parse(requestBytes.toString("utf8"));
  demand(request.policy?.imageQuality === "medium" && request.settings?.quality === "medium", "baseline is not MEDIUM");
  demand(sha(requestBytes) === frozen.hashes.sourceRequest, "approved baseline source request hash changed");
  const { validateFixedPoseReviewCase } = await import("./fixed-pose-evidence");
  const verified = await validateFixedPoseReviewCase(frozen.caseFile);
  const [prompt, style, identity] = await Promise.all(["prompt.txt", "style.png", "identity.png"].map(file => readFile(path.join(sourceDir, file))));
  return verifyMediumPairSnapshot({ caseBytes, reviewBytes, inputsBytes, requestBytes, prompt: prompt!, style: style!, identity: identity!, verified }, frozen);
}

type LowRequest = { policy: Record<string, unknown>; settings: Record<string, unknown> };
type PairFiles = { prompt: Buffer; style: Buffer; identity: Buffer };
function demandLowPolicy(request: LowRequest) {
  demand(request.policy?.id === LOW_PAIR_ID && request.policy.imageQuality === "low" && request.policy.limitCents === 100
    && request.policy.imageModel === "gpt-image-2" && request.policy.judgeModel === "gpt-5.6-sol"
    && request.policy.judgeEffort === "high" && request.policy.noAutomaticRetries === true, "unapproved LOW policy");
  demand(request.settings?.kind === "image" && request.settings.modelRequested === "gpt-image-2" && request.settings.quality === "low"
    && request.settings.size === "1024x1024" && request.settings.background === "transparent" && request.settings.timeoutMs === 240000
    && isDeepStrictEqual(request.settings.inputOrder, ["style", "identity"]), "paired image settings changed");
  const keys = ["kind", "modelRequested", "quality", "size", "background", "inputOrder", "timeoutMs", "pairedMediumBaseline"];
  demand(Object.keys(request.settings).every(key => keys.includes(key)), "undeclared paired image setting");
}

/** Pure test seam, not payment authorization or a one-request lock. The caller
 * must reserve the fixed unique LOW request key in its durable budget ledger. */
export function verifyLowPairInputs(request: LowRequest, files: PairFiles, baseline: ReturnType<typeof verifyMediumPairSnapshot>) {
  demandLowPolicy(request);
  demand(isDeepStrictEqual(request.settings.pairedMediumBaseline, baseline.proof), "baseline proof changed or missing");
  demand(files.prompt.equals(baseline.prompt) && files.style.equals(baseline.style) && files.identity.equals(baseline.identity),
    "paired prompt or reference bytes changed");
  return baseline;
}

export async function validateLowPairRequest(request: LowRequest, files: PairFiles) {
  demandLowPolicy(request);
  const proof = request.settings.pairedMediumBaseline as { baselineCaseFile?: unknown; baselineReviewFile?: unknown } | undefined;
  const selected = proof?.baselineCaseFile === path.resolve(MEDIUM_PAIR_CASE) ? "yuval" : proof?.baselineCaseFile === path.resolve(NOA_MEDIUM_PAIR.caseFile) ? "noa" : null;
  demand(selected, "unknown approved pair");
  const baseline = await successfulMediumPair(selected);
  return verifyLowPairInputs(request, files, baseline);
}
