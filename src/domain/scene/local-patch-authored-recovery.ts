import { createHash } from "node:crypto";
import { z } from "zod";
import { selfRepairDecisionSchema, type SelfRepairDecision } from "./local-patch-self-repair";
import type { AuthoredLocalPatchReturnContract, PatchRectangle } from "./local-patch-return-region";

/** Additive only: every old autonomous-paid-join/v1 recipe remains unchanged. */
export const AUTHORED_RECOVERY_VERSION = "local-patch-authored-recovery/v1" as const;
export const AUTHORED_RECOVERY_COMPOSITION_VERSION = "autonomous-authored-return/v1" as const;
export const AUTHORED_RECOVERY_CONTEXT_VERSION = "authored-recovery-context/v1" as const;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const key = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
const rect = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const authoredRecoveryDiagnosisSchema = z.object({ requestKey: key, operationFingerprint: hex, rawSha256: hex }).strict();
export type AuthoredRecoveryDiagnosis = z.infer<typeof authoredRecoveryDiagnosisSchema>;
export const authoredRecoveryContextSchema = z.object({ version: z.literal(AUTHORED_RECOVERY_CONTEXT_VERSION),
  parentSha256: hex, sourcePngSha256: hex }).strict();
export const authoredRecoverySchema = z.object({ version: z.literal(AUTHORED_RECOVERY_VERSION), parentSha256: hex,
  cycle: z.number().int().positive(), diagnosis: authoredRecoveryDiagnosisSchema,
  source: z.object({ requestKey: key, operationFingerprint: hex, retainedRawSha256: hex, normalizedRawSha256: hex }).strict(),
  sourcePngSha256: hex, crop: rect, returnWindow: rect, protectedCore: rect, faceRect: rect }).strict();
export type AuthoredLocalPatchRecoveryContract = z.infer<typeof authoredRecoverySchema>;
export const authoredRecoveryParentSha256 = (parent: AuthoredLocalPatchReturnContract) =>
  createHash("sha256").update(JSON.stringify(parent)).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const contains = (outer: PatchRectangle, inner: PatchRectangle) => inner.left >= outer.left && inner.top >= outer.top
  && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;

/** The derived contract can shrink the authored region but never move its crop
 * or grow beyond its child/window authority. Source-head and sibling guards
 * are separately checked against the trusted companion by the service. */
export function readAuthoredLocalPatchRecovery(parent: AuthoredLocalPatchReturnContract, value: unknown): AuthoredLocalPatchRecoveryContract {
  const c = authoredRecoverySchema.parse(value);
  if (!parent.sourcePlacement || c.parentSha256 !== authoredRecoveryParentSha256(parent) || !same(c.crop, parent.crop)
    || !contains(parent.child, c.protectedCore) || !contains(parent.local, c.returnWindow))
    throw Error("AUTHORED_RECOVERY: parent, fixed crop or authored envelope changed");
  selfRepairDecisionSchema.parse({ cause: "drawing-defect", explanation: "Validate the complete protected child and face against the closed corrected return.",
    action: "recompose-retained", sourceKey: c.source.requestKey, returnWindow: c.returnWindow, protectedCore: c.protectedCore, faceRect: c.faceRect });
  return c;
}

export function createAuthoredLocalPatchRecovery(input: { parent: AuthoredLocalPatchReturnContract; cycle: number;
  diagnosis: AuthoredRecoveryDiagnosis; source: AuthoredLocalPatchRecoveryContract["source"]; sourcePngSha256: string;
  decision: SelfRepairDecision }): AuthoredLocalPatchRecoveryContract {
  const decision = selfRepairDecisionSchema.parse(input.decision);
  return readAuthoredLocalPatchRecovery(input.parent, { version: AUTHORED_RECOVERY_VERSION,
    parentSha256: authoredRecoveryParentSha256(input.parent), cycle: input.cycle, diagnosis: input.diagnosis, source: input.source,
    sourcePngSha256: input.sourcePngSha256, crop: input.parent.crop, returnWindow: decision.returnWindow,
    protectedCore: decision.protectedCore, faceRect: decision.faceRect });
}

/** Exact existing six-pixel feather arithmetic. No source or protected-child
 * pixel is inferred or segmented, and no paid operation is performed here. */
export function authoredRecoveryAlpha(c: Pick<AuthoredLocalPatchRecoveryContract, "returnWindow">): Uint8Array {
  const alpha = new Uint8Array(512 * 768), r = c.returnWindow;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) alpha[y * 512 + x] = Math.round(255 * Math.min(1,
    Math.max(0, Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y) / 6)));
  return alpha;
}
