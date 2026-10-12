import { describe, expect, it } from "vitest";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../../content/adventures/wizard-integrated-release";
import { maskForHide } from "../local-patch-hides";
import { assertLocalPatchForeground, authoredLocalPatchForeground, localPatchForegroundAlpha, localPatchForegroundAlphaSha256,
  localPatchForegroundSha256, LOCAL_PATCH_FOREGROUNDS, type LocalPatchForeground } from "../local-patch-foreground";

const hideOf = (id: string) => INTEGRATED_COLLECTION_BOARDS.flatMap(b => b.hides).find(h => h.id === id)!;
const at = (alpha: Uint8Array, x: number, y: number) => alpha[y * 512 + x]!;

describe("authored foreground", () => {
  it("pins the New York taxi outline: geometry, coverage and the pixels it restores", () => {
    const hide = hideOf("newyork-v12-1"), fg = authoredLocalPatchForeground(hide.id)!;
    const alpha = assertLocalPatchForeground(hide, fg);
    expect(localPatchForegroundSha256(fg)).toBe("4be0c68ac7ca32ebbcd5790b538a573d88a9f9785b235d55a7c1688bcb3a640f");
    expect(localPatchForegroundAlphaSha256(alpha)).toBe("7f2e115b8961a46ad647195fef56bd06ebacc2c2452098687b9b5cc737cd2f67");
    expect(alpha.reduce((n, a) => n + (a ? 1 : 0), 0)).toBe(10925);
    expect(alpha.reduce((n, a) => n + (a === 255 ? 1 : 0), 0)).toBe(10615);
    // Inside the sign's face, its left end and the roof; outside: the step above, the sidewalk beside it.
    for (const [x, y] of [[250, 740], [175, 760], [380, 765], [330, 760]] as const) expect(at(alpha, x, y)).toBe(255);
    for (const [x, y] of [[250, 690], [140, 760], [480, 765], [345, 740], [250, 650]] as const) expect(at(alpha, x, y)).toBe(0);
  });

  it("never covers the envelope and always enters from the crop's edge", () => {
    for (const fg of LOCAL_PATCH_FOREGROUNDS) {
      const hide = hideOf(fg.hideId), mask = maskForHide(hide), alpha = assertLocalPatchForeground(hide, fg);
      for (let y = mask.top; y < mask.top + mask.height; y++) for (let x = mask.left; x < mask.left + mask.width; x++) expect(at(alpha, x, y)).toBe(0);
      expect(Array.from({ length: 512 }, (_, x) => at(alpha, x, 767)).some(Boolean)).toBe(true);
    }
  });

  it("refuses an outline that could hide the child, float inside the painting or leave the crop", () => {
    const hide = hideOf("newyork-v12-1"), base = authoredLocalPatchForeground(hide.id)!;
    const variant = (polygons: LocalPatchForeground["polygons"], hideId = hide.id): LocalPatchForeground => ({ ...base, hideId, polygons });
    expect(() => assertLocalPatchForeground(hide, variant([[[150, 600], [400, 600], [400, 768], [150, 768]]]))).toThrow(/envelope/);
    expect(() => assertLocalPatchForeground(hide, variant([[[20, 700], [120, 700], [120, 740], [20, 740]]]))).toThrow(/edge/);
    expect(() => assertLocalPatchForeground(hide, variant([[[0, 700], [520, 700], [520, 768]]]))).toThrow(/inside the 512x768/);
    expect(() => assertLocalPatchForeground(hide, variant([[[0, 760], [4, 760], [4, 768]]]))).toThrow(/64 square/);
    expect(() => assertLocalPatchForeground(hide, variant([[[0, 760], [40, 760]]]))).toThrow(/three points/);
    expect(() => assertLocalPatchForeground(hide, variant(base.polygons, "greatwall-v12-1"))).toThrow(/belongs to/);
    expect(() => assertLocalPatchForeground(hide, { ...base, what: " " })).toThrow(/description/);
  });

  it("restores the union of its polygons, deterministically", () => {
    const hide = hideOf("newyork-v12-1");
    const two: LocalPatchForeground = { hideId: hide.id, what: "two blocks", polygons: [[[0, 740], [40, 740], [40, 768], [0, 768]], [[30, 750], [80, 750], [80, 768], [30, 768]]] };
    const alpha = assertLocalPatchForeground(hide, two);
    expect([at(alpha, 10, 745), at(alpha, 35, 760), at(alpha, 70, 760), at(alpha, 70, 745)]).toEqual([255, 255, 255, 0]);
    expect(localPatchForegroundAlphaSha256(localPatchForegroundAlpha(two))).toBe(localPatchForegroundAlphaSha256(alpha));
  });
});
