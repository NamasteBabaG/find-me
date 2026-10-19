import type { LocalPatchPose } from "../scene/local-patch-hides";
import { validChildAge } from "../child-appearance";
import { SUBJECT_POLICY_V2, subjectRenderDirection, type SubjectCheck, type SubjectPlan, type SubjectRepairCodeV2 } from "./subject-policy";

/** New purchases only. The enrolled v1 plan, judge and historical bytes stay fixed. */
export const SUBJECT_PAINTER_V2 = "local-patch-subject-paint/v2" as const;
/** The painter of local-patch-subject/v2 (18 October 2026): the plan is a suggestion for variety,
 * the photograph's face and hair and the stated age are the requirement. New purchases only. */
export const SUBJECT_PAINTER_V3 = "local-patch-subject-paint/v3" as const;
/** A lean world's painter (local-patch-lean/v1, 19 October 2026): v3's requirement, and the appearance's planned
 * look as the look to draw, so the world is varied by its plan rather than by refusals; the judge still never
 * requires it (local-patch-subject/v2). New purchases in lean worlds only. */
export const SUBJECT_PAINTER_V4 = "local-patch-subject-paint/v4" as const;
export type SubjectPainterVersion = typeof SUBJECT_PAINTER_V2 | typeof SUBJECT_PAINTER_V3 | typeof SUBJECT_PAINTER_V4;
/** The recipe of every plan-led painter lets the subject direction, not the support pose, speak for the arms, head and face. */
export const isPlanLedPainter = (version: string | undefined): version is SubjectPainterVersion =>
  version === SUBJECT_PAINTER_V2 || version === SUBJECT_PAINTER_V3 || version === SUBJECT_PAINTER_V4;
/** The Antarctica hat as experiment E6a painted it 3 of 3 at the first painting (content v13's wardrobe lead,
 * 15 October): pushed back, with the face, eyebrows, hairline and hair at the brim visible. */
export const LEAN_WARM_HAT_VERSION = "lean-warm-hat/v1" as const;
export const LEAN_WARM_HAT_WARDROBE = "Insulated polar coat with its hood down behind the neck, gloves, snow trousers and boots in the board's own colours, and a warm knitted winter hat in a board colour worn pushed back off the forehead. The whole face, both eyebrows, the hairline and the canonical hair at the brim and sides stay visible; the hat never covers the eyes or forehead and never replaces the hair.";
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
/** v4's support: the authored support is required; head, gaze and expression are the planned look, arms and hands natural. */
export const subjectSupportPoseV4 = (pose: LocalPatchPose) => SUPPORT_POSE[pose]
  + " Head, gaze and expression follow the SUBJECT DIRECTION's planned look; arms and hands are natural for this moment in the scene.";

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

/**
 * What a lean world's painter (v4) is told about one appearance: v3's fixed requirement (the photograph's face
 * and hair, the stated age), the plan's look as THE look to draw (each appearance of the world has its own, so
 * the collection is varied by design), the pushed-back winter hat where the board needs one, and, for a
 * repainting, the refused codes and the defects the reviewer located.
 */
export function subjectRenderDirectionV4(plan: SubjectPlan, ageYears: number,
  repair: { readonly codes: readonly SubjectRepairCodeV2[]; readonly located: readonly string[] } = { codes: [], located: [] }): string {
  if (!validChildAge(ageYears)) throw Error("SUBJECT_PLAN: a confirmed age is required");
  const lines = [`SUBJECT DIRECTION ${SUBJECT_PAINTER_V4} (${SUBJECT_POLICY_V2}) for ${plan.hideId}.`,
    "WHO: the child of the original photograph, the same face as the canonical illustrated portrait: eye shape and spacing, nose, mouth, jaw, cheeks and hairline. Keep the canonical HAIR exactly: its length, fringe, layers and the strands over the ears and down the neck, in its own colour. Never crop, shorten, tidy or restyle the hair.",
    `AGE: the child is exactly ${ageYears} years old. A child's face for that age (rounder cheeks, shorter nose, larger eyes relative to the face, soft jaw) and a body of that age; never older, never a teenager or adult proportions.`,
    `LOOK: this appearance's own planned look, so the world's appearances differ from one another: head ${plan.head}; ${plan.gaze}; expression ${plan.expression}; ${plan.action}. The child takes part in the scene, doing or watching something in it, never facing the viewer like the portrait. Keep the authored support and safe placement.`,
    "Draw in the board's own illustration style and light; the photograph controls likeness and age only, never pose, clothing, texture or lighting."];
  if (plan.warmHat) lines.push(`WARM HAT (${LEAN_WARM_HAT_VERSION}): a warm knitted winter hat worn pushed back off the forehead. The whole face, both eyebrows, the hairline and the canonical hair at the brim and sides stay visible; the hat never covers the eyes or forehead and never replaces the hair.`);
  const codes = [...new Set(repair.codes)];
  if (codes.length) {
    lines.push(`REPAIR: the previous painting of this appearance was refused for ${codes.join(", ")}. Correct exactly that and keep every other requirement.`);
    if (codes.includes("collectionVariety")) lines.push("VARIETY REPAIR: the refused painting repeated a look this world already shows on a third of its appearances. Draw exactly the planned look above.");
    if (codes.includes("perceivedAge")) lines.push(`AGE REPAIR: the refused painting looked older than ${ageYears}; draw a clearly younger face and body.`);
    if (codes.includes("requiredWardrobe")) lines.push("HAT REPAIR: the refused painting had no clear warm hat; paint the pushed-back knitted hat above, with the face and hairline visible.");
    for (const line of repair.located) lines.push(`The reviewer located on the refused painting: "${line}"`);
  }
  return lines.join(" ");
}
