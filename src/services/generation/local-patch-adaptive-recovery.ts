import { createHash } from "node:crypto";
import { z } from "zod";
import { cropOf, maskForHide, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { localPatchExplicitUncertaintyChecks } from "./local-patch-judge";

/** New rows opt in. Historical paid requests must keep their exact recipe. */
export const ADAPTIVE_RECOVERY_VERSION = "local-patch-adaptive-recovery/v1";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const checks = ["childPresent", "childOnlyOnce", "childComplete", "pictureWhole", "scaleRight", "groundContact",
  "styleMatch", "faceLikeness", "faceReadable", "severeSeam", "ageAppropriate"] as const;
const checkSchema = z.enum(checks);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceSchema = z.object({ attempt: z.number().int().min(1).max(2), judgementSha256: digest,
  failedChecks: z.array(checkSchema), uncertainChecks: z.array(checkSchema), uncertain: z.boolean(), seamFailure: z.boolean() }).strict();
const strategies = z.enum(["placement-lock", "registration-lock", "identity-lock", "age-proportions", "scene-paint", "evidence-hold"]);
const planBodySchema = z.object({ version: z.literal(ADAPTIVE_RECOVERY_VERSION), attempt: z.literal(3),
  contextSha256: digest, evidence: z.tuple([evidenceSchema, evidenceSchema]),
  strategies: z.array(strategies).min(1), repeatedChecks: z.array(checkSchema) }).strict();
const planSchema = planBodySchema.extend({ sha256: digest }).strict();
const stateSchema = z.object({ version: z.literal(ADAPTIVE_RECOVERY_VERSION),
  history: z.array(evidenceSchema).max(2), plan: planSchema.nullable() }).strict();
export type AdaptiveRecoveryState = z.infer<typeof stateSchema>;
export type AdaptiveRecoveryPlan = z.infer<typeof planSchema>;
export type AdaptiveRecoveryContext = { gameId: string; rowId: string; contentVersion: number; promptVersion: string;
  boardSha256: string; identitySha256: string; renderPolicySha256: string; ageYears: number; hide: LocalPatchHide };

export const initialAdaptiveRecovery = (): AdaptiveRecoveryState => ({ version: ADAPTIVE_RECOVERY_VERSION, history: [], plan: null });

/** Only typed defect codes reach the next prompt; reviewer prose is evidence, never instructions. */
function evidence(judgeJson: string | null, attempt: number, context: AdaptiveRecoveryContext): z.infer<typeof evidenceSchema> {
  const value = JSON.parse(judgeJson ?? "null"), verdict = value?.verdict;
  const seamFailure = typeof value?.renderFault === "string" && /^quality-seam(?::|$)/.test(value.renderFault)
    && ["misaligned", "background-rewritten"].includes(value?.seam?.verdict);
  const failedChecks = checks.filter(check => verdict?.[check] === "fail"
    || Array.isArray(verdict?.faults) && verdict.faults.some((f: { check?: string }) => f?.check === check));
  const uncertainty = localPatchExplicitUncertaintyChecks(verdict, context.contentVersion, { hideId: context.hide.id });
  const uncertainChecks = checks.filter(check => uncertainty.includes(check));
  // Exclude our own state to keep evidence identity independent of the archive.
  const { adaptiveRecovery: _state, ...judgement } = value ?? {};
  return evidenceSchema.parse({ attempt, judgementSha256: hash(judgement), failedChecks, uncertainChecks,
    seamFailure, uncertain: !!value?.wireFault || (!verdict && !seamFailure)
      || (!failedChecks.length && !uncertainChecks.length && !seamFailure) });
}

function diagnose(context: AdaptiveRecoveryContext, history: AdaptiveRecoveryState["history"]): AdaptiveRecoveryPlan {
  if (history.length !== 2 || history[0]?.attempt !== 1 || history[1]?.attempt !== 2) throw Error("ADAPTIVE_RECOVERY: two distinct completed attempts are required");
  const latest = history[1], failed = new Set(history.flatMap(e => [...e.failedChecks, ...e.uncertainChecks]));
  const selected = new Set<z.infer<typeof strategies>>();
  if (latest.uncertain) selected.add("evidence-hold");
  else {
    if (history.some(e => e.seamFailure) || failed.has("severeSeam")) selected.add("registration-lock");
    if (["childPresent", "childOnlyOnce", "childComplete", "pictureWhole", "groundContact", "faceReadable"].some(c => failed.has(c as typeof checks[number]))) selected.add("placement-lock");
    if (failed.has("faceLikeness")) selected.add("identity-lock");
    if (failed.has("ageAppropriate") || failed.has("scaleRight")) selected.add("age-proportions");
    if (failed.has("styleMatch")) selected.add("scene-paint");
    if (!selected.size) selected.add("evidence-hold");
  }
  const body = planBodySchema.parse({ version: ADAPTIVE_RECOVERY_VERSION, attempt: 3, contextSha256: hash(context),
    evidence: history, strategies: [...selected], repeatedChecks: checks.filter(c => history.every(e => [...e.failedChecks, ...e.uncertainChecks].includes(c))) });
  return { ...body, sha256: hash(body) };
}

/** Called before reserving attempt 3, and replayed unchanged after an interruption. */
export function prepareAdaptiveRecovery(judgeJson: string | null, row: { status: string; attempts: number },
  attempt: number, context: AdaptiveRecoveryContext): AdaptiveRecoveryState | null {
  const value = JSON.parse(judgeJson ?? "null");
  if (!value?.adaptiveRecovery) return null;
  const state = stateSchema.parse(value.adaptiveRecovery);
  if (row.status === "FAILED" && row.attempts > 0 && row.attempts < 3) {
    const item = evidence(judgeJson, row.attempts, context), previous = state.history.find(e => e.attempt === item.attempt);
    if (previous && hash(previous) !== hash(item)) throw Error("ADAPTIVE_RECOVERY: completed evidence changed");
    if (!previous) state.history.push(item);
  }
  if (attempt !== 3) return state;
  const expected = diagnose(context, state.history);
  if (state.plan && JSON.stringify(state.plan) !== JSON.stringify(expected)) throw Error("ADAPTIVE_RECOVERY: immutable recovery context changed");
  state.plan = expected;
  return state;
}

export function adaptiveRecoveryPrompt(plan: AdaptiveRecoveryPlan, hide: LocalPatchHide): string {
  const { sha256, ...body } = planSchema.parse(plan);
  if (hash(body) !== sha256 || plan.strategies.includes("evidence-hold")) throw Error("ADAPTIVE_RECOVERY: unresolved evidence cannot authorize another image");
  const box = maskForHide(hide), crop = cropOf(hide);
  const directions: Record<z.infer<typeof strategies>, string> = {
    "placement-lock": "Solve placement first: fit the COMPLETE head, hair and visible body inside the exact authored target, with natural occlusion only. Do not move to a similar-looking person elsewhere in the context. Keep ground contact and neighbours intact. A clipped head cannot be repaired by changing the face or expanding the returned window.",
    "registration-lock": "Solve registration first: preserve every border, wall, ground line and object at its original pixel coordinates. No zoom, camera movement, translation or background repaint. The original return window and seam checks remain unchanged.",
    "identity-lock": "Solve identity independently of placement: use only the approved portrait's facial geometry, hairline, length and curl pattern. Do not borrow the nearby child's face. Keep the complete recognizable head within the authored target and retain the original ground depth.",
    "age-proportions": "Solve whole-body proportions before detail: match the stated age in shoulders, torso, limbs and hands, with the same support/depth. The mask is a maximum, not a size to fill. Do not substitute an older body, enlarge the head, raise the ground line or shift the person upward to fit.",
    "scene-paint": "Solve paint handling while preserving identity: match the local board's matte skin planes, grouped hair strokes, contours, lighting and detail scale. No texture overlay, sharpening or photographic portrait pasted onto a body.",
    "evidence-hold": "",
  };
  return [`ADAPTIVE RECOVERY ${ADAPTIVE_RECOVERY_VERSION}. Two completed attempts were diagnosed before this final purchase.`,
    `Target in the original ${crop.width}x${crop.height} crop: ${JSON.stringify(box)}. Ground/envelope bottom=${box.top + box.height}. Preserve the authored pose and support.`,
    `Repeated defects or explicit visual uncertainty: ${plan.repeatedChecks.join(", ") || "different checks across the two attempts"}.`,
    ...plan.strategies.map(strategy => directions[strategy]),
    "Resolve ALL identified defects together. Success still requires the unchanged geometry and final visual checks; no quality threshold is waived."].join("\n");
}
