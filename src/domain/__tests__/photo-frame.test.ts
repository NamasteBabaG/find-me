import { describe, expect, it } from "vitest";
import { cropStyle, faceTooSmall, MAX_ZOOM, offsetFor, openingFrame, parsePhotoCrop } from "../photo-frame";

describe("the stored crop", () => {
  it("reads a valid crop and refuses anything else", () => {
    expect(parsePhotoCrop('{"x":0.1,"y":0.2,"w":0.5,"h":0.4}')).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
    for (const bad of [null, "", "{", '{"x":-1,"y":0,"w":1,"h":1}', '{"x":0,"y":0,"w":0,"h":1}', '{"x":0,"y":0,"w":"1","h":1}', "[]"]) expect(parsePhotoCrop(bad)).toBeNull();
  });
  it("shows exactly the crop inside a frame of any size", () => {
    expect(cropStyle({ x: 0.25, y: 0.1, w: 0.5, h: 0.4 })).toEqual({ width: "200%", height: "250%", left: "-50%", top: "-25%" });
  });
});

describe("the opening frame", () => {
  const photo = { w: 800, h: 1000 }, box = 320;
  it("opens a photo without a face where a portrait puts a head", () => {
    const f = openingFrame(null, photo, box);
    expect(f).toEqual({ zoom: 1, aim: { x: 0.5, y: 0.42 } });
    expect(offsetFor(f, photo, box).y).toBeCloseTo(-8);
  });
  it("centres a found face with room for hair, never zooming past the limit", () => {
    const face = { x: 300, y: 300, width: 200, height: 200 };
    const f = openingFrame(face, photo, box);
    // 2.5 face widths fill the circle: 320 / (500 * 0.4)
    expect(f.zoom).toBeCloseTo(320 / (500 * 0.4));
    expect(f.aim).toEqual({ x: 0.5, y: 0.37 });
    const tiny = openingFrame({ x: 400, y: 200, width: 20, height: 20 }, photo, box);
    expect(tiny.zoom).toBe(MAX_ZOOM);
    expect(faceTooSmall({ x: 400, y: 200, width: 20, height: 20 }, photo, box)).toBe(true);
    expect(faceTooSmall(face, photo, box)).toBe(false);
  });
  it("keeps the photo covering the circle when the face is at an edge", () => {
    const f = openingFrame({ x: 0, y: 0, width: 100, height: 100 }, photo, box);
    expect(offsetFor(f, photo, box)).toEqual({ x: 0, y: 0 });
    const g = openingFrame({ x: 700, y: 900, width: 100, height: 100 }, photo, box);
    const o = offsetFor(g, photo, box), drawn = { w: 800 * 0.4 * g.zoom, h: 1000 * 0.4 * g.zoom };
    expect(o.x).toBeCloseTo(box - drawn.w);
    expect(o.y).toBeCloseTo(box - drawn.h);
  });
});
