import { describe, expect, it } from "vitest";
import { deliverWithProblemsOf } from "../container";

/**
 * The container WIRING of the no-human gate, not just the pipeline behind it:
 * Codex's second review asked for the APP_ENV side to be held by a test too,
 * so a refactor of build() cannot quietly ship imperfect games from the shop.
 */
describe("the QA-only half of the no-human gate", () => {
  it("is true only for the flag on a QA box", () => {
    expect(deliverWithProblemsOf(true, "qa")).toBe(false);
    expect(deliverWithProblemsOf(true, "qa", true)).toBe(true);
    expect(deliverWithProblemsOf(true, "production", true)).toBe(false);
    expect(deliverWithProblemsOf(true, "production")).toBe(false);
    expect(deliverWithProblemsOf(true, undefined)).toBe(false);
    expect(deliverWithProblemsOf(false, "qa")).toBe(false);
  });
});
