import { describe, expect, it } from "vitest";
import {
  PROVIDER_ERROR_MESSAGE_MAX, WITHHELD_PROVIDER_ERROR_CODE, backgroundFailureKind, providerErrorCode, recoverableFailureKind, sanitizeProviderError,
  scrubProviderErrorMessage,
} from "../background-provider-error";
import {
  LEAN_REVIEW_RECOVERY, LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE, LEAN_REVIEW_RECOVERY_TERMS, leanFailureAdmission, leanNewWorldRecoveryReceipt,
  parseLeanReviewRecoveryReceipt, permanentProviderFailure,
} from "../lean-review-recovery";

const kind = (code: string | null) => backgroundFailureKind(code === null ? null : { code, message: null });

describe("background-provider-error/v1: what a failed response says, kept safely and classified", () => {
  it("classifies each documented code, and reads a missing or unknown code as unclassified", () => {
    for (const code of ["server_error", "rate_limit_exceeded", "vector_store_timeout"]) expect(kind(code)).toBe("provider-transient");
    for (const code of ["invalid_prompt", "invalid_image", "image_too_large", "image_parse_error", "failed_to_download_image"]) expect(kind(code)).toBe("request-invalid");
    expect(kind("image_content_policy_violation")).toBe("content-policy");
    for (const code of ["insufficient_quota", "billing_hard_limit_reached", "invalid_api_key", "account_deactivated"]) expect(kind(code)).toBe("account");
    expect(kind(null)).toBe("unclassified");
    expect(kind("something_new")).toBe("unclassified");
    expect(["provider-transient", "unclassified"].every(k => recoverableFailureKind(k as never))).toBe(true);
    expect(["request-invalid", "content-policy", "account"].some(k => recoverableFailureKind(k as never))).toBe(false);
  });
  it("keeps one bounded code token, never a sentence, markup or a non-string", () => {
    expect(providerErrorCode(" Server_Error ")).toBe("server_error");
    for (const value of ["two words", "<script>", "", 42, null, { code: "server_error" }]) expect(providerErrorCode(value)).toBeNull();
  });
  it("never keeps a code-shaped credential, token or id: it is withheld, whatever its prefix, case, field or length (Codex QA R2)", () => {
    const syntheticKey = "sk-" + "q".repeat(48);
    const kept = sanitizeProviderError({ code: syntheticKey, message: "Provider reported a failure" });
    expect(kept).toEqual({ code: WITHHELD_PROVIDER_ERROR_CODE, message: "Provider reported a failure" });
    expect(JSON.stringify(kept)).not.toContain("qqqq");
    const shaped = [syntheticKey, `SK-PROJ-${"Q".repeat(40)}`, `sk_live_${"a1".repeat(12)}`, `Pk_Test_${"b2".repeat(12)}`, `rk-${"c".repeat(20)}`,
      `org-${"d3".repeat(10)}`, `sess-${"e".repeat(30)}`, `ghp_${"f4".repeat(18)}`, `xoxb-${"1".repeat(12)}-${"2".repeat(12)}`, `AKIA${"G5".repeat(8)}`,
      `eyJhbGciOi${"x".repeat(12)}.eyJzdWIi${"y".repeat(12)}.${"z".repeat(20)}`, `server_error_${"h".repeat(25)}`, `quota_${"i9".repeat(6)}`,
      "x".repeat(65), `${"word_".repeat(9)}abcd`, "9_lives", "-leading", "trailing-", "double__sep"];
    for (const value of shaped) {
      expect(providerErrorCode(value)).toBe(WITHHELD_PROVIDER_ERROR_CODE);
      // The same through the type fallback, and never copied into the result in any case.
      const fromType = sanitizeProviderError({ type: value, message: null });
      expect(fromType).toEqual({ code: WITHHELD_PROVIDER_ERROR_CODE, message: null });
      expect(JSON.stringify(fromType).toLowerCase()).not.toContain(value.toLowerCase());
    }
    // Documented codes, and ordinary words that merely begin like a prefix, are kept exactly.
    for (const code of ["server_error", "rate_limit_exceeded", "vector_store_timeout", "invalid_prompt", "invalid_base64_image", "unsupported_image_media_type",
      "image_content_policy_violation", "content_filter", "insufficient_quota", "invalid_api_key", "billing_hard_limit_reached", "session_expired",
      "key_not_found", "test_mode_enabled", "tokenization_failed", "organization_mismatch", "rate.limit:exceeded-now"])
      expect(providerErrorCode(code)).toBe(code);
    // The length bound: forty-eight characters are a code; forty-nine are withheld.
    const at48 = `${"alpha_".repeat(7)}abcdef`, at49 = `${at48}g`;
    expect([at48.length, at49.length]).toEqual([48, 49]);
    expect(providerErrorCode(at48)).toBe(at48);
    expect(providerErrorCode(at49)).toBe(WITHHELD_PROVIDER_ERROR_CODE);
    // A code field that is not a token falls back to the type; a withheld code does not, and is never a refusal reason.
    expect(sanitizeProviderError({ code: "two words", type: "rate_limit_exceeded" })).toEqual({ code: "rate_limit_exceeded", message: null });
    expect(sanitizeProviderError({ code: 5, type: syntheticKey })).toEqual({ code: WITHHELD_PROVIDER_ERROR_CODE, message: null });
    expect(kind(WITHHELD_PROVIDER_ERROR_CODE)).toBe("unclassified");
    expect(permanentProviderFailure(syntheticKey)).toBeNull();
  });
  it("names a permanent failure from any recorded code, and nothing else", () => {
    expect(permanentProviderFailure("image_content_policy_violation")).toEqual({ kind: "content-policy", code: "image_content_policy_violation" });
    expect(permanentProviderFailure("content_filter")).toEqual({ kind: "content-policy", code: "content_filter" });
    expect(permanentProviderFailure("Invalid_Image")).toEqual({ kind: "request-invalid", code: "invalid_image" });
    expect(permanentProviderFailure("insufficient_quota")).toEqual({ kind: "account", code: "insufficient_quota" });
    for (const code of ["server_error", "rate_limit_exceeded", "something_new", WITHHELD_PROVIDER_ERROR_CODE, null, undefined, "<b>invalid_image</b>"])
      expect(permanentProviderFailure(code)).toBeNull();
  });
  it("scrubs a message to one short line without secrets, links, addresses, images or invisible characters", () => {
    const invisible = [0x0000, 0x0007, 0x007f, 0x200b, 0x202e, 0x2028, 0x2066, 0xfeff].map(code => String.fromCharCode(code)).join("");
    const raw = `Quota${invisible} reached for sk-live_${"Z".repeat(30)} org-${"Y".repeat(24)}; mail ops@example.test, see https://example.test/a?b=c `
      + `and www.example.test, image data:image/png;base64,${"Q".repeat(300)} token ${"x1".repeat(40)} {"json":true}`;
    const scrubbed = scrubProviderErrorMessage(raw)!;
    expect(scrubbed.length).toBeLessThanOrEqual(PROVIDER_ERROR_MESSAGE_MAX);
    for (const leak of ["sk-live", "ZZZZ", "org-YYYY", "ops@example", "https://", "www.example", "data:", "QQQQ", "x1x1x1x1", "{", "}", ...invisible.split("")])
      expect(scrubbed).not.toContain(leak);
    expect(scrubbed.startsWith("Quota reached for [secret]")).toBe(true);
    expect(scrubProviderErrorMessage(`${"word ".repeat(100)}`)!.endsWith("...")).toBe(true);
    for (const value of [null, 7, "", "   ", "<<>>{}", "1234 5678"]) expect(scrubProviderErrorMessage(value)).toBeNull();
  });
  it("reads an error object only, its code from code or type, and nothing at all when it carries neither", () => {
    expect(sanitizeProviderError({ code: "server_error", message: "The server had an error" })).toEqual({ code: "server_error", message: "The server had an error" });
    expect(sanitizeProviderError({ type: "rate_limit_exceeded" })).toEqual({ code: "rate_limit_exceeded", message: null });
    for (const value of [null, undefined, "server_error", ["server_error"], {}, { code: 5, message: {} }]) expect(sanitizeProviderError(value)).toBeNull();
  });
});

