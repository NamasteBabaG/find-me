import type { LocalPatchPose } from "../scene/local-patch-hides";
import { subjectRenderDirection, type SubjectCheck, type SubjectPlan } from "./subject-policy";

/** New purchases only. The enrolled v1 plan, judge and historical bytes stay fixed. */
export const SUBJECT_PAINTER_V2 = "local-patch-subject-paint/v2" as const;
const SUPPORT_POSE: Readonly<Record<LocalPatchPose, string>> = Object.freeze({
  standing: "The child is STANDING with weight on both feet.",
  walking: "The child is WALKING mid-stride, one foot ahead and the other behind.",
  peeking: "The child is STANDING BEHIND cover and leaning out while keeping the authored occlusion.",
  kneeling: "The child is KNEELING with knees and shins supported on the authored ground.",
  crouching: "The child is CROUCHING with both feet supporting the lowered body.",
  "sitting-cross-legged": "The child is SITTING with crossed legs and seat on the authored ground.",
});
/** The recipe supplies support; the subject plan alone supplies hands, head and expression. */
export const subjectSupportPose = (pose: LocalPatchPose) => SUPPORT_POSE[pose]
  + " Follow the SUBJECT PLAN for every visible arm, hand, head, gaze and expression.";

export function subjectRenderDirectionV2(plan: SubjectPlan, ageYears: number, repairCodes: readonly SubjectCheck[] = []): string {
  return subjectRenderDirection(plan, ageYears, repairCodes)
    + `\nPAINTER ${SUBJECT_PAINTER_V2}: keep the authored support, depth and safe envelope. The plan's hand gesture is a natural posture; it does not require a new prop or change the planned gaze. Preserve the face's identity while changing the gesture, head and expression.`
    + (repairCodes.includes("plannedAction") ? `\nACTION REPAIR: visibly draw ${plan.action}. Arms hanging at both sides do not satisfy a different planned gesture.` : "")
    + (repairCodes.includes("plannedHead") ? `\nHEAD REPAIR: ${plan.head}; ${plan.gaze}.` : "")
    + (repairCodes.includes("plannedExpression") ? `\nEXPRESSION REPAIR: ${plan.expression}; do not reuse the portrait smile.` : "");
}
