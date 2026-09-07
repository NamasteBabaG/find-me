import { describe, it, expect } from "vitest";
import { IMAGE_EDIT_RESERVE_CENTS } from "../image-edit-reserve";
import { costCentsFrom } from "../openai";

describe("authoring image edit allowance", () => {
  it("covers official HIGH output plus the observed fixed-input token mix", () => {
    // 21.1 cents is output only. This is a pricing scenario, not a saved HIGH render.
    const inputCents=costCentsFrom("gpt-image-2",{input_tokens:2437,output_tokens:0,input_tokens_details:{text_tokens:389,image_tokens:2048}});
    expect(IMAGE_EDIT_RESERVE_CENTS.high).toBeGreaterThan(21.1+inputCents);
    expect(20).toBeLessThan(21.1+inputCents);
  });
  it("also leaves input headroom over the real LOW and MEDIUM usage fixtures", () => {
    expect(IMAGE_EDIT_RESERVE_CENTS.low).toBeGreaterThan(costCentsFrom("gpt-image-2",{input_tokens:2437,output_tokens:196,input_tokens_details:{text_tokens:389,image_tokens:2048}}));
    expect(IMAGE_EDIT_RESERVE_CENTS.medium).toBeGreaterThan(costCentsFrom("gpt-image-2",{input_tokens:2372,output_tokens:1756,input_tokens_details:{text_tokens:324,image_tokens:2048}}));
  });
});
