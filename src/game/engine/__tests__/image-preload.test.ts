// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadGameImage, warmGameImages } from "../image-preload";

class ImageDouble {
  static instances: ImageDouble[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  decoding = "";
  fetchPriority = "";
  decode = vi.fn(() => Promise.resolve());
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  constructor() { ImageDouble.instances.push(this); }
}
beforeEach(() => { vi.useFakeTimers(); ImageDouble.instances = []; vi.stubGlobal("Image", ImageDouble); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded browser image warmup", () => {
  it("warms at most two distinct same-origin images at low priority", async () => {
    const work = warmGameImages(["https://elsewhere.invalid/photo", "/board.webp", "/board.webp", "/first.webp", "/unneeded.webp"]);
    expect(ImageDouble.instances.map(image => image.src)).toEqual(["/board.webp", "/first.webp"]);
    expect(ImageDouble.instances.every(image => image.decoding === "async" && image.fetchPriority === "low")).toBe(true);
    ImageDouble.instances.forEach(image => image.onload?.());
    expect(await work.ready).toEqual([true, true]);
    work.cancel();
    expect(ImageDouble.instances.every(image => image.src === "" && image.onload === null && image.onerror === null)).toBe(true);
  });

  it("requires real decode even after load, and ignores a cancelled decode's late result", async () => {
    const work = preloadGameImage("/current.webp", "high"), image = ImageDouble.instances[0]!;
    let decoded!: () => void;
    image.decode.mockImplementation(() => new Promise<void>(resolve => { decoded = resolve; }));
    image.onload?.();
    expect(image.fetchPriority).toBe("high");
    work.cancel();
    expect(await work.ready).toBe(false);
    decoded(); await Promise.resolve();
    expect(await work.ready).toBe(false);
  });

  it("bounds a stalled warmup and returns failures without throwing", async () => {
    const work = warmGameImages(["/stalled.webp", "/failed.webp"]);
    ImageDouble.instances[1]!.onerror?.();
    vi.advanceTimersByTime(20_000);
    expect(await work.ready).toEqual([false, false]);
    expect(ImageDouble.instances[0]!.src).toBe("");
  });
});
