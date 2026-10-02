// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { transformationExample as example } from "../../../../content/demo/transformation";
import { buildDemoConfig } from "@/services/demo";
import { getDict } from "@/i18n";
import { scenePreview } from "@/game/engine/scene-preview";
import { targetGeometry } from "@/game/engine/target-geometry";
import { Transformation } from "../Transformation";
import { MissionCard } from "@/game/components/MissionCard";
import { GameI18nProvider } from "@/game/i18n";
import { I18nProvider } from "@/i18n/client";
import { HomeQaRecovery } from "@/ui/qa/HomeQaRecovery";
import prepared from "../../../../content/home/transformation-preview.json";

vi.mock("next/image", () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} /> }));
vi.mock("../Reveal", () => ({ Reveal: ({ as: Tag = "div", children, className }: any) => <Tag className={className}>{children}</Tag> }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: (await import("@/i18n")).getDict("he"), locale: "he" }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the photo-to-game proof", () => {
  it("recovers the portrait and prepared demo crop after normal QA sign-in", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 401, json: async () => ({ code: "QA_ACCESS_REQUIRED" }) });
    vi.stubGlobal("fetch", fetcher);
    const view = render(<I18nProvider locale="he" dict={getDict("he")}><HomeQaRecovery enabled>{await Transformation()}</HomeQaRecovery></I18nProvider>);
    await act(async () => {
      fireEvent.error(view.container.querySelector(".tf-portrait img")!);
      fireEvent.error(view.container.querySelector(".tf-world__prepared")!);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".tf-portrait img")).toBeNull();
    expect(view.container.querySelector(".qa-home-recovery")).not.toBeNull();
    fetcher.mockResolvedValue({ status: 204 });
    await act(async () => fireEvent(window, new Event("focus")));
    expect(view.container.querySelector(".qa-home-recovery")).toBeNull();
    expect(view.container.querySelector(".tf-portrait img")).not.toBeNull();
    fireEvent.load(view.container.querySelector(".tf-world__prepared")!);
    expect(view.getByRole("img", { name: getDict("he").home.transform.worldAlt })).toBeTruthy();
  });
  it("keeps the selected example's eyes, nose and cheeks opaque over the board", async () => {
    if (example.sprite.kind !== "image") throw new Error("Expected a generated patch");
    const { data, info } = await sharp(`public${example.sprite.url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Manually reviewed face interior for THIS fixture, not a general face detector.
    let samples = 0;
    for (let y = 348; y <= 392; y++) for (let x = 187; x <= 227; x++) {
      if (((x - 207) / 20) ** 2 + ((y - 370) / 22) ** 2 > 1) continue;
      expect(data[(y * info.width + x) * 4 + 3]).toBe(255);
      samples++;
    }
    expect(samples).toBeGreaterThan(1000);
  });
  it("renders the prepared complete demo composition, and waits for it before showing the bubble", async () => {
    const view = render(await Transformation());
    const picture = view.container.querySelector(".tf-world__prepared")!;
    expect(example.sprite.kind).toBe("image");
    expect(picture.getAttribute("src")).toBe(prepared.src);
    expect(picture.getAttribute("loading")).toBe("lazy");
    expect(view.container.querySelector(`img[src="${buildDemoConfig("en").scenes[0]!.art.base}"]`)).toBeNull();
    expect(view.container.querySelector(".tf-portrait img")?.getAttribute("src")).toBe(example.identitySheet);
    expect(view.container.textContent).not.toContain("כובע");
    expect(view.container.querySelector(".tf-world__bubble")).toBeNull();
    fireEvent.load(picture);
    expect(view.getByRole("img", { name: getDict("he").home.transform.worldAlt })).toBeTruthy();
    expect(view.container.querySelector(".tf-world__bubble")).not.toBeNull();
    fireEvent.error(picture);
    expect(view.container.querySelector(".tf-world__bubble")).toBeNull();
    expect(view.getByRole("status").textContent).toBe(getDict("he").home.transform.previewUnavailable);
  });

  it("does not bring the hat portrait back as a failed-image fallback", async () => {
    const view = render(await Transformation());
    fireEvent.error(view.container.querySelector(".tf-portrait img")!);
    expect(view.container.querySelector(".tf-portrait img")).toBeNull();
    expect(view.container.querySelector('img[src="/demo/noa-face.png"]')).toBeNull();
    expect(view.container.querySelector('img[src="/demo/example-character.webp"]')).toBeNull();
  });

  it("ends an indefinitely pending image load without an orphan bubble", async () => {
    vi.useFakeTimers();
    const view = render(await Transformation());
    act(() => vi.advanceTimersByTime(15_000));
    expect(view.getByRole("status").textContent).toBe(getDict("he").home.transform.previewUnavailable);
    expect(view.container.querySelector(".tf-world__bubble")).toBeNull();
  });

  it("does not request or time out an offscreen preview, even after a long pause", async () => {
    vi.useFakeTimers();
    let enter!: (entries: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof enter) { enter = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const view = render(await Transformation());
    expect(view.container.querySelector(".tf-world__prepared")).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(view.getByRole("status").textContent).toBe(getDict("he").home.transform.previewLoading);
    act(() => enter([{ isIntersecting: true }]));
    expect(view.container.querySelector(".tf-world__prepared")?.getAttribute("src")).toBe(prepared.src);
    expect(disconnect).toHaveBeenCalled();
    fireEvent.load(view.container.querySelector(".tf-world__prepared")!);
    expect(view.container.querySelector(".tf-world__bubble")).not.toBeNull();
  });

  it("binds the small display crop to the exact public demo masters and head", async () => {
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(hash(`public${prepared.source.board}`)).toBe(prepared.source.boardSha256);
    expect(hash(`public${prepared.source.patch}`)).toBe(prepared.source.patchSha256);
    expect(hash(`public${prepared.src}`)).toBe(prepared.sha256);
    const meta = await sharp(`public${prepared.src}`).metadata();
    expect([meta.width, meta.height]).toEqual([720, 900]);
    expect(readFileSync(`public${prepared.src}`).length).toBeLessThan(250_000);
    const layer = await sharp(`public${prepared.source.patch}`).resize(prepared.source.rect.width, prepared.source.rect.height, { fit: "fill" }).png().toBuffer();
    const composition = await sharp(`public${prepared.source.board}`).composite([{ input: layer, left: prepared.source.rect.left, top: prepared.source.rect.top }]).png().toBuffer();
    const expected = await sharp(composition).extract(prepared.crop).resize(720, 900).webp({ quality: 80, effort: 6 }).toBuffer();
    expect(readFileSync(`public${prepared.src}`).equals(expected)).toBe(true);
    const scene = buildDemoConfig("en").scenes[0]!;
    const target = scene.targets.find(t => t.id === example.target)!;
    const geometry = targetGeometry(scene, target, "A");
    expect(prepared.source.sceneVersion).toBe(scene.version);
    expect(prepared.source.target).toBe(target.id);
    expect(prepared.bubble.x).toBeCloseTo((geometry.head.x * scene.art.width - prepared.crop.left) / prepared.crop.width);
    expect(prepared.bubble.y).toBeCloseTo((geometry.head.y * scene.art.height - prepared.crop.top) / prepared.crop.height);
  });

  it("shows the illustrated identity cue even when the hiding spot has a composed costume", () => {
    const demo = buildDemoConfig("en");
    const target = { ...demo.scenes[0]!.targets[0]!, sprite: { kind: "composed" as const, faceUrl: "/not-the-identity.png", bodyTemplate: "beach_float" } };
    const view = render(<GameI18nProvider locale="en"><MissionCard index={1} total={1} target={target} found={[]} order={[target.id]} hintLevel={0} hintPulse={false} hintText={null} onHint={() => {}} childName={demo.child.name} avatarUrl={demo.child.avatarUrl} minimal /></GameI18nProvider>);
    expect(view.container.querySelector(".mission__face")?.getAttribute("src")).toBe(demo.child.avatarUrl);
    expect(view.container.querySelector("svg")).toBeNull();
    expect(view.container.querySelector('img[src="/demo/example-photo.jpg"]')).toBeNull();
  });

  it("uses the actual patch head, not the obsolete slot, at every responsive scale", () => {
    const scene = buildDemoConfig("en", example.scene).scenes[0]!;
    const target = { ...scene.targets.find(t => t.id === example.target)!, sprite: example.sprite, spriteByVariant: { A: example.sprite } };
    const preview = scenePreview(scene, target)!;
    const geometry = targetGeometry(scene, target, "A");
    expect(preview.frame.width / preview.frame.height).toBeCloseTo(4 / 5);
    expect(preview.frame.height).toBeGreaterThanOrEqual(scene.art.height * 0.48);
    for (const displayWidth of [224, 294, 360, 420]) {
      const scale = displayWidth / preview.frame.width;
      const bubbleX = parseFloat(preview.bubbleStyle.left) / 100 * displayWidth;
      const bubbleY = parseFloat(preview.bubbleStyle.top) / 100 * displayWidth / (4 / 5);
      expect(bubbleX).toBeCloseTo((geometry.head.x * scene.art.width - preview.frame.x) * scale);
      expect(bubbleY).toBeCloseTo((geometry.head.y * scene.art.height - preview.frame.y) * scale);
      expect(bubbleX).toBeGreaterThan(0);
      expect(bubbleX).toBeLessThan(displayWidth);
    }
    expect(preview.frame.x).toBeGreaterThanOrEqual(0);
    expect(preview.frame.y + preview.frame.height).toBeLessThanOrEqual(scene.art.height);
    expect(geometry.head.y).not.toBe(target.slots[0]!.y);
  });

  it("ships the newly rendered demo art with the same hat-free identity cue and marketing example", () => {
    if (example.sprite.kind !== "image") throw new Error("Expected a generated patch");
    const demo = buildDemoConfig("he");
    for (const src of [example.photo, example.identitySheet, example.sprite.url, demo.child.avatarUrl]) expect(existsSync(`public${src}`)).toBe(true);
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    for (const src of [example.identitySheet, example.sprite.url, demo.child.avatarUrl]) expect(src).toBe(`/demo/beach-v1/${hash(`public${src}`)}.webp`);
    expect(demo.scenes[0]!.targets.find(t => t.id === "sandcastle")!.sprite).toEqual(example.sprite);
  });
});
