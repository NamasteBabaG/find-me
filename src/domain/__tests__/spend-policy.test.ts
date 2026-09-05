import { describe, expect, it } from "vitest";
import { spendAllowedFor, underDailyCeiling } from "../spend-policy";

/**
 * A QA box with a real painter is reachable by anyone with the URL. These pin
 * that only the listed testers can make it spend, and only up to a ceiling.
 */
const qa = { appEnv: "qa" as const, realGeneration: true, testers: ["guy@example.com"] };

describe("who may spend", () => {
  it("lets a listed tester through, whatever the case of the address", () => {
    expect(spendAllowedFor(qa, "Guy@Example.com ")).toBe(true);
  });

  it("stops a stranger, and an order with no address at all", () => {
    expect(spendAllowedFor(qa, "someone@else.com")).toBe(false);
    expect(spendAllowedFor(qa, null)).toBe(false);
  });

  it("does not gate a mock painter, development, or the real shop", () => {
    expect(spendAllowedFor({ ...qa, realGeneration: false }, "anyone@x.com")).toBe(true);
    expect(spendAllowedFor({ ...qa, appEnv: "development" }, "anyone@x.com")).toBe(true);
    expect(spendAllowedFor({ ...qa, appEnv: "production" }, "anyone@x.com")).toBe(true);
  });
});

describe("the daily ceiling", () => {
  it("is off when unset, and stops at the line", () => {
    expect(underDailyCeiling(99_999, 0)).toBe(true);
    expect(underDailyCeiling(99_999, undefined)).toBe(true);
    expect(underDailyCeiling(1999, 2000)).toBe(true);
    expect(underDailyCeiling(2000, 2000)).toBe(false);
  });
});
