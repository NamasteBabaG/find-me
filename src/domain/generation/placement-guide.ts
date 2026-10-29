import { z } from "zod";
import { guidedFrameDirections, type GuideRect } from "./guided-frame-recovery";

/** A prospective painting recipe, not an extra attempt or an art approval. */
export const PLACEMENT_GUIDE_VERSION = "local-patch-placement-guide/v1" as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const placementGuideSchema = z.object({
  version: z.literal(PLACEMENT_GUIDE_VERSION), hideId: z.string().min(1), attempt: z.number().int().min(1).max(3),
  sceneVersion: z.union([z.literal(12), z.literal(13)]), sourceSha256: digest, geometrySha256: digest,
  reviewAuthorizationSha256: digest,
}).strict();
export type PlacementGuide = z.infer<typeof placementGuideSchema>;

export function placementGuideOf(judgeJson: string | null): PlacementGuide | null {
  const receipt = JSON.parse(judgeJson ?? "null");
  if (receipt?.placementGuide === undefined) return null;
  return placementGuideSchema.parse(receipt.placementGuide);
}

export function placementGuideDirections(child: GuideRect, returned: GuideRect): string {
  return guidedFrameDirections(child, returned)
    .replace("single-low-guided-frame-recovery/v1", PLACEMENT_GUIDE_VERSION)
    .replace("The LAST reference is a marked copy of this SAME original 512x768 crop, used for position only.",
      "The LAST reference has TWO panels. LEFT is a marked copy of this SAME original 512x768 crop; all local coordinates apply ONLY to LEFT. RIGHT is scaled ORIGINAL SOURCE CONTEXT showing the crop and people continuing outside it. Both panels are references only.")
    + " In RIGHT, white outlines the input crop, orange the fixed returned area, cyan the whole-target frame and magenta registered original heads. Follow each person's visible body across the orange/white boundaries in the ORIGINAL context. Preserve its continuous fragment at the exact original position; never erase its torso while its original head survives outside the crop. Do not paint the right panel, markers, or a two-panel layout into the final image. Return ONLY the edited unmarked 512x768 original crop.";
}