describe("local-patch-lean-review-recovery/v1: which failures continue, within what bound", () => {
  it("continues a transient or unclassified failure until its image's default tier has failed twice", () => {
    for (const errorCode of ["server_error", "rate_limit_exceeded", null, undefined, "something_new"]) {
      expect(leanFailureAdmission({ errorCode, defaultTierFailures: 0 })).toMatchObject({ admit: true });
      expect(leanFailureAdmission({ errorCode, defaultTierFailures: LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE - 1 })).toMatchObject({ admit: true });
      expect(leanFailureAdmission({ errorCode, defaultTierFailures: LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE })).toMatchObject({ admit: false,
        reason: expect.stringContaining(`the provider ended ${LEAN_REVIEW_RECOVERY_DEFAULT_FAILURES_PER_IMAGE} default-tier questions of this role about these pixels failed`) });
    }
    for (const defaultTierFailures of [-1, 1.5, Number.NaN]) expect(leanFailureAdmission({ errorCode: null, defaultTierFailures })).toMatchObject({ admit: false });
  });
  it("never continues a refused request, a flagged image or an account failure, and says exactly which", () => {
    expect(leanFailureAdmission({ errorCode: "invalid_image", defaultTierFailures: 0 })).toEqual({ admit: false, kind: "request-invalid",
      reason: "the provider ended it failed (request-invalid: invalid_image); a request-invalid failure is never asked again automatically" });
    expect(leanFailureAdmission({ errorCode: "image_content_policy_violation", defaultTierFailures: 0 })).toMatchObject({ admit: false, kind: "content-policy" });
    expect(leanFailureAdmission({ errorCode: "insufficient_quota", defaultTierFailures: 0 })).toMatchObject({ admit: false, kind: "account" });
    // A recorded code is read through the same token rule: markup is no code, so it is unclassified, never a pass for a refusal.
    expect(leanFailureAdmission({ errorCode: "<b>invalid_image</b>", defaultTierFailures: 0 })).toMatchObject({ admit: true, kind: "unclassified" });
  });
  it("reads a new world's pin byte for byte and an existing world's only with every binding field bounded", () => {
    const gameId = "game_synthetic";
    expect(parseLeanReviewRecoveryReceipt(leanNewWorldRecoveryReceipt(gameId), gameId)).toEqual(leanNewWorldRecoveryReceipt(gameId));
    expect(parseLeanReviewRecoveryReceipt(leanNewWorldRecoveryReceipt(gameId), "game_other")).toBeNull();
    expect(parseLeanReviewRecoveryReceipt({ ...leanNewWorldRecoveryReceipt(gameId), terms: { ...LEAN_REVIEW_RECOVERY_TERMS, worldLimit: 99 } }, gameId)).toBeNull();
    const existing = { version: LEAN_REVIEW_RECOVERY, gameId, terms: LEAN_REVIEW_RECOVERY_TERMS, mode: "existing-world" as const,
      binding: { worldId: `${gameId}:board-wizard`, jobId: `job_${gameId}`, holdSha256: "a".repeat(64),
        heldRequestKeys: [`self-repair:board:paris:${"b".repeat(64)}`], ledgerSha256: "c".repeat(64) },
      operatorId: "operator-synthetic", planSha256: "d".repeat(64), authorizedAt: "2026-10-20T15:00:00.000Z" };
    expect(parseLeanReviewRecoveryReceipt(existing, gameId)).toEqual(existing);
    const broken: Record<string, unknown>[] = [
      { ...existing, binding: { ...existing.binding, worldId: "game_other:board-wizard" } },
      { ...existing, binding: { ...existing.binding, jobId: "job_other" } },
      { ...existing, binding: { ...existing.binding, heldRequestKeys: [] } },
      { ...existing, binding: { ...existing.binding, heldRequestKeys: [`self-repair:board:paris:${"f".repeat(64)}`, `self-repair:board:paris:${"b".repeat(64)}`] } },
      { ...existing, binding: { ...existing.binding, heldRequestKeys: ["canonical-age:identity:1"] } },
      { ...existing, binding: { ...existing.binding, extra: true } },
      { ...existing, operatorId: "sk-live-synthetic" }, { ...existing, operatorId: "https://example.test" }, { ...existing, operatorId: "" },
      { ...existing, planSha256: "not-a-digest" }, { ...existing, authorizedAt: "20 October" }, { ...existing, extra: 1 },
      { ...existing, mode: "every-world" }, { ...existing, version: "local-patch-lean-review-recovery/v2" },
    ];
    for (const value of broken) expect(parseLeanReviewRecoveryReceipt(value, gameId)).toBeNull();
    for (const value of [null, "receipt", [existing], 5]) expect(parseLeanReviewRecoveryReceipt(value, gameId)).toBeNull();
  });
});
