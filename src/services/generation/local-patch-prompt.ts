import { childAgeDirection, validChildAge } from "../../domain/child-appearance";
import type { LocalPatchPose } from "../../domain/scene/local-patch-hides";

/**
 * What the painter is told when a child is painted into one crop of a board.
 *
 * This lives in the product rather than in a script because it is the other
 * expensive thing the rounds bought. Every clause in it is here because a paid
 * render went wrong without it:
 *
 *  - the drawing clauses, because the first results were photographic faces
 *    pasted into a painting;
 *  - the two ways to fit the child in, because every refusal in the fourth round came
 *    from the painter deciding to erase a neighbour and doing it badly, having
 *    never been told it could simply put the child beside them;
 *  - the age clause, because a child of eight came back looking four - the
 *    painter matches whoever is nearest, and on these boards the nearest is
 *    usually a toddler;
 *  - the pose clause, because without one every appearance is the same picture:
 *    a child standing, facing the reader, twenty-seven times.
 */

type PoseWording = {
  /** What the child's body is doing. */
  readonly instruction: string;
  /** Where the child meets the world, for the contact shadow and for the judge. */
  readonly support: string;
};

export const LOCAL_PATCH_POSE_WORDING: Readonly<Record<LocalPatchPose, PoseWording>> = Object.freeze({
  standing: {
    instruction: "The child is STANDING, weight on both feet, arms relaxed at their sides or one hand holding the other.",
    support: "both feet on the ground",
  },
  walking: {
    instruction: "The child is WALKING, caught mid-stride with one foot forward and the other behind, going the same way as the people around them - not posing for the reader.",
    support: "their leading foot on the ground",
  },
  peeking: {
    instruction: "The child is STANDING BEHIND something in front of them and LEANING OUT to look past it, so a good part of their body stays hidden by it. Their head and one shoulder are what a reader finds first.",
    support: "their feet on the ground, wherever they show past what hides the child",
  },
  kneeling: {
    instruction: "The child is KNEELING on the ground, sitting back on their heels and leaning a little forward, busy with something small in front of them.",
    support: "their knees and shins on the ground",
  },
  crouching: {
    instruction: "The child is CROUCHING low on their heels, knees drawn up, elbows resting on their knees or one hand down for balance - the way a child crouches to look at something on the ground.",
    support: "the balls of their feet on the ground",
  },
  "sitting-cross-legged": {
    instruction: "The child is SITTING ON THE GROUND with their legs crossed, back straight, hands in their lap or resting on their knees.",
    support: "their crossed legs and seat on the ground",
  },
});

export const LOCAL_PATCH_PROMPT_VERSION = "local-patch-prompt/v6";

const REPAIR_DIRECTIONS = {
  styleMatch: "Use the reference ONLY for recognizable identity. Repaint the face, hair and clothes with the SAME simplified brushwork, line thickness, matte shading and local saturation as nearby board people. Do not preserve photographic skin detail or a bright photographic shirt. Scene illustration overrides reference rendering and outfit texture.",
  scaleRight: "Size the head and body for the stated age at this exact ground depth using surrounding people and objects. The mask is a maximum editable boundary, NOT a box to fill. Leave empty space when needed; do not enlarge the child to fill it.",
  childPresent: "Make the recognizable reference child clearly visible inside the designated area; do not merely redraw the background.",
  childOnlyOnce: "Show the reference child exactly once. Do not add duplicates elsewhere in the crop.",
  childComplete: "Draw a complete plausible body under any natural occluder. Do not crop limbs or the head at the patch edge.",
  pictureWhole: "Keep the scene coherent at every edge. If replacing someone, remove that person completely, with no orphaned limbs or clothing.",
  groundContact: "Place the child on a real support at the correct depth and paint the local contact shadow wherever contact is visible.",
} as const;
export type LocalPatchRepairCheck = keyof typeof REPAIR_DIRECTIONS;

