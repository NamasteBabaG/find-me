// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent } from "../../../domain/adventure/progress";
import { createMissionState } from "../../../domain/game/mission";
import { planScenePlay } from "../../../domain/game/replay";
import { GameI18nProvider } from "../../i18n";
import { AlbumSection } from "../Album";
import { SceneViewport, type Hit } from "../SceneViewport";

/**
 * The album as the child sees it, and the discovery as a tap of its own: the
 * missing card shows its hint, the collected card shows the picture's own
 * pixels, the postcard waits for every hiding spot, and a discovery under the
 * child loses the tap to her.
 */
const rig = vi.hoisted(() => ({ tap: (_x: number, _y: number) => {}, viewport: { transform: { tx: 0, ty: 0, scale: 0.5 }, viewport: { width: 800, height: 450 }, fit: 0.5, isDragging: false, bind: {}, reset() {}, focusOn() {}, zoomBy() {} } }));
vi.mock("../../engine/useViewport", () => ({ useViewport: (_ref: unknown, _stage: unknown, tap: typeof rig.tap) => { rig.tap = tap; return rig.viewport; } }));
vi.mock("next/image", () => ({ default: ({ unoptimized: _u, fill: _f, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) => <img {...props} alt="" /> }));

const fixture = adventureFixture(5);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const book = config.adventure!;
const scene = config.scenes[0]!;
const event = (e: AdventureEvent) => e;

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the album in the bag", () => {
  it("shows a missing card with its hint, a collected card with the picture, and what the postcard still needs", () => {
    let progress = emptyAdventureProgress(config.gameId, book);
    const empty = render(<GameI18nProvider locale="en"><AlbumSection config={config} album={progress} mode="guest" state="idle" /></GameI18nProvider>);
    const missing = empty.container.querySelector("[data-discovery=cat]")!;
    expect(missing.getAttribute("data-collected")).toBe("false");
    expect(missing.textContent).toContain("Hint: Look beside the basket");
    expect(missing.querySelector(".album__crop")).toBeNull();
    expect(empty.container.querySelector("[data-postcard-remaining]")?.getAttribute("data-postcard-remaining")).toBe("5");
    expect(empty.container.querySelector(".album__sync")?.textContent).toBe("Kept in this browser only");
    expect(empty.container.querySelector(".album__note")?.textContent).toContain("Three finds open the next place");
    cleanup();
    progress = recordAdventureEvent(progress, config.gameId, book, event({ kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" })).progress;
    for (const id of ["hide-1", "hide-2", "hide-3"]) progress = recordAdventureEvent(progress, config.gameId, book, event({ kind: "target-found", boardSlug: "pilot-test", targetId: id, variant: "B" })).progress;
    const some = render(<GameI18nProvider locale="he"><AlbumSection config={config} album={progress} mode="owner" state="saved" /></GameI18nProvider>);
    const got = some.container.querySelector("[data-discovery=cat]")!;
    expect(got.getAttribute("data-collected")).toBe("true");
    expect(got.textContent).toContain("Basket cat");
    const crop = got.querySelector<HTMLElement>(".album__crop")!;
    expect(crop.style.backgroundImage).toContain(scene.art.base);
    expect(crop.style.backgroundSize).toContain(`${100 / 0.14}%`);
    // Three finds: the next place is open, the postcard is not earned.
    expect(some.container.querySelector("[data-postcard-remaining]")?.textContent).toContain("עוד 2 מחבואים לגלויה");
    expect(some.container.querySelector(".album__sync")?.textContent).toBe("נשמר בחשבון המשפחה");
  });

  it("shows the postcard, from the first find's own patch, once every hiding spot is found", () => {
    let progress = emptyAdventureProgress(config.gameId, book);
    for (const id of ["hide-1", "hide-2", "hide-3", "hide-4", "hide-5"]) progress = recordAdventureEvent(progress, config.gameId, book, event({ kind: "target-found", boardSlug: "pilot-test", targetId: id, variant: "A" })).progress;
    const view = render(<GameI18nProvider locale="en"><AlbumSection config={config} album={progress} mode="owner" state="offline" /></GameI18nProvider>);
    expect(view.container.querySelector("[data-postcard-remaining]")).toBeNull();
    const postcard = view.container.querySelector(".album__postcard")!;
    expect(postcard.querySelector(".postcard__title")?.textContent).toBe("My market adventure");
    const patch = postcard.querySelector<HTMLImageElement>(".postcard__patch")!;
    expect(patch.getAttribute("src")).toBe(scene.targets[0]!.sprite.kind === "image" ? scene.targets[0]!.sprite.url : "");
    expect(view.container.querySelector(".album__sync")?.textContent).toContain("Not saved to the account yet");
  });

  it("says when this browser's album could not be read, instead of showing an empty one", () => {
    const view = render(<GameI18nProvider locale="en"><AlbumSection config={config} album={null} mode="guest" state="unreadable" /></GameI18nProvider>);
    expect(view.container.querySelector(".album__sync")?.textContent).toContain("could not be read");
    expect(view.container.querySelectorAll("[data-discovery]")).toHaveLength(1);
    cleanup();
    // A browser that would not write says so, for a guest and for an owner alike.
    const unsaved = render(<GameI18nProvider locale="he"><AlbumSection config={config} album={emptyAdventureProgress(config.gameId, book)} mode="guest" state="unsaved" /></GameI18nProvider>);
    expect(unsaved.container.querySelector(".album__sync")?.textContent).toBe("ההתקדמות זמינה כרגע בלבד ולא נשמרה במכשיר");
  });
});

describe("a discovery on the board", () => {
  function mount(discoveries: readonly { id: string; hitRect: { x: number; y: number; w: number; h: number } }[] = book.boards[0]!.discoveries) {
    const hits: Hit[] = [];
    const mission = createMissionState(scene.slug, planScenePlay(scene, { plays: 0, lastVariants: {}, lastOrder: [] }, config.gameId), { playMode: "find-any", findsRequiredToAdvance: 3, found: {} });
    render(<GameI18nProvider locale="en"><SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} discoveries={discoveries} onHit={(h) => hits.push(h)} /></GameI18nProvider>);
    return { hits, mission };
  }
  it("is its own hit, with a padded reach, and a miss elsewhere", () => {
    const { hits } = mount();
    const cat = book.boards[0]!.discoveries[0]!.hitRect;
    rig.tap(cat.x + cat.w / 2, cat.y + cat.h / 2);
    rig.tap(cat.x - 0.005, cat.y + cat.h / 2);
    rig.tap(0.02, 0.02);
    expect(hits.map((h) => h.kind)).toEqual(["discovery", "discovery", "miss"]);
    expect(hits[0]).toEqual({ kind: "discovery", id: "cat" });
  });
  it("loses the tap to the child she shares it with", () => {
    const { hits, mission } = mount([{ id: "under-her", hitRect: { x: 0, y: 0.4, w: 0.7, h: 0.5 } }]);
    const first = mission.plan.order[0]!;
    const target = scene.targets.find((t) => t.id === first)!;
    const rect = target.sprite.kind === "image" ? target.sprite.hitRect! : { x: 0, y: 0, w: 0, h: 0 };
    rig.tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
    expect(hits[0]).toEqual({ kind: "target", id: first });
  });
});
