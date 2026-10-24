import { describe, expect, it } from "vitest";
import { z } from "zod";
import { boundedArray } from "../bounded-array";

describe("early collection size rejection", () => {
  it.each([6, 50, 100])("refuses more than %i entries without reading them", maximum => {
    const values = new Array(maximum + 1);
    Object.defineProperty(values, 0, { get() { throw Error("Oversized element was visited"); } });
    expect(boundedArray(z.string(), maximum).safeParse(values).success).toBe(false);
  });
  it("still applies element parsing and defaults inside the limit", () => {
    expect(boundedArray(z.number().prefault(0), 2).parse([undefined, 2])).toEqual([0, 2]);
    expect(boundedArray(z.number(), 2).safeParse(["bad"]).success).toBe(false);
  });
  it.each([null, {}, "text"])("refuses non-array input %j", value => {
    expect(boundedArray(z.string(), 2).safeParse(value).success).toBe(false);
  });
});
