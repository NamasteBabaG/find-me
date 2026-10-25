import { expect, it } from "vitest";
import { creationDraftHref } from "../creation-draft";
it("preserves each tab's non-secret ID across all creation steps without accepting a redirect destination", () => {
  for (const id of ["game-a", "game-b", "../foreign?next=https://other.invalid"]) {
    for (const step of ["name", "photo", "package", "scenes", "checkout"] as const) {
      const url = new URL(creationDraftHref(step, id), "https://example.invalid");
      expect(url.origin).toBe("https://example.invalid"); expect(url.searchParams.get("draft")).toBe(id);
      expect([...url.searchParams.keys()]).toEqual(["draft"]);
    }
  }
  expect(creationDraftHref("photo")).toBe("/create/photo");
});
