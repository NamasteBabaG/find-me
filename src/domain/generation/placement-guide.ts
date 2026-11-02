import { z } from "zod";
import { guidedFrameDirections, guidedFrameGeometry, type GuideRect } from "./guided-frame-recovery";
import { LOCAL_PATCH_RETURN_FEATHER } from "../scene/local-patch-return-region";

/** A prospective painting recipe, not an extra attempt or an art approval. */
export const PLACEMENT_GUIDE_VERSION = "local-patch-placement-guide/v1" as const;
/** One frame and a protected seam band. v1 showed the painter a second, wider
 * panel (one Tokyo return came back in that wider framing) and opened the very
 * band the seam check later demands back unchanged. Persisted v1 pins keep v1. */
export const PLACEMENT_GUIDE_V2_VERSION = "local-patch-placement-guide/v2" as const;
export type PlacementGuideVersion = typeof PLACEMENT_GUIDE_VERSION | typeof PLACEMENT_GUIDE_V2_VERSION;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const placementGuideSchema = z.object({
  version: z.union([z.literal(PLACEMENT_GUIDE_VERSION), z.literal(PLACEMENT_GUIDE_V2_VERSION)]), hideId: z.string().min(1), attempt: z.number().int().min(1).max(3),
  sceneVersion: z.union([z.literal(12), z.literal(13)]), sourceSha256: digest, geometrySha256: digest,
  reviewAuthorizationSha256: digest,
}).strict();
export type PlacementGuide = z.infer<typeof placementGuideSchema>;

export function placementGuideOf(judgeJson: string | null): PlacementGuide | null {
  const receipt = JSON.parse(judgeJson ?? "null");
  if (receipt?.placementGuide === undefined) return null;
  return placementGuideSchema.parse(receipt.placementGuide);
}

/** The v2 editor opening: the return window minus the band the seam check reads
 * (`SEAM_LIMITS.bandPx`). The authored child is already that far inside it. */
export function placementGuideEditableRect(child: GuideRect, returned: GuideRect): GuideRect {
  const band = LOCAL_PATCH_RETURN_FEATHER, g = guidedFrameGeometry(child, returned);
  const open = { left: returned.left + band, top: returned.top + band, width: returned.width - 2 * band, height: returned.height - 2 * band };
  if (open.width <= 0 || open.height <= 0 || child.left < open.left || child.top < open.top
    || child.left + child.width > open.left + open.width || child.top + child.height > open.top + open.height
    || g.target.left < open.left || g.target.top < open.top
    || g.target.left + g.target.width > open.left + open.width || g.target.top + g.target.height > open.top + open.height)
    throw Error("PLACEMENT_GUIDE: the authored child must clear the protected seam band");
  return open;
}

export function placementGuideDirections(child: GuideRect, returned: GuideRect, version: PlacementGuideVersion = PLACEMENT_GUIDE_VERSION): string {
  if (version === PLACEMENT_GUIDE_V2_VERSION) return placementGuideV2Directions(child, returned);
  return guidedFrameDirections(child, returned)
    .replace("single-low-guided-frame-recovery/v1", PLACEMENT_GUIDE_VERSION)
    .replace("The LAST reference is a marked copy of this SAME original 512x768 crop, used for position only.",
      "The LAST reference has TWO panels. LEFT is a marked copy of this SAME original 512x768 crop; all local coordinates apply ONLY to LEFT. RIGHT is scaled ORIGINAL SOURCE CONTEXT showing the crop and people continuing outside it. Both panels are references only.")
    + " In RIGHT, white outlines the input crop, orange the fixed returned area, cyan the whole-target frame and magenta registered original heads. Follow each person's visible body across the orange/white boundaries in the ORIGINAL context. Preserve its continuous fragment at the exact original position; never erase its torso while its original head survives outside the crop. Do not paint the right panel, markers, or a two-panel layout into the final image. Return ONLY the edited unmarked 512x768 original crop.";
}

function placementGuideV2Directions(child: GuideRect, returned: GuideRect): string {
  const g = guidedFrameGeometry(child, returned), open = placementGuideEditableRect(child, returned);
  return "GEOMETRY GUIDE " + PLACEMENT_GUIDE_V2_VERSION + ". The LAST reference is a marked copy of this SAME original 512x768 crop at the SAME scale and framing, used for position only. Edit the FIRST original image and keep its exact camera, scale and framing: never zoom out, widen, shift, mirror or recompose the scene. "
    + "Orange marks the fixed return window " + JSON.stringify(g.returned) + ". The editor mask opens only " + JSON.stringify(open) + ": the " + LOCAL_PATCH_RETURN_FEATHER + "-pixel band just inside orange and everything outside orange are protected original pixels and must come back unchanged, so scenery and people crossing that band continue exactly where they are. "
    + "Cyan marks the safe whole-target frame " + JSON.stringify(g.target) + ". Draw the complete visible crown, hair/hat, head, torso and naturally visible limbs INSIDE cyan. Preserve the stated age and proportions, pose, depth, support and natural occlusion; do not make the child younger to fit. The whole cyan frame is a maximum, not an instruction to fill it. "
    // Registrations can include the authored target itself (Tokyo hide 3), so they name comparison people, not people to keep.
    + "Magenta outlines registered source heads for comparison, including the original authored TARGET when registered; these boxes are not a required final person count. Replace the authored TARGET WHOLE with the canonical child, leaving no original face, body or limb remnant. For the other registered people follow the SOURCE-BOUND placement data: a person wholly covered by the opaque return may be coherently removed or replaced WHOLE where allowed, while a person continuing outside the return window or input crop keeps the exact original coordinates and intact visible fragments. Never erase or move only part of a person. "
    + "People continuing outside orange or outside the crop must remain whole at their original coordinates. No guide colour, text, outline, box or marker may appear in the final art. Never crop a head to fit the frame; paint it at the correct location. Return ONLY the edited unmarked 512x768 original crop.";
}
