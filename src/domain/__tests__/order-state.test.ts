import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, creationStep, isPlayable } from "../order-state";

describe("game status machine", () => {
  it("never generates before payment", () => {
    expect(canTransition("CHECKOUT_PENDING", "AVATAR_GENERATING")).toBe(false);
    expect(canTransition("PACKAGE_SELECTED", "AVATAR_GENERATING")).toBe(false);
    expect(canTransition("PAID", "AVATAR_GENERATING")).toBe(true);
  });

  it("only approved QA reaches READY", () => {
    expect(canTransition("QA_PENDING", "READY")).toBe(false);
    expect(canTransition("SCENES_COMPOSING", "READY")).toBe(false);
    expect(canTransition("APPROVED", "READY")).toBe(true);
  });

  it("only READY/DELIVERED are playable", () => {
    expect(isPlayable("READY")).toBe(true);
    expect(isPlayable("DELIVERED")).toBe(true);
    expect(isPlayable("QA_PENDING")).toBe(false);
  });

  it("throws on invalid transitions", () => {
    expect(() => assertTransition("DRAFT", "PAID")).toThrow(/Invalid game transition/);
  });

  it("maps statuses to parent-facing steps", () => {
    expect(creationStep("AVATAR_GENERATING").step).toBe(1);
    expect(creationStep("TARGETS_GENERATING").step).toBe(2);
    expect(creationStep("SCENES_COMPOSING").step).toBe(3);
    expect(creationStep("QA_PENDING").step).toBe(4);
    expect(creationStep("READY")).toEqual({ step: 4, done: true, failed: false });
    expect(creationStep("GENERATION_FAILED").failed).toBe(true);
  });
});
