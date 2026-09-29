import { describe, expect, it } from "vitest";
import { localPatchBoardsForVersion } from "../local-patch-catalog";
import { interruptedLocalPatchImageRequest } from "../local-patch-image-request";
import { validateUnknownContinuationApproval } from "../../../services/generation/world-budget";

describe("the recovery and accounting validators accept the same authored placements", () => {
  it.each(localPatchBoardsForVersion(12).flatMap(board => board.hides))("supports $id with catalog pose $pose", hide => {
    const key = `${hide.id}:${hide.pose}:render:1`;
    expect(interruptedLocalPatchImageRequest(key)?.hide).toEqual(hide);
    expect(() => validateUnknownContinuationApproval({ version: "world-automatic-image-recovery/v1", worldId: "world",
      approvalId: "bounded-image-recovery", requestKey: key, scope: "image", operationFingerprint: "fingerprint",
      reserveMicroUsd: 120_000, unknownReasons: ["missing transport response"], policyId: "local-patch-image-interruption/v1",
      authorizationSha256: "a".repeat(64), authorizedAt: "2026-09-29T12:00:00.000Z" })).not.toThrow();
  });
  it.each(["amazon-v12-3:standing:render:1", "paris-v12-1:seated:render:1", "tokyo-v12-2:crouching:render:3",
    "invented-v12-1:standing:render:1", "tokyo-v11-2:crouching:render:1"])("rejects a changed catalog binding: %s", key => {
    expect(interruptedLocalPatchImageRequest(key)).toBeNull();
  });
});
