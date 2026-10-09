import type { VisualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { localPatchBodyContinuityDisposition, parseLocalPatchBodyContinuity } from "../../domain/scene/local-patch-body-continuity";
import type { DUAL_VISUAL_REVIEW_VERSION } from "./visual-review-release";
export type DualReviewStage = { requestKey: string; fingerprint: string; attempt: number;
  policy: VisualReviewPolicy; raw: string | null; model: string | null; finishReason: string | null;
  wireFault: string | null; costMicroUsd: number };
export type DualReviewProof = { version: typeof DUAL_VISUAL_REVIEW_VERSION; hideId: string;
  imageSha256: string; geometrySha256: string; identitySha256: string;
  quality: DualReviewStage; continuity: DualReviewStage | null };

export function readContinuity(raw: string | null, id: string) {
  try {
    const text = raw?.trim();
    const fenced = text?.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i);
    return parseLocalPatchBodyContinuity(JSON.parse(fenced?.[1] ?? text ?? "null"), [id]);
  } catch { return null; }
}

export function visualStageReadable(stage: Pick<DualReviewStage, "policy" | "model" | "wireFault" | "finishReason">) {
  return !stage.wireFault && stage.model === stage.policy.model
    && stage.finishReason === (stage.policy.provider === "anthropic" ? "end_turn" : "stop");
}

export function runtimeContinuityDisposition(cases: ReturnType<typeof readContinuity>) {
  const result = localPatchBodyContinuityDisposition(cases);
  // This runtime case covers the complete context, which must contain the
  // target. "All people absent" cannot corroborate an Opus child-present pass.
  return result === "pass" && cases?.some(item => item.state === "absent" || !item.visibleBody) ? "unresolved" : result;
}
