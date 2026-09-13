// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, parseProgress, recordSceneCompleted } from "@/domain/game/progress";
import { GameConfigSchema, type GameConfig } from "@/domain/game/config";
import { buildDemoConfig } from "@/services/demo";
import { GameI18nProvider } from "../../i18n";
import { StarTray } from "../StarTray";
import { StarCounter } from "../StarCounter";
import { flightLift } from "../StarFlight";
import { MissionCard } from "../MissionCard";
import { Passport } from "../Passport";

/**
 * The gold-star chrome: what a child sees light up, and what a screen reader
 * is told. The animations themselves are CSS and are not tested here; what
 * is tested is the contract the CSS hangs off - which slot is lit, which is
 * new, and that a re-render never takes "new" away from a star that landed.
 */

// tsconfig keeps JSX for Next (jsx: preserve), so under vitest the components
// compile to React.createElement and need React in scope.
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const he = (ui: React.ReactElement) => render(<GameI18nProvider locale="he">{ui}</GameI18nProvider>);

describe("StarTray", () => {
  it("lights the first N slots and leaves the rest empty", () => {
    const { container } = render(<StarTray lit={2} total={3} label="2 of 3" />);
    const slots = [...container.querySelectorAll(".stars__slot")];
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.classList.contains("is-lit"))).toEqual([true, true, false]);
    expect(container.querySelectorAll(".star--empty")).toHaveLength(1);
    expect(container.querySelector(".stars")?.getAttribute("aria-label")).toBe("2 of 3");
  });

  it("pops only the star that lands after mount, and keeps it popped through re-renders", () => {
    const { container, rerender } = render(<StarTray lit={1} total={3} />);
    const fresh = () => [...container.querySelectorAll(".stars__slot")].map((s) => s.classList.contains("is-new"));
    expect(fresh()).toEqual([false, false, false]);
    rerender(<StarTray lit={2} total={3} />);
    expect(fresh()).toEqual([false, true, false]);
    // The board re-renders every second for the hint clock: the landed star must stay "new".
    rerender(<StarTray lit={2} total={3} />);
    expect(fresh()).toEqual([false, true, false]);
    rerender(<StarTray lit={3} total={3} />);
    expect(fresh()).toEqual([false, true, true]);
  });

  it("celebrating, every lit star is new so the row pops in one after another", () => {
    const { container } = render(<StarTray lit={3} total={3} celebrate />);
    expect([...container.querySelectorAll(".stars__slot.is-new")]).toHaveLength(3);
    expect(container.querySelector(".stars--celebrate")).not.toBeNull();
  });

  it("is decoration to a screen reader unless it is given something to say", () => {
    const { container } = render(<StarTray lit={0} total={3} />);
    expect(container.querySelector(".stars")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("StarCounter", () => {
  it("shows the count and says it in words", () => {
    const { container, getByRole } = render(<StarCounter earned={12} total={27} label="12 of 27 gold stars" />);
    expect(getByRole("img", { name: "12 of 27 gold stars" })).toBeTruthy();
    expect(container.querySelector(".starcount__n")?.textContent).toBe("12");
    expect(container.querySelector(".starcount__of")?.textContent).toBe("/27");
  });

  it("starts from the old number and rolls up to the new one", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("React", React);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const { container } = render(<StarCounter earned={3} total={27} from={0} label="3 of 27" />);
    const n = () => container.querySelector(".starcount__n")?.textContent;
    expect(n()).toBe("0");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const began = performance.now();
    // Halfway through the roll the number is between; at the end it has arrived and bumps.
    act(() => frames.shift()?.(began + 350));
    const mid = Number(n());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(3);
    act(() => frames.shift()?.(began + 800));
    expect(n()).toBe("3");
    expect(container.querySelector(".starcount__n")?.classList.contains("is-bumped")).toBe(true);
  });

  it("does not roll when the count is what it already shows", () => {
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    render(<StarCounter earned={9} total={27} label="9 of 27" />);
    expect(raf).not.toHaveBeenCalled();
  });
});

describe("flightLift", () => {
  it("is a visible hop for a short flight and never a rocket for a long one", () => {
    expect(flightLift({ from: { x: 0, y: 0 }, to: { x: 30, y: 30 } })).toBe(48);
    expect(flightLift({ from: { x: 0, y: 0 }, to: { x: 300, y: 0 } })).toBe(100);
    expect(flightLift({ from: { x: 0, y: 0 }, to: { x: 2000, y: 0 } })).toBe(160);
  });
});

const target = (id: string) =>
  ({
    id,
    targetType: "hide",
    difficulty: 1 as const,
    mission: `find ${id}`,
    item: "a hat",
    success: ["found"],
    animation: "bounce" as const,
    slots: [
      { x: 0.5, y: 0.5, scale: 0.1, rotation: 0, flip: false, zIndex: 1, layer: "aboveForeground" as const, hintZone: { x: 0.5, y: 0.5, r: 0.1 }, hintText: "" },
      { x: 0.5, y: 0.5, scale: 0.1, rotation: 0, flip: false, zIndex: 1, layer: "aboveForeground" as const, hintZone: { x: 0.5, y: 0.5, r: 0.1 }, hintText: "" },
    ] as never,
    sprite: { kind: "composed" as const, faceUrl: "/f.png", bodyTemplate: "t" },
  }) as never;

describe("MissionCard", () => {
  it.each(["Enter", " "])("keeps nested hint/continue keyboard activation native when the HUD is quiet (%s)", key => {
    const onHint = vi.fn(), onAdvance = vi.fn(), onExpand = vi.fn();
    const view = he(<MissionCard index={4} total={5} target={target("d")} found={["a", "b", "c"]}
      order={["a", "b", "c", "d", "e"]} hintLevel={0} hintPulse={false} hintText={null} onHint={onHint}
      onAdvance={onAdvance} childName="יובל" quiet onExpand={onExpand} />);
    for (const selector of [".mission__hintbtn", ".mission__continue"]) {
      const button = view.container.querySelector(selector)!;
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => button.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(onExpand).not.toHaveBeenCalled();
      // Browser activation is a native click after the uncancelled key event.
      fireEvent.click(button);
      onExpand.mockClear();
    }
    expect(onHint).toHaveBeenCalledTimes(1); expect(onAdvance).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(view.container.querySelector(".mission")!, { key });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("carries the tray: the stars that landed, out of the board's three", () => {
    const { container } = he(<MissionCard index={2} total={3} target={target("b")} found={["a", "b"]} order={["a", "b", "c"]} stars={1} hintLevel={0} hintPulse={false} hintText={null} onHint={() => undefined} childName="יובל" />);
    const slots = [...container.querySelectorAll(".mission__stars .stars__slot")];
    expect(slots.map((s) => s.classList.contains("is-lit"))).toEqual([true, false, false]);
    // The words count what has been found; the star in the air is still a find.
    expect(container.querySelector(".mission__stars")?.getAttribute("aria-label")).toBe("2 מתוך 3 כוכבי זהב");
  });

  it("with no flight in front of it, every found child is a landed star", () => {
    const { container } = he(<MissionCard index={3} total={3} target={target("c")} found={["a", "b"]} order={["a", "b", "c"]} hintLevel={0} hintPulse={false} hintText={null} onHint={() => undefined} childName="יובל" />);
    expect([...container.querySelectorAll(".mission__stars .stars__slot.is-lit")]).toHaveLength(2);
  });
});

function gameConfig(): GameConfig {
  const scene = (slug: string) =>
    ({
      slug,
      version: 1,
      name: slug,
      tagline: "",
      artStatus: "final",
      art: { width: 100, height: 100, base: `/${slug}/base.webp`, thumbnail: `/${slug}/thumb.webp`, palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
      targets: [target("a"), target("b"), target("c")],
      ambient: [],
      celebration: { kind: "confetti", completeText: "done" },
      collectible: { id: `c-${slug}`, name: `${slug} stamp`, icon: "★" },
      sounds: {},
    }) as never;
  return {
    version: 1,
    gameId: "g",
    locale: "he",
    child: { name: "יובל", avatarUrl: "/avatar.png" },
    scenes: [scene("newyork"), scene("amazon"), scene("paris")],
  } as never;
}

describe("Passport", () => {
  it.each([3, 5])("uses all nine five-hide boards: %i per board, no early completion or twenty-seven-star ceiling", found => {
    const base = buildDemoConfig("he"), original = base.scenes[0]!;
    const config = GameConfigSchema.parse({ ...base, world: undefined, worlds: undefined,
      scenes: Array.from({ length: 9 }, (_, boardIndex) => ({ ...original, slug: `five-board-${boardIndex}`, version: 9,
        playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3,
        targets: Array.from({ length: 5 }, (_, hideIndex) => ({ ...original.targets[hideIndex % 3]!, id: `hide-${hideIndex}` })) })) });
    const progress = parseProgress(JSON.stringify({ v: 1, gameId: config.gameId, revealed: true,
      scenes: Object.fromEntries(config.scenes.map(scene => [scene.slug, { sceneVersion: 9,
        foundTargetIds: scene.targets.slice(0, found).map(target => target.id) }])) }), config.gameId);
    const view = he(<Passport config={config} progress={progress} onMap={() => undefined} onOpen={() => undefined} />);
    expect(view.getByRole("img", { name: `${9 * found} מתוך 45 כוכבי זהב נאספו` })).toBeTruthy();
    expect([...view.container.querySelectorAll(".loot")].map(card => card.querySelectorAll(".stars__slot.is-lit").length)).toEqual(Array(9).fill(found));
    expect(view.container.querySelectorAll(".loot__completed")).toHaveLength(found === 5 ? 9 : 0);
    expect(view.queryByText("כל כוכבי הזהב שלכם!") !== null).toBe(found === 5);
  });

  it("counts every gold star in the game and shows each board's three", () => {
    const config = gameConfig();
    const progress = recordSceneCompleted(emptyProgress("g"), "amazon", { variants: {}, order: ["a", "b", "c"], noHints: false, bonusFound: false }, 3);
    const { container, getByRole } = he(<Passport config={config} progress={progress} onMap={() => undefined} onOpen={() => undefined} />);
    expect(getByRole("img", { name: "3 מתוך 9 כוכבי זהב נאספו" })).toBeTruthy();
    expect(container.querySelector(".starmeter__fill")?.getAttribute("style")).toContain("width: 33%");
    const lit = [...container.querySelectorAll(".loot")].map((card) => card.querySelectorAll(".stars__slot.is-lit").length);
    expect(lit).toEqual([0, 3, 0]);
    // A completed board IS its three stars: the button keeps its plain name and the stars stay decoration.
    expect(getByRole("button", { name: "amazon — הושלם" }).querySelector(".loot__stars")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says so when every star has been collected", () => {
    const config = gameConfig();
    const done = { variants: {}, order: ["a", "b", "c"], noHints: false, bonusFound: false };
    const progress = ["newyork", "amazon", "paris"].reduce((p, slug) => recordSceneCompleted(p, slug, done, 3), emptyProgress("g"));
    const { container, getByText } = he(<Passport config={config} progress={progress} onMap={() => undefined} onOpen={() => undefined} />);
    expect(getByText("כל כוכבי הזהב שלכם!")).toBeTruthy();
    expect(container.querySelector(".starmeter__fill.is-full")).not.toBeNull();
  });
});
