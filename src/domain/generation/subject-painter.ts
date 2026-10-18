import type { LocalPatchPose } from "../scene/local-patch-hides";
import { validChildAge } from "../child-appearance";
import { SUBJECT_POLICY_V2, subjectRenderDirection, type SubjectCheck, type SubjectPlan, type SubjectRepairCodeV2 } from "./subject-policy";

/** New purchases only. The enrolled v1 plan, judge and historical bytes stay fixed. */
export const SUBJECT_PAINTER_V2 = "local-patch-subject-paint/v2" as const;
/** The painter of local-patch-subject/v2 (18 October 2026): the plan is a suggestion for variety,
 * the photograph's face and hair and the stated age are the requirement. New purchases only. */
export const SUBJECT_PAINTER_V3 = "local-patch-subject-paint/v3" as const;
export type SubjectPainterVersion = typeof SUBJECT_PAINTER_V2 | typeof SUBJECT_PAINTER_V3;
/** The recipe of both painters lets the subject direction, not the support pose, speak for the arms, head and face. */
export const isPlanLedPainter = (version: string | undefined): version is SubjectPainterVersion =>
  version === SUBJECT_PAINTER_V2 || version === SUBJECT_PAINTER_V3;
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
/** v3's support: the authored support is required; the rest of the pose is the subject direction's natural choice. */
export const subjectSupportPoseV3 = (pose: LocalPatchPose) => SUPPORT_POSE[pose]
  + " Arms, hands, head, gaze and expression follow the SUBJECT DIRECTION: a natural pose for this moment in the scene.";

export function subjectRenderDirectionV2(plan: SubjectPlan, ageYears: number, repairCodes: readonly SubjectCheck[] = []): string {
  return subjectRenderDirection(plan, ageYears, repairCodes)
    + `\nPAINTER ${SUBJECT_PAINTER_V2}: keep the authored support, depth and safe envelope. The plan's hand gesture is a natural posture; it does not require a new prop or change the planned gaze. Preserve the face's identity while changing the gesture, head and expression.`
    + (repairCodes.includes("plannedAction") ? `\nACTION REPAIR: visibly draw ${plan.action}. Arms hanging at both sides do not satisfy a different planned gesture.` : "")
    + (repairCodes.includes("plannedHead") ? `\nHEAD REPAIR: ${plan.head}; ${plan.gaze}.` : "")
    + (repairCodes.includes("plannedExpression") ? `\nEXPRESSION REPAIR: ${plan.expression}; do not reuse the portrait smile.` : "");
}

/** What the reviewer located, quoted as evidence for the repaint: printable text only, bounded. */
export function locatedDefects(faults: readonly { readonly check: string; readonly where: string }[], codes: readonly string[]): string[] {
  return faults.filter(fault => codes.includes(fault.check))
    .map(fault => `${fault.check}: ${fault.where.replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}`)
    .filter(line => line.length > 12).slice(0, 4);
}

/**
 * What a v3 painter is told about one appearance. Fixed wording for the requirement (the face and the
 * hair of the photograph and the canonical portrait, the stated age, the hat); the plan only as a
 * natural option for variety. A repair names its fixed codes and quotes the defects the reviewer
 * located on the refused painting, so the painter corrects what was actually wrong.
 */
export function subjectRenderDirectionV3(plan: SubjectPlan, ageYears: number,
  repair: { readonly codes: readonly SubjectRepairCodeV2[]; readonly located: readonly string[] } = { codes: [], located: [] }): string {
  if (!validChildAge(ageYears)) throw Error("SUBJECT_PLAN: a confirmed age is required");
  const lines = [`SUBJECT DIRECTION ${SUBJECT_PAINTER_V3} (${SUBJECT_POLICY_V2}) for ${plan.hideId}.`,
    "WHO: the child of the original photograph, the same face as the canonical illustrated portrait: eye shape and spacing, nose, mouth, jaw, cheeks and hairline. Keep the canonical HAIR exactly: its length, fringe, layers and the strands over the ears and down the neck, in its own colour. Never crop, shorten, tidy or restyle the hair.",
    `AGE: the child is exactly ${ageYears} years old. A child's face for that age (rounder cheeks, shorter nose, larger eyes relative to the face, soft jaw) and a body of that age; never older, never a teenager or adult proportions.`,
    `POSE: a natural pose for this moment in the scene, keeping the authored support and safe placement. One natural option, for variety: ${plan.action}; head ${plan.head}; ${plan.gaze}; expression ${plan.expression}. Relaxed arms at the sides are fine. Prefer a child taking part in the scene to a copy of the portrait facing the viewer.`,
    "Draw in the board's own illustration style and light; the photograph controls likeness and age only, never pose, clothing, texture or lighting."];
  if (plan.warmHat) lines.push("WARM HAT REQUIRED: a real fitted warm knit winter hat covering the crown and the top of the hair, with the visible face (eyes, nose, mouth, cheeks, chin) clear and recognisable at its angle. The hat never covers the eyes.");
  const codes = [...new Set(repair.codes)];
  if (codes.length) {
    lines.push(`REPAIR: the previous painting of this appearance was refused for ${codes.join(", ")}. Correct exactly that and keep every other requirement.`);
    if (codes.includes("collectionVariety")) lines.push(`VARIETY REPAIR: this world already shows the refused painting's look on a third of its appearances. Use the suggested head (${plan.head}) and expression (${plan.expression}), engaged with the scene.`);
    if (codes.includes("perceivedAge")) lines.push(`AGE REPAIR: the refused painting looked older than ${ageYears}; draw a clearly younger face and body.`);
    for (const line of repair.located) lines.push(`The reviewer located on the refused painting: "${line}"`);
  }
  return lines.join(" ");
}
