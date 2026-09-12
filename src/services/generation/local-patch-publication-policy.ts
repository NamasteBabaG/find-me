import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { isLocalPatchAdvisoryVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import { localPatchQualityDisposition } from "./local-patch-judge";

export const LOCAL_PATCH_PUBLICATION_POLICY = "publish-with-visual-warnings/v1";
export const LOCAL_PATCH_STRICT_PUBLICATION_POLICY = "publish-with-severe-quality-guard/v2";
export const LOCAL_PATCH_PUBLICATION_ACTION = "local-patch:published-by-policy";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const localPatchPublicationGeometryHash = (row: { rectJson: string | null; hitRectJson: string | null; headAnchorJson: string | null }) =>
  digest(JSON.stringify([row.rectJson, row.hitRectJson, row.headAnchorJson]));
export type LocalPatchPublicationBinding = {
  gameId: string; sceneVersion: number; hideId: string; variantId: string; attempts: number;
  identityAssetId: string; identitySha256: string; assetId: string; imageSha256: string;
  geometrySha256: string; judgeJson: string | null;
};
const idOf = (input: LocalPatchPublicationBinding) => `aud_lpp_${digest(JSON.stringify([input.gameId, input.variantId, input.attempts, input.imageSha256,
  ...(isLocalPatchStrictVersion(input.sceneVersion) ? [digest(input.judgeJson ?? "")] : [])])).slice(0, 32)}`;
const recordOf = (input: LocalPatchPublicationBinding) => ({
  policy: isLocalPatchStrictVersion(input.sceneVersion) ? LOCAL_PATCH_STRICT_PUBLICATION_POLICY : LOCAL_PATCH_PUBLICATION_POLICY,
  decision: "allowed-by-policy", gameId: input.gameId,
  sceneVersion: input.sceneVersion, hideId: input.hideId, variantId: input.variantId, attempts: input.attempts,
  identityAssetId: input.identityAssetId, identitySha256: input.identitySha256,
  assetId: input.assetId, imageSha256: input.imageSha256, geometrySha256: input.geometrySha256,
  judgeSha256: digest(input.judgeJson ?? ""),
});

function allowed(input: LocalPatchPublicationBinding): boolean {
  if (!isLocalPatchAdvisoryVersion(input.sceneVersion)) return false;
  if (!isLocalPatchStrictVersion(input.sceneVersion)) return true;
  try {
    const receipt = JSON.parse(input.judgeJson ?? "null");
    return receipt?.reviewState === "board-review-complete" && receipt.wireFault === null
      && receipt?.boardReview?.version === "local-patch-board-five-quality/v2"
      && localPatchQualityDisposition(receipt.verdict).state === "acceptable";
  } catch { return false; }
}

/** Written with the target, not minted later by the assembler. No visual pass or human decision is invented. */
export async function recordLocalPatchPublicationPolicy(tx: Prisma.TransactionClient, input: LocalPatchPublicationBinding) {
  if (!allowed(input)) throw new Error("Unsupported or unresolved local-patch publication quality policy");
  const id = idOf(input), metaJson = JSON.stringify(recordOf(input));
  const row = await tx.auditLog.upsert({ where: { id }, update: {}, create: {
    id, actorType: "SYSTEM", action: LOCAL_PATCH_PUBLICATION_ACTION, entityType: "Game", entityId: input.gameId, metaJson,
  } });
  if (row.actorType !== "SYSTEM" || row.action !== LOCAL_PATCH_PUBLICATION_ACTION || row.entityId !== input.gameId || row.metaJson !== metaJson) {
    throw new Error("Local-patch publication binding changed during replay");
  }
}

export async function hasLocalPatchPublicationPolicy(c: Pick<Container, "db">, input: LocalPatchPublicationBinding) {
  if (!allowed(input)) return false;
  const row = await c.db.auditLog.findUnique({ where: { id: idOf(input) } });
  return !!row && row.actorType === "SYSTEM" && row.actorId === null && row.action === LOCAL_PATCH_PUBLICATION_ACTION
    && row.entityType === "Game" && row.entityId === input.gameId && row.metaJson === JSON.stringify(recordOf(input));
}
