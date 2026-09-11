import { describe, expect, it } from "vitest";
import { BOARD_JUDGE_MODEL } from "../../../infra/generation/board-verdict";
import { IDENTITY_GATE_ACTION, identityApprovedForDisplay } from "../board-wizard-identity-gate";
import type { Container } from "../../container";

/**
 * "The file is saved" and "the drawing was approved" are different facts.
 *
 * The creation screen was reading the first: the character appeared the moment
 * its asset went READY, before the style review had run, and stayed on the page
 * after a review that refused it. The first character a parent sees is meant to
 * be their child already drawn in the language of the boards.
 */

const sha = (c: string) => c.repeat(64);
const profile = { identityAssetId: "ast_identity", originalPhotoAssetId: "ast_photo", ageYears: 8 };

const receipt = (over: Record<string, unknown> = {}) => JSON.stringify({
  version: "board-wizard-identity-style-sol-high/v1", fingerprint: sha("f"),
  identityAssetId: "ast_identity", sheetSha256: sha("a"),
  provenance: {
    promptVersion: "character-v3-board-matched-matte", quality: "medium",
    photoAssetId: "ast_photo", photoSha256: sha("b"), crop: { x: 0, y: 0, w: 1, h: 1 }, ageYears: 8,
    style: { version: "board-matched-identity/v1", catalogSha256: sha("c"), atlasSha256: sha("d") },
  },
  imageHashes: [sha("1"), sha("2"), sha("3")],
  approved: true, checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" },
  reason: "Drawn like the people on the boards.", requestId: "req-1", costMicroUsd: 400, usage: { total_tokens: 10 },
  model: BOARD_JUDGE_MODEL, effort: "high", prompt: "…",
  ...over,
});

const container = (metaJson: string | null) => ({
  db: { auditLog: { findFirst: async ({ where }: { where: { action: string; entityId: string } }) =>
    where.action === IDENTITY_GATE_ACTION && metaJson ? { metaJson } : null } },
} as unknown as Container);

describe("whether the character may be shown to the parent yet", () => {
  it("shows it once the style review has passed on this very child", async () => {
    expect(await identityApprovedForDisplay(container(receipt()), profile)).toBe(true);
  });

  it("does not show a character nobody has reviewed", async () => {
    expect(await identityApprovedForDisplay(container(null), profile)).toBe(false);
    expect(await identityApprovedForDisplay(container(receipt()), { ...profile, identityAssetId: null })).toBe(false);
  });

  it("does not keep showing one the review refused", async () => {
    expect(await identityApprovedForDisplay(container(receipt({ approved: false })), profile)).toBe(false);
    for (const failing of [
      { identity: "fail", age: "pass", paintedStyle: "pass", sheetLayout: "pass" },
      // A photographic face beside painted people is exactly what this gate is for.
      { identity: "pass", age: "pass", paintedStyle: "fail", sheetLayout: "pass" },
      // Uncertain is not an approval.
      { identity: "pass", age: "pass", paintedStyle: "uncertain", sheetLayout: "pass" },
    ]) {
      expect(await identityApprovedForDisplay(container(receipt({ checks: failing })), profile)).toBe(false);
    }
    expect(await identityApprovedForDisplay(container(receipt({ checks: null })), profile)).toBe(false);
  });

  it("does not let one child's approval show another child, another photo or another age", async () => {
    const approved = container(receipt());
    expect(await identityApprovedForDisplay(approved, { ...profile, identityAssetId: "ast_someone_else" })).toBe(false);
    expect(await identityApprovedForDisplay(approved, { ...profile, originalPhotoAssetId: "ast_new_photo" })).toBe(false);
    expect(await identityApprovedForDisplay(approved, { ...profile, ageYears: 4 })).toBe(false);
  });

  it("treats a receipt it cannot read as no approval at all", async () => {
    expect(await identityApprovedForDisplay(container('{"approved":true}'), profile)).toBe(false);
  });
});
