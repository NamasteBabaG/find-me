/** A different provider view is not permission to change the shipping rectangle. */
export type ContextRect = Readonly<{ left: number; top: number; width: number; height: number }>;
export type LocalPatchContextPlan = Readonly<{
  version: 'target-centered-context/v1'; shipping: ContextRect; provider: ContextRect;
  target: ContextRect; providerTarget: ContextRect; returnBounds: ContextRect;
}>;
const valid = (r: ContextRect) => Object.values(r).every(Number.isSafeInteger)
  && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0;
const contains = (a: ContextRect, b: ContextRect) => b.left >= a.left && b.top >= a.top
  && b.left + b.width <= a.left + a.width && b.top + b.height <= a.top + a.height;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function planTargetCenteredContext(shipping: ContextRect, target: ContextRect,
  board: Readonly<{ width: number; height: number }>, guard = 120): LocalPatchContextPlan {
  const bounds = { left: 0, top: 0, ...board };
  if (!valid(shipping) || !valid(target) || !valid(bounds) || !Number.isSafeInteger(guard) || guard <= 0
    || !contains(bounds, shipping) || !contains({ left: 0, top: 0, width: shipping.width, height: shipping.height }, target))
    throw Error('Invalid context geometry');
  const worldTarget = { ...target, left: shipping.left + target.left, top: shipping.top + target.top };
  const left = Math.max(shipping.left, worldTarget.left - guard), top = Math.max(shipping.top, worldTarget.top - guard);
  const returnBounds = { left, top,
    width: Math.min(shipping.left + shipping.width, worldTarget.left + target.width + guard) - left,
    height: Math.min(shipping.top + shipping.height, worldTarget.top + target.height + guard) - top };
  // Keep the complete ORIGINAL return visible; never expand it to the new context.
  const provider = { ...shipping,
    top: clamp(Math.round(worldTarget.top + target.height / 2 - shipping.height / 2),
      Math.max(0, shipping.top - guard, returnBounds.top + returnBounds.height - shipping.height),
      Math.min(board.height - shipping.height, shipping.top + guard, returnBounds.top)),
  };
  if (!contains(provider, returnBounds)) throw Error('Provider must contain the original return');
  return { version: 'target-centered-context/v1', shipping, provider, target, returnBounds,
    providerTarget: { ...target, left: worldTarget.left - provider.left, top: worldTarget.top - provider.top } };
}
