// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { PassportView } from "@/domain/passport/passport";
import { passportImageReady, warmPassportBook, warmPassportImage } from "../image-preload";

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
it("prepares the saved spread and neighbour, never hidden items or the whole passport; deduplicates and retries failures", async () => {
  const sources: string[] = [], created: Array<{ onload: (() => void) | null; onerror: (() => void) | null }> = [];
  vi.stubGlobal("Image", class {
    onload = null; onerror = null; decoding = "";
    constructor() { created.push(this); }
    set src(src: string) { sources.push(src); }
    decode() { return Promise.resolve(); }
  });
  const book: PassportView = { name: "Example", preparing: 0, worlds: [{ id: "world", title: "World", pages: [1, 2, 3, 4].map(n => ({
    id: `warm-${n}`, title: "Place", state: "complete", finds: 3, total: 3, stampIcon: "star", photoUrl: `/warm-${n}.webp`,
    discoveries: [{ id: "found", collected: true, rarity: "common", imageUrl: `/warm-item-${n}.webp` }, { id: "hidden", collected: false, rarity: "common", imageUrl: "/do-not-fetch.webp" }],
    photoChoices: [{ id: "other", selected: false, imageUrl: "/do-not-fetch-choice.webp" }],
  })) }] };
  sessionStorage.setItem("passport-cursor:owner", JSON.stringify({ world: "world", page: "warm-2" }));
  warmPassportBook(book, "owner"); warmPassportBook(book, "owner");
  expect(sources).toEqual(["/warm-2.webp", "/warm-item-2.webp", "/warm-3.webp", "/warm-item-3.webp"]);
  const waiting = warmPassportImage("/warm-2.webp");
  created[0]!.onload!();
  expect(await waiting).toBe(true);
  expect(passportImageReady("/warm-2.webp")).toBe(true);
  const failed = warmPassportImage("/warm-item-2.webp"); created[1]!.onerror!();
  expect(await failed).toBe(false);
  const retry = warmPassportImage("/warm-item-2.webp");
  expect(sources.filter(s => s === "/warm-item-2.webp")).toHaveLength(2);
  created.at(-1)!.onload!(); expect(await retry).toBe(true);
  for (const image of created) image.onerror?.();
});
