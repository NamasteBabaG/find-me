import { describe, expect, it } from "vitest";
import { hmacSign, hmacVerify, safeEqual } from "@/lib/ids";

describe("safeEqual", () => {
  it("compares equal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });
  it("rejects different strings of the same length", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });
  it("rejects length mismatches without throwing", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
  it("handles multi-byte input", () => {
    expect(safeEqual("שלום", "שלום")).toBe(true);
    expect(safeEqual("שלום", "שלוב")).toBe(false);
  });
});

describe("hmacVerify", () => {
  it("accepts the signature it produced and rejects tampering", () => {
    const sig = hmacSign("payload", "secret");
    expect(hmacVerify("payload", sig, "secret")).toBe(true);
    expect(hmacVerify("payload", sig, "other")).toBe(false);
    expect(hmacVerify("payload2", sig, "secret")).toBe(false);
    expect(hmacVerify("payload", sig.slice(0, -1), "secret")).toBe(false);
  });
});
