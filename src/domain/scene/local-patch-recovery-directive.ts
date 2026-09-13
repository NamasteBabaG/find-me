/** Fixed, site-specific instructions for an explicitly authorised extra attempt.
 * Selecting a directive is NOT spending authority: the caller must first verify
 * the immutable extra-attempt grant. Never accept operator/model prompt prose. */
export const LOCAL_PATCH_RECOVERY_DIRECTIVE_VERSION = "local-patch-site-recovery/v1";

export type LocalPatchRecoveryDirective =
  | "amazon-peek-age-evidence-v1"
  | "sydney-rock-registration-v1"
  | "greatwall-parapet-registration-v1";

const DIRECTIVE_BY_HIDE: Readonly<Record<string, LocalPatchRecoveryDirective>> = Object.freeze({
  "amazon-v7-5": "amazon-peek-age-evidence-v1",
  "sydney-v7-5": "sydney-rock-registration-v1",
  "greatwall-v7-5": "greatwall-parapet-registration-v1",
});

export function localPatchRecoveryDirectiveForHide(hideId: string): LocalPatchRecoveryDirective | null {
  return Object.hasOwn(DIRECTIVE_BY_HIDE, hideId) ? DIRECTIVE_BY_HIDE[hideId]! : null;
}

const DIRECTIONS: Readonly<Record<LocalPatchRecoveryDirective, string>> = Object.freeze({
  "amazon-peek-age-evidence-v1": [
    "REASON: a head alone among broad leaves does not provide enough visible body evidence to assess the stated age and local scale; this is not a request for a new face.",
    "At this SAME foliage opening, lean out enough to show the neck, BOTH small preschool shoulders, a short youthful upper torso and one small forearm/hand through the existing gaps. Keep the lower torso and legs naturally concealed by the foliage. Override the generic head-and-one-shoulder peek with this visible upper-body evidence, not a standing foreground figure.",
    "Keep the exact canonical face and hair, natural head-to-body proportions and authored depth/head scale. Do not enlarge the head, move towards the reader, remove the surrounding leaf masses, change the nearby basket-carrying child or cover the capybara below. Draw only in the existing mask; retain the current wardrobe and canopy light.",
  ].join("\n"),
  "sydney-rock-registration-v1": [
    "REASON: the previous background was displaced near the fixed return boundary. Correct registration, not the canonical child's identity or the acceptance threshold.",
    "Keep the slanted surfboard outline, the surfer to the LEFT, the front rock rim, rock cracks and the water/rock colour boundaries at their EXACT Image 1 coordinates. Do not translate, tilt, rescale, smooth away or relight these anchors, even by a few pixels. Reproduce the untouched surrounding pixels rather than redrawing the crop as a new scene.",
    "Place the SAME canonical child peeking through the existing opening BEHIND the rock shelf's front rim. The rim naturally conceals the lower body; keep the full face and hair inside the editable area, at the authored depth and scale. Preserve every existing visitor, including the yellow-hatted child by the rocks. Do NOT replace any bystander or borrow the surfer's body. Keep the existing mask and support; add no new ledge or enlarged opening.",
  ].join("\n"),
  "greatwall-parapet-registration-v1": [
    "REASON: the previous background was displaced near the fixed return boundary. Correct registration, not the canonical child's identity or the acceptance threshold.",
    "Keep the parapet cap, horizontal stone courses, mortar joints, walkway edges and adjacent visitors at their EXACT Image 1 coordinates. Do not translate, tilt, rescale, smooth away or relight these anchors, even by a few pixels. Reproduce the untouched surrounding pixels rather than redrawing the crop as a new scene.",
    "Fit the SAME canonical child behind the existing parapet in the authored gap; retain its occlusion and support. Preserve the nearby yellow-clothed visitor and grey-clothed visitor completely, including their heads, torsos, arms and clothing. Do NOT replace any bystander or paint the child's head onto another person's body. Show the complete canonical head and natural youthful shoulder/body proportions inside the unchanged mask; no new wall, wider gap or foreground move.",
  ].join("\n"),
});

/** Runtime validation also rejects unknown codes supplied through untyped JSON. */
export function resolveLocalPatchRecoveryDirective(hideId: string, directive: LocalPatchRecoveryDirective): string {
  if (localPatchRecoveryDirectiveForHide(hideId) !== directive || !Object.hasOwn(DIRECTIONS, directive)) {
    throw new Error("LOCAL_PATCH: recovery directive does not match the authored hide");
  }
  return `SITE RECOVERY ${LOCAL_PATCH_RECOVERY_DIRECTIVE_VERSION}: ${directive}\n${DIRECTIONS[directive]}`;
}
