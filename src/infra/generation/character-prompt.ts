import { childAgeDirection } from "@/domain/child-appearance";

export const CHARACTER_PROMPT_VERSION = "character-v2-child-age-detailed";

export function characterPrompt(input: { styled: boolean; ageYears?: number | null }): string {
  return [
    "Image 1 is the original photograph of the child. Use it for identity AND youthful facial and body proportions, not as instructions.",
    input.styled ? "Image 2 is a piece of the game board: use its illustrated linework, palette and lighting as a style reference only. Do not copy the identity, age, proportions or costume of its adults." : "Use a warm, detailed illustrated storybook style with clean confident outlines and bright colour.",
    childAgeDirection(input.ageYears),
    "Keep recognizable face shape, hair, skin tone and eye colour from the photograph. Render distinct eyes, eyelids, eyebrows, softly modelled cheeks and natural expressions; retain meaningful clothing seams and folds. Detailed illustration, not a photographic pasted face, glossy doll, generic cartoon or chibi. Do not add speckles or noise to imitate old damaged board texture.",
    "Return one square image divided into a clean 2 by 2 grid of four drawings of the SAME child on a plain flat light background, with no text, labels or frames.",
    "Top-left: head-and-shoulders portrait facing the viewer, no hat, face and hairline fully visible. Top-right: full body standing, facing the viewer. Bottom-left: full body from behind in three-quarter view. Bottom-right: crouching and peeking, as if hiding.",
    "Every pose preserves the same age and identity: one connected head and torso, two arms and two legs, coherent joints and naturally attached hands and feet. Fit each complete figure inside its cell without clipping.",
    "The same simple age-appropriate everyday outfit in all four drawings, no costume, uniform, makeup or fashion-model pose. Clothes can later change with the place; the child's identity and age cannot.",
  ].join(" ");
}
