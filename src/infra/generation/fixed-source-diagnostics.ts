import { z } from "zod";

const errors = ["invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "model_not_found", "permission_denied", "access_denied", "invalid_request_error", "content_policy_violation", "moderation_blocked", "invalid_image", "invalid_value", "unsupported_parameter", "server_error", "unrecognized"] as const;
const types = ["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error", "api_error", "insufficient_quota", "image_generation_error", "unrecognized"] as const;
const reasons = ["transport", "response-not-json", "charge-evidence", "charge-arithmetic", "charge-settlement", "budget-held", "unexpected-quality", "image-data", "image-payload", "image-raster"] as const;
const nonsecretId = z.string().min(1).max(500).refine(s => !/(?:\bsk-[\w-]{8,}|\bbearer\s+\S+|:\/\/|[\r\n])/i.test(s));
const requestId = z.string().regex(/^req[-_][A-Za-z0-9_-]{1,160}$/).refine(s => !/(?:sk-[\w-]{8,}|bearer)/i.test(s));
export const isSafeFixedSourceRequestId = (value: unknown): value is string => requestId.safeParse(value).success;
/** Deliberately no messages, input content, image data, URLs or arbitrary model/error strings. */
export const fixedSourceFailureReceiptSchema = z.object({
  version: z.literal("fixed-source-failure/v1"), worldId: nonsecretId, requestKey: nonsecretId,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), reason: z.enum(reasons), billing: z.enum(["unknown", "settled"]),
  httpStatus: z.number().int().min(100).max(599).nullable(), requestId: requestId.nullable(),
  requestIdStatus: z.enum(["missing", "safe", "invalid"]),
  transport: z.enum(["timeout", "network-or-runtime", "unclassified"]).nullable(),
  jsonStatus: z.enum(["not-read", "invalid", "parsed"]),
  requestedModel: z.literal("gpt-image-2"), requestedQuality: z.enum(["low", "medium"]),
  returnedModel: z.enum(["absent", "expected", "unexpected", "invalid"]),
  usage: z.object({ present: z.boolean(), valid: z.boolean(), inputTokensInvalid: z.boolean(), outputTokensInvalid: z.boolean(),
    detailsInvalid: z.boolean(), textTokensInvalid: z.boolean(), imageTokensInvalid: z.boolean(), totalTokensInvalid: z.boolean(), inconsistentTotals: z.boolean() }).strict(),
  providerErrorCode: z.enum(errors).nullable(), providerErrorType: z.enum(types).nullable(),
}).strict();
export type FixedSourceFailureReceipt = z.infer<typeof fixedSourceFailureReceiptSchema>;
export type FixedSourceFailureSink = (receipt: FixedSourceFailureReceipt) => Promise<void>;
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
/** Projects only whitelisted facts; never copy an arbitrary API response field. */
export function fixedSourceFailureReceipt(input: { worldId: string; requestKey: string; fingerprint: string;
  quality: "low" | "medium"; reason: FixedSourceFailureReceipt["reason"]; billing: FixedSourceFailureReceipt["billing"];
  response?: Pick<Response, "status" | "headers">; json?: unknown; jsonStatus: FixedSourceFailureReceipt["jsonStatus"];
  usageValid?: boolean; transport?: FixedSourceFailureReceipt["transport"] }): FixedSourceFailureReceipt {
  const body = object(input.json), u = object(body?.usage), details = object(u?.input_tokens_details), err = object(body?.error);
  const id = input.response?.headers.get("x-request-id") ?? null;
  const validId = isSafeFixedSourceRequestId(id);
  const inconsistent = !!u && !!details && count(u.input_tokens) && count(u.output_tokens) && count(details.text_tokens) && count(details.image_tokens)
    && (!Number.isSafeInteger((u.input_tokens as number) + (u.output_tokens as number))
      || u.input_tokens !== (details.text_tokens as number) + (details.image_tokens as number)
      || u.total_tokens !== undefined && u.total_tokens !== (u.input_tokens as number) + (u.output_tokens as number));
  const pick = <T extends readonly string[]>(allowed: T, value: unknown): T[number] | null => value === undefined || value === null ? null : typeof value === "string" && allowed.includes(value) ? value : "unrecognized";
  return fixedSourceFailureReceiptSchema.parse({
    version: "fixed-source-failure/v1", worldId: input.worldId, requestKey: input.requestKey, fingerprint: input.fingerprint,
    reason: input.reason, billing: input.billing, httpStatus: input.response?.status ?? null,
    requestId: validId ? id : null, requestIdStatus: id === null ? "missing" : validId ? "safe" : "invalid",
    transport: input.transport ?? null, jsonStatus: input.jsonStatus, requestedModel: "gpt-image-2", requestedQuality: input.quality,
    returnedModel: body?.model === undefined ? "absent" : typeof body.model !== "string" ? "invalid" : body.model === "gpt-image-2" ? "expected" : "unexpected",
    usage: { present: body?.usage !== undefined, valid: input.usageValid === true, inputTokensInvalid: !count(u?.input_tokens),
      outputTokensInvalid: !count(u?.output_tokens) || u?.output_tokens === 0, detailsInvalid: !details,
      textTokensInvalid: !count(details?.text_tokens), imageTokensInvalid: !count(details?.image_tokens),
      totalTokensInvalid: !!u && u.total_tokens !== undefined && !count(u.total_tokens), inconsistentTotals: inconsistent },
    providerErrorCode: pick(errors, err?.code), providerErrorType: pick(types, err?.type),
  });
}
