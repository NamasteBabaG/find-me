import { LOCAL_PATCH_IMAGE_POLICY } from '../../src/infra/generation/openai-local-patch';
import { localPatchPrompt } from '../../src/services/generation/local-patch-prompt';
import type { LocalPatchBoard, LocalPatchHide } from '../../src/domain/scene/local-patch-hides';

/** Owner-authorized candidate-only round. Never an override for the live runner. */
export const TERMINAL_REPAIR = Object.freeze({
  version: 'terminal-v10-target-locked-candidate/v1',
  worldId: 'yuval-terminal-v10-repair-20260928-v1',
  capMicroUsd: 1_000_000,
  snapshotSha256: 'b568d40acce16945b262038c442c345c93ac9bbba8b66c68cb8e400365d9675b',
  targets: ['antarctica', 'giza'] as const,
  policy: LOCAL_PATCH_IMAGE_POLICY,
});

export function repairTarget(board: LocalPatchBoard): LocalPatchHide {
  if (!TERMINAL_REPAIR.targets.some(slug => slug === board.board)) throw Error('Outside authorized repair scope');
  const id = board.board === 'antarctica' ? 'antarctica-v10-3' : 'giza-v10-2';
  const hide = board.hides.find(h => h.id === id);
  if (!hide?.placement || !hide.mask) throw Error('Missing pinned v10 geometry');
  return hide;
}

export function repairPrompt(board: LocalPatchBoard): string {
  const hide = repairTarget(board);
  const lock = board.board === 'antarctica'
    ? 'Edit ONLY the LOWER STANDING purple-coated child at image x=163..334, y=368..745 (512 by 768 coordinates). Keep the replacement head including hair around x=205..290, y=378..463 and feet on the ORIGINAL lower snow at y=720..745. Match the original standing silhouette, not the kneeling child above. The UPPER kneeling purple-coated child at y=80..300 is a DIFFERENT PERSON: preserve that entire person unchanged. Preserve the blue-coated child, tray, hands, photographer and equipment. Do not put the new head near y=160. No climbing, upward relocation, new props or new animals. Winter coat remains purple, hat/hood off for recognizable hair. The child is five, not an adult.'
    : 'This is an INSERTION/PEEKING spot behind the existing pots and foliage, NOT replacement of an existing person. Confine the complete new child silhouette to x=180..360, y=210..510 in this 512 by 768 image. Head and hair completely visible in the upper portion of that box; body naturally occluded by the existing foreground basket/foliage. Do not invent exposed legs reaching below y=510 or new feet near the bottom of the crop. Preserve the crates, jars, woven basket, camel legs and red-turbaned person. The child wears the board\'s practical Egyptian clothing, not the portrait reference outfit. Correct five-year-old proportions and coherent contact/occlusion, no floating head or severed limbs.';
  return localPatchPrompt({ ground: board.ground, pose: hide.pose, ageYears: 5,
    wardrobe: board.wardrobe, placement: hide.placement, mask: hide.mask,
    hideId: hide.id, contentVersion: 10, paintRecipe: 'board-paint-v1' })
    + '\n\nBOUNDED INCIDENT REPAIR, TARGET LOCK (not a new scene): ' + lock
    + '\nKeep the camera, crop dimensions, every border and all unedited scene pixels registered exactly. Preserve all neighboring people. No zoom, reframe, repaint of surroundings, additions or deletions. Copy identity and age from the portrait only; match the local board skin brushwork, light and clothing. No smooth sticker face. Return the entire same 512:768 scene crop, with only this one localized edit.';
}

export function assertRepairReservation(worldId: string, requestKey: string, committed: number, reserve: number) {
  const keys = TERMINAL_REPAIR.targets.flatMap(slug => [`image:${slug}:1`, `review:${slug}:1`]);
  if (worldId !== TERMINAL_REPAIR.worldId || !keys.includes(requestKey)
    || !Number.isSafeInteger(committed) || committed < 0 || !Number.isSafeInteger(reserve) || reserve <= 0
    || reserve > 150_000 || committed + reserve > TERMINAL_REPAIR.capMicroUsd) throw Error('Bounded repair purchase refused');
}
