import { describe, it, expect } from "vitest";
import { CHILD_AGES, childAgeDirection, validChildAge } from "../child-appearance";
import { characterPrompt } from "@/infra/generation/character-prompt";
import { slotPrompt } from "@/services/generation/patch";
import { boardJudgePrompt, parseBoardVerdict, BOARD_CHECKS } from "@/infra/generation/board-verdict";

describe("child age is a contract, not just identity resemblance", () => {
  it.each([0, 1, 11, 17, 18, 8.5, NaN, Infinity, "8", null])( "rejects invalid age %s", age => expect(validChildAge(age)).toBe(false));
  it.each(CHILD_AGES)("accepts whole child age %s", age => expect(validChildAge(age)).toBe(true));
  it("offers exactly ages 2 through 10", () => expect(CHILD_AGES).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]));
  it("carries eight into sheet, slot and independent judging criteria", () => {
    const prompts = [characterPrompt({ styled: true, ageYears: 8 }), slotPrompt({ mission: "Find the child", childPx: 160, ageYears: 8 }), boardJudgePrompt("Yuval", 8)];
    for (const prompt of prompts) { expect(prompt).toContain("8 years old"); expect(prompt).toContain("Do not infer gender from the name"); }
    expect(prompts[0]).toContain("no hat");
    expect(prompts[1]).toContain("Do not enlarge the child to adult height");
    expect(prompts[2]).toContain("both look older than the stated age");
  });
  it("does not invent eight for legacy profiles or adultify their reference", () => {
    expect(childAgeDirection(null)).toContain("exact age was not supplied");
    expect(childAgeDirection()).not.toContain("8 years old");
    expect(() => childAgeDirection(30)).toThrow("Invalid child age");
  });
  it.each(["ageProportions", "anatomy"])("a failed %s cannot be overridden by matching identity", key => {
    const checks = Object.fromEntries(BOARD_CHECKS.map(key => [key, "pass"]));
    expect(parseBoardVerdict(JSON.stringify({ verdict: "ok", checks: { ...checks, [key]: "fail" }, reason: "visible problem" }))?.verdict).toBe("bad");
    expect(parseBoardVerdict(JSON.stringify({ checks: { ...checks, [key]: "uncertain" }, reason: "not enough detail" }))?.verdict).toBe("unknown");
    delete checks[key];
    expect(parseBoardVerdict(JSON.stringify({ checks, reason: "omitted age or anatomy" }))).toBeNull();
  });
});
