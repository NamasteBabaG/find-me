/**
 * What a background review response says about its own failure, kept safely, and what kind of failure it is.
 * Pure: no HTTP or DB.
 *
 * A Responses object that fails carries `error: { code, message }`. The documented codes (openai SDK 5.20.0,
 * `ResponseError.code`) are listed below. The transport keeps only the code and a short scrubbed message: never the body,
 * an image, a header, a key, a token or a URL. A code is kept only in the documented shape (lower-case words); one that is
 * code-shaped but could be a credential, a token or an id is never kept: it is recorded as `withheld` and read as
 * unclassified. A code outside the documented list in that shape is kept and read as unclassified. A response cut short by
 * the provider's content filter (`incomplete`, `content_filter`) is a content-policy failure.
 *
 * The kind decides recovery (`local-patch-review-interruption/v3`), for every terminal failure, priced or not:
 *  - `provider-transient`: the provider could not finish (`server_error`, `rate_limit_exceeded`, `vector_store_timeout`).
 *    The same pixels may be asked again, at the default tier after a Flex failure.
 *  - `unclassified`: no code, or one this list does not know (every round recorded before 20 October 2026 keeps no code).
 *    Recovered like a transient failure, within the same bounds, because nothing says the request itself was wrong.
 *  - `request-invalid`: the request itself was refused (the prompt or an image). The same request fails the same way:
 *    never asked again automatically.
 *  - `content-policy`: an image was flagged. Never asked again automatically.
 *  - `account`: quota, billing, credentials or permission. Never a retry loop; every later request would fail too.
 */
export const BACKGROUND_PROVIDER_ERROR_VERSION = "background-provider-error/v1" as const;

export type BackgroundProviderError = { readonly code: string | null; readonly message: string | null };
export type BackgroundFailureKind = "provider-transient" | "unclassified" | "request-invalid" | "content-policy" | "account";

const TRANSIENT: ReadonlySet<string> = new Set(["server_error", "rate_limit_exceeded", "vector_store_timeout"]);
const REQUEST_INVALID: ReadonlySet<string> = new Set(["invalid_prompt", "invalid_image", "invalid_image_format", "invalid_base64_image",
  "invalid_image_url", "image_too_large", "image_too_small", "image_parse_error", "invalid_image_mode", "image_file_too_large",
  "unsupported_image_media_type", "empty_image_file", "failed_to_download_image", "image_file_not_found"]);
/** `content_filter`: the reason an `incomplete` response names when the provider's filter stopped it. */
const CONTENT_POLICY: ReadonlySet<string> = new Set(["image_content_policy_violation", "content_filter"]);
/** Not documented for a failed response, but never a reason to ask again if one ever arrives. */
const ACCOUNT = /quota|billing|api_key|credential|auth|permission|account/;

/** One token of `[a-z0-9_.:-]`: anything else (a sentence, markup, a non-string) is no code at all. */
const TOKEN = /^[a-z0-9_.:-]+$/;
/** The documented shape: lower-case words joined by `_`, `.`, `:` or `-`. Every documented code is under 32 characters. */
const CODE = /^[a-z][a-z0-9]*(?:[_.:-][a-z0-9]+)*$/;
export const PROVIDER_ERROR_CODE_MAX = 48;
/** What is recorded instead of a code-shaped string that could be a credential, a token or an id. */
export const WITHHELD_PROVIDER_ERROR_CODE = "withheld";
/** A credential or token prefix followed by its secret part, at the start or after a separator: `sk-…`, `sk_live_…`,
 * `org-…`, `ghp_…`, `xoxb-…`, `AKIA…`, a JWT. Short prefixes need their separator, so ordinary words never match. */
const CREDENTIAL = /(?:^|[_.:-])(?:(?:sk|pk|rk|ak|sess|org|proj|key|tok|token|secret|bearer|pat|live|test)[_.:-]|(?:akia|asia|eyj|ghp|gho|ghu|ghs|ghr|glpat|xox[a-z]|whsec)[_.:-]?)[a-z0-9]{8,}/;
/** Whether a token could be a secret or an identifier rather than a code: a credential prefix, more than the longest code,
 * a word longer than any code's, or a long word with digits in it (an id, a key, a random run). */
function credentialShaped(token: string): boolean {
  return token.length > PROVIDER_ERROR_CODE_MAX || CREDENTIAL.test(token)
    || token.split(/[_.:-]/).some(word => word.length > 24 || word.length >= 12 && /[0-9]/.test(word));
}
const range = (from: number, to: number) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
/** Control, zero-width, bidirectional-override and line/paragraph separator characters, built from code points so this
 * source stays ASCII. */
const INVISIBLE = new RegExp(`[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2060, 0x206f)}${range(0xfeff, 0xfeff)}]`, "g");
/** The longest message kept: enough to tell two failures apart, never a payload. */
export const PROVIDER_ERROR_MESSAGE_MAX = 160;

/**
 * A provider's error code as it may be kept and copied into an outcome, a reason or a log: lower case, in the documented
 * shape, bounded. A token that could be a credential, a token or an id, or is not in that shape, is `withheld` (read as
 * unclassified); anything that is not one token is no code at all.
 */
export function providerErrorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (!token || !TOKEN.test(token)) return null;
  return credentialShaped(token) || !CODE.test(token) ? WITHHELD_PROVIDER_ERROR_CODE : token;
}

/**
 * A provider's error message as it may be kept: one line, no URL, data URI, e-mail address or long token-like run (a key,
 * a base64 image, an id), at most `PROVIDER_ERROR_MESSAGE_MAX` characters. Null when nothing readable is left.
 */
export function scrubProviderErrorMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const scrubbed = value
    .replace(INVISIBLE, " ")
    .replace(/data:[^\s"'<>]*/gi, "[data]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/gi, "[url]")
    .replace(/\bwww\.[^\s"'<>]+/gi, "[url]")
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|rk|org|proj|sess|key|tok)[-_][A-Za-z0-9_-]{6,}/g, "[secret]")
    .replace(/[A-Za-z0-9+/=_-]{32,}/g, "[redacted]")
    .replace(/[<>`{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!scrubbed || !/[a-z]/i.test(scrubbed)) return null;
  return scrubbed.length > PROVIDER_ERROR_MESSAGE_MAX ? `${scrubbed.slice(0, PROVIDER_ERROR_MESSAGE_MAX - 3).trimEnd()}...` : scrubbed;
}

/** The safe form of a response's `error` field, or null when it carries neither a code nor a readable message. */
export function sanitizeProviderError(value: unknown): BackgroundProviderError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const code = providerErrorCode(record.code) ?? providerErrorCode(record.type);
  const message = scrubProviderErrorMessage(record.message);
  return code === null && message === null ? null : { code, message };
}

/** The kind of a terminal failure, from its kept error (or the absence of one). */
export function backgroundFailureKind(error: BackgroundProviderError | null | undefined): BackgroundFailureKind {
  const code = error?.code ?? null;
  if (code === null) return "unclassified";
  if (TRANSIENT.has(code)) return "provider-transient";
  if (REQUEST_INVALID.has(code)) return "request-invalid";
  if (CONTENT_POLICY.has(code)) return "content-policy";
  if (ACCOUNT.test(code)) return "account";
  return "unclassified";
}

/** Whether a failure of this kind may be asked again automatically on the same pixels. */
export const recoverableFailureKind = (kind: BackgroundFailureKind) => kind === "provider-transient" || kind === "unclassified";
