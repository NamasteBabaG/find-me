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
 *  - the two ways to fit her in, because every refusal in the fourth round came
 *    from the painter deciding to erase a neighbour and doing it badly, having
 *    never been told it could simply put her beside them;
 *  - the age clause, because a child of eight came back looking four - the
 *    painter matches whoever is nearest, and on these boards the nearest is
 *    usually a toddler;
 *  - the pose clause, because without one every appearance is the same picture:
 *    a child standing, facing the reader, twenty-seven times.
 */

type PoseWording = {
  /** What her body is doing. */
  readonly instruction: string;
  /** Where she meets the world, for the contact shadow and for the judge. */
  readonly support: string;
};

export const LOCAL_PATCH_POSE_WORDING: Readonly<Record<LocalPatchPose, PoseWording>> = Object.freeze({
  standing: {
    instruction: "She is STANDING, weight on both feet, arms relaxed at her sides or one hand holding the other.",
    support: "both feet on the ground",
  },
  walking: {
    instruction: "She is WALKING, caught mid-stride with one foot forward and the other behind, going the same way as the people around her - not posing for the reader.",
    support: "her leading foot on the ground",
  },
  peeking: {
    instruction: "She is STANDING BEHIND something in front of her and LEANING OUT to look past it, so a good part of her body stays hidden by it. Her head and one shoulder are what a reader finds first.",
    support: "her feet on the ground, wherever they show past what hides her",
  },
  kneeling: {
    instruction: "She is KNEELING on the ground, sitting back on her heels and leaning a little forward, busy with something small in front of her.",
    support: "her knees and shins on the ground",
  },
  crouching: {
    instruction: "She is CROUCHING low on her heels, knees drawn up, elbows resting on her knees or one hand down for balance - the way a child crouches to look at something on the ground.",
    support: "the balls of her feet on the ground",
  },
  "sitting-cross-legged": {
    instruction: "She is SITTING ON THE GROUND with her legs crossed, back straight, hands in her lap or resting on her knees.",
    support: "her crossed legs and seat on the ground",
  },
});

export const LOCAL_PATCH_PROMPT_VERSION = "local-patch-prompt/v5";

export type LocalPatchPromptInput = {
  /** What she is on, in the board's own words: "beach sand", "wet crossing". */
  readonly ground: string;
  readonly pose: LocalPatchPose;
  /** The age the parent stated for the photograph. Never guessed. */
  readonly ageYears?: number | null;
};

export function localPatchPrompt({ ground, pose, ageYears }: LocalPatchPromptInput): string {
  if (ageYears != null && !validChildAge(ageYears)) throw new Error("LOCAL_PATCH: invalid child age");
  const wording = LOCAL_PATCH_POSE_WORDING[pose];
  return [
    "You are given ONE crop from a hand-illustrated children's hidden-object picture, a reference portrait of one child, and a mask.",
    `Redraw this crop with that child added inside the masked area, on the ${ground}.`,
    "",
    "DRAW HER THE WAY THE OTHER CHILDREN IN THIS CROP ARE DRAWN. Copy the drawing, not just the palette:",
    "- faces are simplified painted planes with a visible darker outline around eyes and jaw; no soft photographic gradients on her skin",
    "- hair is painted in grouped clumps with a few drawn strands, never thousands of fine hairs",
    "- eyes are drawn shapes with flat highlights, not rendered glassy eyes",
    "- edges are brush edges; nothing airbrushed, glossy or three-dimensional",
    "- match their level of finish exactly: if their faces are simple at this size, hers is simple too",
    "",
    `POSE. ${wording.instruction}`,
    `Fill the masked area with her in THAT pose - do not stand her up to fill a tall box, and do not shrink her to sit inside a short one.`,
    "",
    "HER AGE.",
    childAgeDirection(ageYears),
    "Judge her height against the children HER OWN AGE standing at that same depth, never against the toddlers - the smallest child near her is not the ruler.",
    "",
    "Dress her for THIS place, the way the other children here are dressed for it.",
    `Where she meets the ground - ${wording.support} - paint the same small dark contact shadow the other children have where they meet the ${ground}. She must read as resting on it, not placed on top of it.`,
    "Light her from the same direction with the same warmth as the people around her.",
    "",
    "THE MASKED AREA IS NOT EMPTY, and it does not have to be. You have two ways to fit her in, and the first is easier:",
    "1. Put her BETWEEN or BEHIND the people and things already there, so that part of her is hidden by whoever is in front of her. A child seen from the chest up behind a stall, or half behind a passer-by, is exactly right.",
    "2. Or take the place of one person there - but then that person must be gone COMPLETELY: never an arm, a leg, a hand, a hat, a bag or a smear left behind, and never a hand still closed around somebody who is no longer there.",
    "",
    "Do NOT add any other person or animal anywhere in the crop - only her.",
    "No part of her may be sliced off by a straight edge that is not an object; being hidden behind something in front of her is fine.",
  ].join("\n");
}
