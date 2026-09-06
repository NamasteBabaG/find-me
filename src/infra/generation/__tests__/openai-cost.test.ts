import { describe, expect, it } from "vitest";
import { costCentsFrom } from "../openai";

/**
 * The cost of a call, from the usage the API returns, at the rates the code
 * carries. Two of these are real usage records from the 6 September 2026
 * sampling round; rounding them to whole cents read a 2.42-cent roll as 2,
 * and eighty of them as 160 cents where the usage says 193.6.
 */
describe("costCentsFrom", () => {
  it("keeps the fraction of a cent on a low-quality roll", () => {
    // work/patch-quality/e2/arm-A/repeat-1/dana/amazon-canoe-A: 389 text + 2048 image tokens in, 196 out
    const usage = { input_tokens: 2437, output_tokens: 196, input_tokens_details: { text_tokens: 389, image_tokens: 2048 } };
    // (389×5 + 2048×8 + 196×30) / 1e6 USD = 0.024209 USD
    expect(costCentsFrom("gpt-image-2", usage)).toBeCloseTo(2.421, 3);
  });

  it("and on a medium identity sheet", () => {
    // work/patch-quality/id2: 324 text + 2048 image tokens in, 1756 out
    const usage = { input_tokens: 2372, output_tokens: 1756, input_tokens_details: { text_tokens: 324, image_tokens: 2048 } };
    expect(costCentsFrom("gpt-image-2", usage)).toBeCloseTo(7.068, 3);
  });

  it("adds up eighty low rolls to the figure the usage supports, not to 160", () => {
    const usage = { input_tokens: 2437, output_tokens: 196, input_tokens_details: { text_tokens: 389, image_tokens: 2048 } };
    let total = 0;
    for (let i = 0; i < 80; i++) total += costCentsFrom("gpt-image-2", usage);
    expect(total).toBeGreaterThan(190);
    expect(Math.round(total)).not.toBe(160);
  });

  it("charges the older model at its own rates and reads image tokens from the total when the detail is missing", () => {
    expect(costCentsFrom("gpt-image-1", { input_tokens: 2048, output_tokens: 1000 })).toBeCloseTo((2048 * 10 + 1000 * 40) / 10_000, 3);
  });

  it("is zero, not a guess, when there is no usage at all", () => {
    expect(costCentsFrom("gpt-image-2", undefined)).toBe(0);
  });
});
