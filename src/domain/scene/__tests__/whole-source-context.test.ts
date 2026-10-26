import { describe, expect, it } from "vitest";
import { SOURCE_PLACEMENT_RELEASE } from "../../../../content/adventures/source-placement-release";
import { assertWholeSourceContextPlan, contextContains, planWholeSourceContext, WHOLE_SOURCE_CONTEXT_HEAD_MARGIN } from "../whole-source-context";

const entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === "greatwall-v12-2")!;
const contract = entry.sourceNeighbors!.contract;
const child = entry.effective.child;

describe("whole source context before a bounded paint", () => {
  it("shows every original head whole while preserving the complete shipping, child and return", () => {
    expect(contract.neighbors.filter(n => !contextContains(contract.crop, n.head))).toHaveLength(3);
    const p = planWholeSourceContext(contract, child);
    expect(p.provider).toEqual({ left: 1237, top: 648, width: 768, height: 1024 });
    expect(p.shipping).toEqual(entry.effective.crop);
    expect(p.child).toEqual(entry.effective.child);
    expect(p.returned).toEqual(entry.effective.returnRect);
    expect(p.shippingInProvider).toEqual({ left: 187, top: 146, width: 512, height: 768 });
    const bounds = { left: 0, top: 0, width: 768, height: 1024 }, m = WHOLE_SOURCE_CONTEXT_HEAD_MARGIN;
    expect(p.providerHeads).toHaveLength(5);
    for (const { head } of p.providerHeads) expect(contextContains(bounds,
      { left: head.left - m, top: head.top - m, width: head.width + 2*m, height: head.height + 2*m })).toBe(true);
    expect(p.providerChild.left + p.provider.left).toBe(child.left + contract.crop.left);
    expect(p.providerChild.top + p.provider.top).toBe(child.top + contract.crop.top);
    expect(p.providerReturn.left + p.provider.left).toBe(contract.returnRect.left + contract.crop.left);
    expect(p.providerReturn.top + p.provider.top).toBe(contract.returnRect.top + contract.crop.top);
    expect(p.provider.width <= 1024 && p.provider.height <= 1024).toBe(true);
  });
  it("does not let neighbor serialization order change a frozen plan", () => {
    const reversed = { ...contract, neighbors: [...contract.neighbors].reverse() };
    expect(planWholeSourceContext(reversed, child)).toEqual(planWholeSourceContext(contract, child));
  });
  it("refuses a forged crop, returned mapping or omitted registered head in an existing plan", () => {
    const p = planWholeSourceContext(contract, child);
    for (const changed of [
      { ...p, provider: { ...p.provider, left: p.provider.left + 3 } },
      { ...p, shippingInProvider: { ...p.shippingInProvider, top: p.shippingInProvider.top - 1 } },
      { ...p, returned: { ...p.returned, width: p.returned.width + 1 } },
      { ...p, providerHeads: p.providerHeads.slice(1) },
      { ...p, source: { ...p.source, sha256: "f".repeat(64) } },
    ]) expect(() => assertWholeSourceContextPlan(changed, contract, child)).toThrow("pinned native mapping changed");
  });
  it("refuses geometry requiring invented source pixels, an enlarged child, or an unbounded context", () => {
    expect(() => planWholeSourceContext(contract, { ...child, left: 0 })).toThrow();
    const distant = { ...contract, neighbors: [...contract.neighbors,
      { sourceId: "source-person-far-away", head: { left: 300, top: 300, width: 100, height: 100 } }] };
    expect(() => planWholeSourceContext(distant, child)).toThrow("cannot fit");
    const edge = { ...contract, neighbors: [...contract.neighbors,
      { sourceId: "source-at-edge", head: { left: 0, top: 200, width: 100, height: 100 } }] };
    expect(() => planWholeSourceContext(edge, child)).toThrow("beyond the board");
  });
  it("cannot borrow the original plan for changed public source or child geometry", () => {
    const p = planWholeSourceContext(contract, child);
    expect(() => assertWholeSourceContextPlan(p, { ...contract, source: { ...contract.source, sha256: "f".repeat(64) } }, child)).toThrow();
    expect(() => assertWholeSourceContextPlan(p, contract, { ...child, left: child.left + 1 })).toThrow();
  });
});
