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

vi.mock("next/image", () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} /> }));
vi.mock("../Reveal", () => ({ Reveal: ({ as: Tag = "div", children, className }: any) => <Tag className={className}>{children}</Tag> }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: (await import("@/i18n")).getDict("he"), locale: "he" }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the photo-to-game proof", () => {
  it("keeps the selected example's eyes, nose and cheeks opaque over the board", async () => {
    const { data, info } = await sharp(`public${example.sprite.url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Manually reviewed face interior for THIS fixture, not a general face detector.
    let samples = 0;
    for (let y = 42; y <= 88; y++) for (let x = 78; x <= 116; x++) {
      if (((x - 97) / 19) ** 2 + ((y - 65) / 23) ** 2 > 1) continue;
      expect(data[(y * info.width + x) * 4 + 3]).toBe(255);
      samples++;
    }
    expect(samples).toBe(1365);
  });
  it("renders the real server composition, and waits for BOTH board and child before showing the bubble", async () => {
    const view = render(await Transformation());
    const board = view.container.querySelector(".tf-world__base")!;
    const patch = view.container.querySelector(".tf-world__patch")!;
    expect(patch.getAttribute("src")).toBe(example.sprite.url);
    expect(view.container.querySelector(".tf-portrait img")?.getAttribute("src")).toBe(example.identitySheet);
    expect(view.container.textContent).not.toContain("כובע");
    expect(view.container.querySelector(".tf-world__bubble")).toBeNull();
    fireEvent.load(board);
    expect(view.container.querySelector(".tf-world__bubble")).toBeNull();
    fireEvent.load(patch);
    expect(view.getByRole("img", { name: getDict("he").home.transform.worldAlt })).toBeTruthy();
    expect(view.container.querySelector(".tf-world__bubble")).not.toBeNull();
    fireEvent.error(patch);
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

  it("shows the illustrated identity cue even when the hiding spot has a composed costume", () => {
    const demo = buildDemoConfig("en");
    const target = { ...demo.scenes[0]!.targets[0]!, sprite: { kind: "composed" as const, faceUrl: "/not-the-identity.png", bodyTemplate: "beach_float" } };
    const view = render(<GameI18nProvider locale="en"><MissionCard index={1} total={1} target={target} found={[]} order={[target.id]} hintLevel={0} hintPulse={false} hintText={null} onHint={() => {}} childName={demo.child.name} avatarUrl={demo.child.avatarUrl} minimal /></GameI18nProvider>);
    expect(view.container.querySelector(".mission__face")?.getAttribute("src")).toBe("/demo/noa-portrait.png");
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

  it("ships the selected existing demo art, and a hat-free identity cue without changing playable hiding spots", () => {
    for (const src of [example.photo, example.identitySheet, example.sprite.url, "/demo/noa-portrait.png"]) expect(existsSync(`public${src}`)).toBe(true);
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(hash(`public${example.identitySheet}`)).toBe("df0dd24d2aa1579b7ba5c7c761079632f59ba890ebed0b9be53b4390d40a7434");
    expect(hash("public/demo/noa-portrait.png")).toBe("df91e71f4aacd1679962ebfd124de5290a81811d47507088ed8e1e65697ecea6");
    expect(hash(`public${example.sprite.url}`)).toBe("a5ed6cdfe4e10536dbe2219b0bbc78f6284829bbbc54613487828f3cf8e18311");
    const demo = buildDemoConfig("he");
    expect(demo.child.avatarUrl).toBe("/demo/noa-portrait.png");
    expect(demo.scenes[0]!.targets.find(t => t.id === "sandcastle")!.sprite).toMatchObject({ url: "/demo/patches/beach-sandcastle-A.webp" });
  });
});
