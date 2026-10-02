import { describe, expect, it } from "vitest";
import { preparationState, GENERATION_STALE_MS } from "../generation-health";

const now = new Date("2026-10-02T00:00:00Z").getTime();
const recent = new Date(now - 60_000);
describe("honest parent-facing preparation states", () => {
  it("does not present explicit holds and failures as ordinary drawing", () => {
    expect(preparationState({ status: "GENERATION_FAILED", updatedAt: recent }, now)).toBe("attention");
    expect(preparationState({ status: "NEEDS_NEW_PHOTO", updatedAt: recent }, now)).toBe("needsPhoto");
    expect(preparationState({ status: "MANUAL_REVIEW", updatedAt: recent }, now)).toBe("attention");
    expect(preparationState({ status: "GENERATION_FAILED", updatedAt: recent, automaticRecovery: true }, now)).toBe("repairing");
  });
  it.each(["local-patch:needs-release", "local-patch:recovery-budget-wait", "local-patch:evidence-retry-wait"])("distinguishes %s even on a recent generating row", currentStep => {
    expect(preparationState({ status: "TARGETS_GENERATING", updatedAt: recent,
      job: { status: "QUEUED", currentStep, updatedAt: recent }, automaticRecovery: true }, now)).toBe(currentStep.endsWith("needs-release") ? "attention" : "delayed");
  });
  it("uses the worker heartbeat rather than presentation writes to identify a delay", () => {
    expect(preparationState({ status: "TARGETS_GENERATING", updatedAt: recent,
      job: { status: "QUEUED", currentStep: "local-patch", updatedAt: new Date(now - GENERATION_STALE_MS) } }, now)).toBe("delayed");
    expect(preparationState({ status: "TARGETS_GENERATING", updatedAt: new Date(now - GENERATION_STALE_MS),
      job: { status: "RUNNING", currentStep: "local-patch", updatedAt: recent } }, now)).toBe("preparing");
  });
});
