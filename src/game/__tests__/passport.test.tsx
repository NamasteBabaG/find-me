// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { emptyProgress, recordSceneCompleted, sceneProgress } from "@/domain/game/progress";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { getDict } from "@/i18n";
import { Passport } from "../components/Passport";
import { GameI18nProvider } from "../i18n";

vi.mock("next/image", () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} /> }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the illustrated adventure bag", () => {
  it.each(["he", "en"] as const)("shows the nine real boards and only actual completion in %s", locale => {
    const config = buildDemoConfig(locale);
    config.scenes = boardSlugs(allWorlds()[0]!).map(slug => buildDemoConfig(locale, slug).scenes[0]!);
    const [done, partial] = config.scenes;
    let progress = recordSceneCompleted(emptyProgress(config.gameId), done!.slug, { variants: {}, order: [], noHints: true, bonusFound: true }, 9);
    // A legacy collectible, bonus or no-hint flag must never masquerade as completion.
    progress.scenes[partial!.slug] = { ...sceneProgress(progress, partial!.slug), collectible: true, noHintClear: true, bonusFound: true };
    progress = recordSceneCompleted(progress, "another-world", { variants: {}, order: [], noHints: false, bonusFound: false }, 9);
    const before = JSON.stringify(progress), onOpen = vi.fn(), onMap = vi.fn();
    const g = getDict(locale).game.passport;
    const view = render(<GameI18nProvider locale={locale}><Passport config={config} progress={progress} onMap={onMap} onOpen={onOpen} /></GameI18nProvider>);
    expect(view.container.querySelectorAll(".loot")).toHaveLength(9);
    expect(view.container.querySelectorAll(".loot__completed")).toHaveLength(1);
    expect(view.container.textContent).not.toMatch(/❔|🦅|✨/u);
    expect(view.container.textContent).toContain(g.progress.replace("{done}", "1").replace("{total}", "9"));
    config.scenes.forEach(scene => {
      const button = view.getByRole("button", { name: `${scene.name} — ${scene.slug === done!.slug ? g.collected : g.notYet}` });
      expect(button.querySelector("img")?.getAttribute("src")).toBe(scene.art.thumbnail);
      fireEvent.click(button);
      expect(onOpen).toHaveBeenLastCalledWith(scene.slug);
    });
    fireEvent.click(view.getByRole("button", { name: g.map }));
    expect(onMap).toHaveBeenCalledOnce();
    expect(JSON.stringify(progress)).toBe(before);
  });

  it("falls back to board art, not an emoji, and preserves the title if both images fail", () => {
    const config = buildDemoConfig("en");
    const view = render(<GameI18nProvider locale="en"><Passport config={config} progress={emptyProgress(config.gameId)} onMap={() => {}} onOpen={() => {}} /></GameI18nProvider>);
    const card = view.container.querySelector(".loot__btn")!;
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")?.getAttribute("src")).toBe(config.scenes[0]!.art.base);
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toBeNull();
    expect(within(card as HTMLElement).getByText(config.scenes[0]!.name)).toBeTruthy();
  });
});