/** Only known check codes enter the prompt, never arbitrary model prose. */
export function localPatchRepairChecks(judgeJson: string | null): LocalPatchRepairCheck[] {
  try {
    const value = JSON.parse(judgeJson ?? "null");
    const verdict = value?.verdict;
    return (Object.keys(REPAIR_DIRECTIONS) as LocalPatchRepairCheck[]).filter(check =>
      verdict?.[check] === "fail" || (Array.isArray(verdict?.faults) && verdict.faults.some((fault: { check?: string }) => fault?.check === check)));
  } catch { return []; }
}

export type LocalPatchPromptInput = {
  /** What the child is on, in the board's own words: "beach sand", "wet crossing". */
  readonly ground: string;
  readonly pose: LocalPatchPose;
  /** The age the parent stated for the photograph. Never guessed. */
  readonly ageYears?: number | null;
  readonly repairChecks?: readonly LocalPatchRepairCheck[];
};

export function localPatchPrompt({ ground, pose, ageYears, repairChecks }: LocalPatchPromptInput): string {
  if (ageYears != null && !validChildAge(ageYears)) throw new Error("LOCAL_PATCH: invalid child age");
  const wording = LOCAL_PATCH_POSE_WORDING[pose];
  return [
    "You are given ONE crop from a hand-illustrated children's hidden-object picture, a reference portrait of one child, and a mask.",
    `Redraw this crop with that child added inside the masked area, on the ${ground}.`,
    "",
    "DRAW THE CHILD THE WAY THE OTHER CHILDREN IN THIS CROP ARE DRAWN. Copy the drawing, not just the palette:",
    "- faces are simplified painted planes with a visible darker outline around eyes and jaw; no soft photographic gradients on the child's skin",
    "- hair is painted in grouped clumps with a few drawn strands, never thousands of fine hairs",
    "- eyes are drawn shapes with flat highlights, not rendered glassy eyes",
    "- edges are brush edges; nothing airbrushed, glossy or three-dimensional",
    "- match the other children's level of finish exactly: if their faces are simple at this size, the reference child's face is simple too",
    "",
    `POSE. ${wording.instruction}`,
    "Fill the masked area with the child in THAT pose - do not stand them up to fill a tall box, and do not shrink them to sit inside a short one.",
    "",
    "THE CHILD'S AGE.",
    childAgeDirection(ageYears),
    "Judge the child's height against children of THEIR OWN AGE standing at that same depth, never against the toddlers - the smallest child nearby is not the ruler.",
    "",
    "Preserve the reference child's presentation, hairstyle and outfit cues. Dress the child in age-appropriate everyday child clothing suited to THIS place, not adult fashions, mature styling or makeup. Do not infer gender from a name.",
    `Where the child meets the ground - ${wording.support} - paint the same small dark contact shadow the other children have where they meet the ${ground}. The child must read as resting on it, not placed on top of it.`,
    "Light the child from the same direction with the same warmth as the people around them.",
    "",
    "THE MASKED AREA IS NOT EMPTY, and it does not have to be. You have two ways to fit the child in, and the first is easier:",
    "1. Put the child BETWEEN or BEHIND the people and things already there, so that part of the child is hidden by whoever is in front of them. A child seen from the chest up behind a stall, or half behind a passer-by, is exactly right.",
    "2. Or take the place of one person there - but then that person must be gone COMPLETELY: never an arm, a leg, a hand, a hat, a bag or a smear left behind, and never a hand still closed around somebody who is no longer there.",
    "",
    "Do NOT add any other person or animal anywhere in the crop - only the reference child.",
    "No part of the child may be sliced off by a straight edge that is not an object; being hidden behind something in front of them is fine.",
    ...(repairChecks === undefined ? [] : ["", "FINAL REPAIR PASS v1. The previous attempt was not approved. Correct the following without changing the child's identity, stated age, position or requested pose:",
      ...(repairChecks.length ? repairChecks : ["styleMatch", "scaleRight"] as const).map(check => REPAIR_DIRECTIONS[check])]),
  ].join("\n");
}
