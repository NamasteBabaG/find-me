import sharp from 'sharp';
import { planTargetCenteredContext, type LocalPatchContextPlan } from '../../domain/scene/local-patch-context-plan';
import { composeBoundedLocalPatch, LOCAL_PATCH_RETURN_GUARD } from './local-patch-seam';

/** Register world coordinates without resizing or moving any generated figure. */
export async function composeReframedLocalPatch(boardPng: Buffer, providerPng: Buffer, plan: LocalPatchContextPlan) {
  const boardMeta = await sharp(boardPng).metadata(), patchMeta = await sharp(providerPng).metadata();
  const expected = planTargetCenteredContext(plan.shipping, plan.target,
    { width: boardMeta.width!, height: boardMeta.height! }, LOCAL_PATCH_RETURN_GUARD);
  if (JSON.stringify(plan) !== JSON.stringify(expected)
    || patchMeta.width !== plan.provider.width || patchMeta.height !== plan.provider.height)
    throw Error('Reframed patch geometry does not match its pinned plan');
  const r = plan.returnBounds;
  const generatedReturn = await sharp(providerPng).extract({ ...r,
    left: r.left - plan.provider.left, top: r.top - plan.provider.top }).png().toBuffer();
  const registered = await sharp(boardPng).extract(plan.shipping).composite([{ input: generatedReturn,
    left: r.left - plan.shipping.left, top: r.top - plan.shipping.top }]).png().toBuffer();
  // Use precisely the original crop, target, guard and seam policy.
  return composeBoundedLocalPatch(boardPng, plan.shipping, registered, plan.target);
}
