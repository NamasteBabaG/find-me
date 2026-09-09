import { z } from "zod";
import type { BoardPoseObservationReceipt } from "./board-pose-observer";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const scopeId = z.string().regex(/^[A-Za-z0-9_:.\/-]{1,240}$/).refine(s => !s.includes("://") && !/^sk-/i.test(s));
const requestId = z.string().regex(/^req[-_][A-Za-z0-9_-]{1,160}$/).refine(s => !/(?:sk-[\w-]{8,}|bearer)/i.test(s));
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Private diagnostic metadata, not a measurement, charge receipt or retry permission.
 * Never retain arbitrary provider/error text, headers, prompts, URLs or image data. */
export const boardObserverFailureSchema = z.object({
  version: z.literal("board-observer-failure/v1"), worldId: scopeId, requestKey: scopeId,
  fingerprint: sha, sourceImageSha256: sha, sourceRgbaSha256: sha, wireImageSha256: sha, promptSha256: sha,
  stage: z.enum(["request", "response-body", "response-json", "response-envelope", "charge-evidence", "price", "charge-settlement", "budget-held"]),
  failure: z.enum(["timeout", "network-or-runtime", "body-read", "invalid-json", "invalid-envelope", "invalid-charge", "unknown-price", "settlement-unconfirmed", "budget-held"]),
  elapsedMs: count.max(3_600_000), billing: z.enum(["unknown", "settled"]),
  httpStatus: z.number().int().min(100).max(599).nullable(), requestId: requestId.nullable(),
  requestIdStatus: z.enum(["missing", "safe", "invalid"]),
  requestedModel: z.literal("gpt-5.6-sol"), effort: z.literal("high"),
  returnedModel: z.enum(["absent", "expected", "unexpected"]),
  usage: z.object({ promptTokens: count.nullable(), completionTokens: count.nullable(), totalTokens: count.nullable() }).strict(),
}).strict();
export type BoardObserverFailure = z.infer<typeof boardObserverFailureSchema>;

export function boardObserverFailure(input: { worldId: string; requestKey: string; receipt: BoardPoseObservationReceipt;
  stage: BoardObserverFailure["stage"]; failure: BoardObserverFailure["failure"]; elapsedMs: number }): BoardObserverFailure {
  const r = input.receipt, safeRequest = requestId.safeParse(r.requestId), token = (n: unknown) => count.safeParse(n).success ? n as number : null;
  return boardObserverFailureSchema.parse({
    version: "board-observer-failure/v1", worldId: input.worldId, requestKey: input.requestKey,
    fingerprint: r.fingerprint, sourceImageSha256: r.sourceImageSha256, sourceRgbaSha256: r.sourceRgbaSha256,
    wireImageSha256: r.wireImageSha256, promptSha256: r.promptSha256, stage: input.stage, failure: input.failure,
    elapsedMs: Math.min(3_600_000, Math.max(0, Math.round(input.elapsedMs))), billing: r.costUnknown ? "unknown" : "settled",
    httpStatus: Number.isInteger(r.httpStatus) && r.httpStatus! >= 100 && r.httpStatus! <= 599 ? r.httpStatus : null,
    requestId: safeRequest.success ? safeRequest.data : null, requestIdStatus: r.requestId === null ? "missing" : safeRequest.success ? "safe" : "invalid",
    requestedModel: "gpt-5.6-sol", effort: "high", returnedModel: r.modelReturned === null ? "absent" : r.modelReturned === "gpt-5.6-sol" ? "expected" : "unexpected",
    usage: { promptTokens: token(r.rawUsage?.prompt_tokens), completionTokens: token(r.rawUsage?.completion_tokens), totalTokens: token(r.rawUsage?.total_tokens) },
  });
}
