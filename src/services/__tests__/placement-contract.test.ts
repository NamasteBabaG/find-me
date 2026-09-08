import { describe, expect, it } from "vitest";
import { CONTRACT_HEIGHT_MAX, childProblem, contractPx, shapeContract, type PatchResult, type SlotPoint } from "../generation/patch";
import { validateSceneDefinition } from "@/domain/scene/schema";
import { sceneBySlug } from "../scene-catalog.service";

/**
 * The placement contract holds a render to the board's own people. The
 * numbers are game 2's (8 September 2026), measured on the boards: what the
 * neighbours stand, what came back, and what a parent said about it.
 */
const ART = { width: 3072, height: 2048 };

function render(slot: SlotPoint, painted: { width: number; height: number; centerX: number; centerY: number }, largest = Math.round(painted.width * painted.height * 0.6)): PatchResult {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  const contract = shapeContract(slot, ART);
  return {
    webp: Buffer.alloc(0), width: 0, height: 0,
    geometry: { rect: zero, hitRect: zero, anchor: { x: 0, y: 0 } },
    largest, painted: largest, expected: largest, basis: "matte",
    shape: { ...painted, childPx: Math.round(slot.scale * ART.height), slotX: slot.x * ART.width, slotY: slot.y * ART.height, visible: contract ? contract.visiblePx / contract.standingPx : 1, ...(contract ? { contract } : {}) },
  };
}

// antarctica/sledge: a seated child beside the boy on the next sledge; the boy stands ~390 px.
const SLEDGE: SlotPoint = { x: 0.6167, y: 0.8895, scale: 0.19, layer: "front", placement: { pose: "seated", contract: { standingHeight: 0.19, visibleFraction: 0.78, supportPoint: { x: 0.6167, y: 0.93 }, comparators: "the boy on the next sledge" } } };
// giza/stones: a head and shoulders over the block; a child stands ~287 px there.
const STONES: SlotPoint = { x: 0.6185, y: 0.7405, scale: 0.14, layer: "behindForeground", placement: { pose: "standing", foreground: [{ x: 0.56, y: 0.74 }, { x: 0.66, y: 0.74 }, { x: 0.66, y: 0.85 }, { x: 0.56, y: 0.85 }], contract: { standingHeight: 0.14, visibleFraction: 0.45, supportPoint: { x: 0.6185, y: 0.81 }, comparators: "the boy in blue beside the block" } } };

describe("the placement contract in childProblem", () => {
  it("rejects the sledge child who came back 1.47 times the child beside her (accepted by every rule in game 2)", () => {
    const c = shapeContract(SLEDGE, ART)!;
    expect(c.standingPx).toBe(389);
    expect(c.visiblePx).toBe(304);
    const problem = childProblem(render(SLEDGE, { width: 280, height: 448, centerX: c.supportX, centerY: c.supportY - 224 }));
    expect(problem).toMatch(/larger than the children beside her/);
  });
  it("accepts a seated child the size of her neighbour, and one a fifth larger", () => {
    const c = shapeContract(SLEDGE, ART)!;
    expect(childProblem(render(SLEDGE, { width: 190, height: 300, centerX: c.supportX + 20, centerY: c.supportY - 150 }))).toBeNull();
    expect(childProblem(render(SLEDGE, { width: 220, height: Math.round(c.visiblePx * 1.2), centerX: c.supportX, centerY: c.supportY - c.visiblePx * 0.6 }))).toBeNull();
  });
  it("rejects a body twice the height the contract shows, and one 4.9 standing-heights away", () => {
    const c = shapeContract(STONES, ART)!;
    const twice = childProblem(render(STONES, { width: 140, height: c.visiblePx * 2, centerX: c.supportX, centerY: c.supportY - c.standingPx + c.visiblePx }));
    expect(twice).toMatch(/larger than the children beside her/);
    const far = childProblem(render(STONES, { width: 120, height: c.visiblePx, centerX: c.supportX + 4.9 * c.standingPx, centerY: c.supportY - c.standingPx + c.visiblePx / 2 }));
    expect(far).toMatch(/standing-heights sideways/);
  });
  it("accepts the peek over the block that the fast judge rejected: head and shoulders where the contract puts them", () => {
    const c = shapeContract(STONES, ART)!;
    expect(c.visibleAtTop).toBe(true);
    // giza/stones attempt 3 of game 2: 119 x 160 px, over the block's top edge.
    expect(childProblem(render(STONES, { width: 119, height: 160, centerX: c.supportX + 15, centerY: c.supportY - c.standingPx + 80 }))).toBeNull();
  });
  it("still refuses a child too small for the depth", () => {
    const c = shapeContract(STONES, ART)!;
    expect(childProblem(render(STONES, { width: 40, height: Math.round(c.visiblePx * 0.5), centerX: c.supportX, centerY: c.supportY - c.standingPx + 30 }))).toMatch(/too small for this depth/);
  });
  it("names both heights for the prompt in the model's pixels", () => {
    expect(contractPx(SLEDGE, ART)).toEqual({ standing: 389, visible: 304 });
    expect(contractPx(SLEDGE, ART, 1024 / 768)).toEqual({ standing: 519, visible: 405 });
    expect(contractPx({ placement: null }, ART)).toBeNull();
    expect(CONTRACT_HEIGHT_MAX).toBe(1.3);
  });
});

describe("the contract in the scene schema", () => {
  const base = () => JSON.parse(JSON.stringify(sceneBySlug("giza"))) as ReturnType<typeof sceneBySlug>;
  it("refuses a scale that disagrees with the contract, and a support point away from the slot", () => {
    const scene = base();
    const slot = scene.targets[0]!.slots[0];
    slot.placement = { pose: "standing", support: "Both shoes on the sand.", occlusion: "None; the whole child shows.", instructions: "Stand on the sand beside the camel.", contract: { standingHeight: slot.scale * 1.5, visibleFraction: 1, supportPoint: { x: slot.x, y: slot.y + slot.scale / 2 }, comparators: "the children beside the camel" } };
    expect(validateSceneDefinition(scene).errors.join("\n")).toMatch(/disagrees with the contract/);
    slot.placement.contract!.standingHeight = slot.scale;
    slot.placement.contract!.supportPoint = { x: slot.x + slot.scale, y: slot.y + slot.scale / 2 };
    expect(validateSceneDefinition(scene).errors.join("\n")).toMatch(/support point is .* away from the slot sideways/);
    slot.placement.contract!.supportPoint = { x: slot.x, y: slot.y - 0.05 };
    expect(validateSceneDefinition(scene).errors.join("\n")).toMatch(/not below the slot/);
    slot.placement.contract!.supportPoint = { x: slot.x, y: slot.y + slot.scale / 2 };
    expect(validateSceneDefinition(scene).ok).toBe(true);
  });
});
