import { isCollectionVersion } from "./local-patch-versions";
import { z } from "zod";

/** A visual refusal is work for the engine, never a parent's approval task. */
export const SELF_REPAIR_VERSION = "local-patch-self-repair/v1";
export const SELF_REPAIR_COMPOSITION_VERSION = "autonomous-paid-join/v1";
export const selfRepairEnabled = (contentVersion: number) => isCollectionVersion(contentVersion);
const rect = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export type RecoveryRect = z.infer<typeof rect>;
const contains = (outer: RecoveryRect, inner: RecoveryRect, guard = 0) => inner.left - guard >= outer.left
  && inner.top - guard >= outer.top && inner.left + inner.width + guard <= outer.left + outer.width
  && inner.top + inner.height + guard <= outer.top + outer.height;
export const selfRepairDecisionSchema = z.object({
  cause: z.enum(["composition-clipping", "background-registration", "wrong-identity", "age-or-scale", "unreadable-evidence", "drawing-defect", "paint-style", "portrait-lighting", "neighbor-damage"]),
  // Explanatory prose never drives the renderer. Retain a bounded summary rather
  // than discarding a valid structural plan for a verbose diagnostic sentence.
  explanation: z.string().trim().min(12).max(2400).transform(text => text.slice(0, 800)),
  action: z.enum(["recompose-retained", "redraw-with-new-placement", "restyle-retained"]),
  sourceKey: z.string().min(1).max(240),
  returnWindow: rect, protectedCore: rect, faceRect: rect,
}).strict().superRefine((p, ctx) => {
  if (p.action === "restyle-retained" && p.cause !== "paint-style" && p.cause !== "portrait-lighting")
    ctx.addIssue({ code: "custom", message: "Surface repair cannot correct anatomy, identity or neighbouring people" });
  if (!contains({ left: 1, top: 1, width: 510, height: 766 }, p.returnWindow)
    || !contains(p.returnWindow, p.protectedCore, 18) || !contains(p.protectedCore, p.faceRect)
    || p.faceRect.width < 30 || p.faceRect.height < 30) ctx.addIssue({ code: "custom",
    message: "The whole child, face and 18px unblended guard must fit inside a closed 512x768 return" });
});
export type SelfRepairDecision = z.infer<typeof selfRepairDecisionSchema>;
/** No model prose becomes an image prompt. Only this closed set of causes does. */
export function selfRepairRenderInstructions(plan: SelfRepairDecision): string {
  const reasons: Record<SelfRepairDecision["cause"], string> = {
    "composition-clipping": "Keep the complete head, hair and all naturally visible limbs inside the corrected envelope. No orphaned feet or remnants of a replaced bystander.",
    "background-registration": "Preserve the exact original positions of every background edge, support, neighbour and border. Paint a smaller local intervention; no camera shift, zoom or background reconstruction.",
    "wrong-identity": "Rebuild the face from the canonical portrait: match facial proportions, eye spacing, jaw, hairline and hair silhouette. Do not substitute a generic child or a nearby person's face.",
    "age-or-scale": "Establish the stated age and scene depth with youthful shoulders, torso, limbs and hands before facial detail. Do not fill the maximum envelope with an oversized body.",
    "unreadable-evidence": "Make the complete canonical face and enough naturally visible shoulder/body evidence clear at native scale. Keep natural hiding and the stated age.",
    "drawing-defect": "Reconstruct the entire visible child as one coherent figure, with the correct pose and support; remove partial limbs and preserve surrounding people.",
    "paint-style": "Change the rendering approach: draw the child's face with the board's visible ink-like contours and a few clearly separated flat matte light/shadow shapes. Draw eyes, nose and lips as economical illustrated marks. Group curls into broad dark locks with sparse painted accents, not individual strands. Retain the specific facial geometry and hair shape. Do not copy the portrait's smooth skin gradients, detailed eyes or photographic hair. This is a complete painted reconstruction of the same child, not a photo with a texture overlay.",
    "portrait-lighting": "Rebuild the child's illumination from the original scene: use the same shadow shapes and subdued highlights as people at the same depth. Remove frontal portrait fill, rim glow and isolated bright eyes. Keep natural skin colour and the recognizable facial geometry.",
    "neighbor-damage": "Redraw only the target in a corrected envelope that leaves neighbouring people whole. Restore the original foreground heads, necks, shoulders and hands at their exact coordinates. Keep the child behind those silhouettes. Never paint half of a neighbour or introduce a second face at the return boundary.",
  };
  return `AUTONOMOUS RECOVERY ${SELF_REPAIR_VERSION}. The previous approach failed; use this corrected placement.\n`
    + `Maximum child envelope in the original 512x768 crop: ${JSON.stringify(plan.protectedCore)}. `
    + `Complete face and hair region: ${JSON.stringify(plan.faceRect)}. Return boundary: ${JSON.stringify(plan.returnWindow)}.\n`
    + reasons[plan.cause] + "\nDo not change the canonical identity, pose, authored depth or support. Preserve background outside the corrected placement. Final visual review is still required.";
}
export function selfRepairRecipe(plan: SelfRepairDecision): string {
  // Different explanatory prose is not a different approach.
  return JSON.stringify([plan.action, plan.action === "recompose-retained" ? plan.sourceKey : plan.action === "restyle-retained" ? [plan.sourceKey, plan.cause] : plan.cause,
    plan.returnWindow, plan.protectedCore, plan.faceRect]);
}
export function needsSelfRepair(row: { status: string; attempts: number; lastError?: string | null } | undefined): boolean {
  return !!row && row.status === "FAILED" && (row.attempts >= 2 || !!row.lastError?.startsWith("quality-unresolved:"));
}
