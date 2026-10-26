import { createHash } from "node:crypto";
import { prepareSourceNeighborContract, sourceNeighborContractSchema, type SourceNeighborContract } from "./local-patch-source-neighbors";
import type { PatchRectangle } from "./local-patch-return-region";

/** A provider view, never permission to paint, change a return, or add an attempt. */
export const WHOLE_SOURCE_CONTEXT_VERSION = "whole-source-context/v1" as const;
export const WHOLE_SOURCE_CONTEXT_RASTER = Object.freeze({ width: 768, height: 1024 });
export const WHOLE_SOURCE_CONTEXT_HEAD_MARGIN = 12;
export type WholeSourceContextPlan = Readonly<{
  version: typeof WHOLE_SOURCE_CONTEXT_VERSION;
  source: SourceNeighborContract["source"];
  boardId: string; hideId: string; sourceNeighborContractSha256: string;
  shipping: PatchRectangle; provider: PatchRectangle; shippingInProvider: PatchRectangle;
  child: PatchRectangle; providerChild: PatchRectangle;
  returned: PatchRectangle; providerReturn: PatchRectangle;
  providerHeads: readonly { sourceId: string; head: PatchRectangle }[];
  sha256: string;
}>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const valid = (r: PatchRectangle) => Object.values(r).every(Number.isSafeInteger)
  && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0;
export const contextContains = (outer: PatchRectangle, inner: PatchRectangle) => inner.left >= outer.left && inner.top >= outer.top
  && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
const offset = (r: PatchRectangle, left: number, top: number): PatchRectangle => ({ ...r, left: r.left + left, top: r.top + top });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Geometry only. The service must authenticate this public source contract and
 * its bytes, and the ordinary purchase boundary still decides all spending. */
export function planWholeSourceContext(value: unknown, child: PatchRectangle): WholeSourceContextPlan {
  const contract = sourceNeighborContractSchema.parse(value);
  const checked = prepareSourceNeighborContract(contract, { boardId: contract.boardId, hideId: contract.hideId,
    source: contract.source, crop: contract.crop, returnRect: contract.returnRect });
  if (!checked.ok) throw Error("WHOLE_SOURCE_CONTEXT: source-neighbor geometry is invalid");
  const sourceBounds = { left: 0, top: 0, width: contract.source.width, height: contract.source.height };
  const localBounds = { left: 0, top: 0, width: contract.crop.width, height: contract.crop.height };
  if (contract.crop.width !== 512 || contract.crop.height !== 768 || !valid(child)
    || !contextContains(localBounds, child) || !contextContains(contract.returnRect, child))
    throw Error("WHOLE_SOURCE_CONTEXT: original shipping, child and return must remain compatible");
  if (contract.neighbors.every(n => contextContains(contract.crop, n.head)))
    throw Error("WHOLE_SOURCE_CONTEXT: no registered head is clipped by the original input");
  const margin = WHOLE_SOURCE_CONTEXT_HEAD_MARGIN;
  const protectedHeads = contract.neighbors.map(n => ({ left: n.head.left - margin, top: n.head.top - margin,
    width: n.head.width + 2 * margin, height: n.head.height + 2 * margin }));
  if (protectedHeads.some(r => !valid(r) || !contextContains(sourceBounds, r)))
    throw Error("WHOLE_SOURCE_CONTEXT: cannot invent source pixels beyond the board");
  const included = [contract.crop, ...protectedHeads];
  const left = Math.min(...included.map(r => r.left)), top = Math.min(...included.map(r => r.top));
  const right = Math.max(...included.map(r => r.left + r.width)), bottom = Math.max(...included.map(r => r.top + r.height));
  const { width, height } = WHOLE_SOURCE_CONTEXT_RASTER;
  if (right - left > width || bottom - top > height || sourceBounds.width < width || sourceBounds.height < height)
    throw Error("WHOLE_SOURCE_CONTEXT: complete source heads cannot fit the finite native context");
  const provider = { left: clamp(Math.floor((left + right - width) / 2), 0, sourceBounds.width - width),
    top: clamp(Math.floor((top + bottom - height) / 2), 0, sourceBounds.height - height), width, height };
  if (included.some(r => !contextContains(provider, r))) throw Error("WHOLE_SOURCE_CONTEXT: native context omits required source pixels");
  const shippingInProvider = offset(contract.crop, -provider.left, -provider.top);
  const body = {
    version: WHOLE_SOURCE_CONTEXT_VERSION, source: { ...contract.source }, boardId: contract.boardId,
    hideId: contract.hideId, sourceNeighborContractSha256: checked.contractSha256,
    shipping: { ...contract.crop }, provider, shippingInProvider,
    child: { ...child }, providerChild: offset(child, shippingInProvider.left, shippingInProvider.top),
    returned: { ...contract.returnRect }, providerReturn: offset(contract.returnRect, shippingInProvider.left, shippingInProvider.top),
    providerHeads: [...contract.neighbors].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)
      .map(n => ({ sourceId: n.sourceId, head: offset(n.head, -provider.left, -provider.top) })),
  };
  return { ...body, sha256: hash(body) };
}

export function assertWholeSourceContextPlan(plan: WholeSourceContextPlan, contract: unknown, child: PatchRectangle): void {
  const expected = planWholeSourceContext(contract, child);
  if (JSON.stringify(plan) !== JSON.stringify(expected)) throw Error("WHOLE_SOURCE_CONTEXT: pinned native mapping changed");
}
