import { describe, expect, it } from "vitest";
import { BOARD_PAINT_SAMPLE, assertBoardPaintSample } from "../../../scripts/lib/board-paint-sample";

describe("owner-approved bounded v12 visual sample", () => {
  const base = { twoWorlds: true, slug: BOARD_PAINT_SAMPLE.slug, phase: "--dry-run", attempt: 1 };
  it("allows pinning and only the three first attempts", () => {
    expect(() => assertBoardPaintSample(base)).not.toThrow();
    for (const n of [1, 2, 3]) expect(() => assertBoardPaintSample({ ...base, phase: "--render", target: `${base.slug}-${n}` })).not.toThrow();
  });
  it.each([
    { twoWorlds: false }, { slug: "magic-icepalace-refresh-v2" }, { attempt: 2 }, { attempt: 3 },
    { phase: "--render" }, { phase: "--render", target: `${BOARD_PAINT_SAMPLE.slug}-4` },
    { phase: "--render", target: "other-hide-1" }, { phase: "--publish" }, { target: "unexpected" },
  ])("rejects scope expansion before purchase: %j", overrides => {
    expect(() => assertBoardPaintSample({ ...base, ...overrides })).toThrow(/only the three dragon hides/);
  });
});
