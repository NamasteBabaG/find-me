import { describe, expect, it } from "vitest";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { emptyAdventureProgress, recordAdventureEvent } from "../../adventure/progress";
import { passportCeremony, passportPhoto, passportPhotoCrop, projectPassport } from "../passport";

const config = publicBeachDemo("en"), book = config.adventure!, board = book.boards[0]!;
const empty = () => emptyAdventureProgress(config.gameId, book);
function complete() {
  let progress = empty();
  for (const targetId of [...board.targetIds].reverse()) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "target-found", targetId, boardSlug: board.boardSlug, variant: "A" }).progress;
  return progress;
}
const media = (_board: string, kind: string, id: string) => `/only-authorized-crop/${kind}/${id}`;
describe("passport derives achievements from current product progress", () => {
  it("all six items without three finds do not earn a stamp or a child photograph", () => {
    let progress = empty();
    for (const d of board.discoveries) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "discovery-found", discoveryId: d.id, boardSlug: board.boardSlug }).progress;
    const page = projectPassport(config, progress, {}, media)[0]!.pages[0]!;
    expect(page.state).toBe("in-progress"); expect(page.photoUrl).toBeUndefined();
    expect(passportCeremony(progress, board.boardSlug)).toEqual({ stamp: false, discoveryIds: [] });
  });
  it("three finds earn a stamp without requiring a single discovery", () => {
    const progress = complete(), page = projectPassport(config, progress, {}, media)[0]!.pages[0]!;
    expect(page.state).toBe("stamped"); expect(page.photoUrl).toBeTruthy();
    expect(page.discoveries).toHaveLength(6); expect(page.discoveries.every(d => !d.collected)).toBe(true);
  });
  it("freezes the last first-time find as the photo and ignores replay duplicate events", () => {
    const progress = complete(), selected = passportPhoto(progress, board.boardSlug)!;
    expect(selected.targetId).toBe(board.targetIds[0]);
    const replay = recordAdventureEvent(progress, config.gameId, book, { kind: "target-found", boardSlug: board.boardSlug, targetId: board.targetIds[2]!, variant: "B" }).progress;
    expect(passportPhoto(replay, board.boardSlug)).toEqual(selected);
    expect(passportPhoto(progress, board.boardSlug, board.targetIds[1])!.targetId).toBe(board.targetIds[1]);
  });
  it("public projection has one selected image and no choices, source images, hidden hints or coordinates", () => {
    const page = projectPassport(config, complete(), {}, media, false)[0]!.pages[0]!;
    expect(page.photoChoices).toBeUndefined(); expect(page.playHref).toBeUndefined();
    const json = JSON.stringify(page);
    for (const secret of ["hitRect", "sprite", "assetId", "cardCrop", "hint", "targetImages", board.discoveries[0]!.hint, board.discoveries[0]!.name]) expect(json).not.toContain(secret);
  });
  it("acknowledging a stamp does not acknowledge undiscovered items, and later items award only themselves", () => {
    const progress = complete(), first = board.discoveries[0]!.id;
    expect(passportCeremony(progress, board.boardSlug)).toEqual({ stamp: true, discoveryIds: [] });
    const preference = { photoTargetId: null, stampSeen: true, seenDiscoveries: [] };
    expect(passportCeremony(progress, board.boardSlug, preference)).toEqual({ stamp: false, discoveryIds: [] });
    const next = recordAdventureEvent(progress, config.gameId, book, { kind: "discovery-found", boardSlug: board.boardSlug, discoveryId: first }).progress;
    expect(passportCeremony(next, board.boardSlug, preference)).toEqual({ stamp: false, discoveryIds: [first] });
    expect(passportPhoto(next, board.boardSlug)).toEqual(passportPhoto(progress, board.boardSlug));
  });
  it("context crops stay inside the art and contain the complete child footprint", () => {
    for (const hit of [{ x: 0, y: 0, w: .1, h: .2 }, { x: .9, y: .8, w: .1, h: .2 }, { x: .4, y: .4, w: .1, h: .2 }]) {
      const crop = passportPhotoCrop(hit, { width: 3840, height: 2160 });
      expect(crop.x).toBeGreaterThanOrEqual(0); expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.w).toBeLessThanOrEqual(1); expect(crop.y + crop.h).toBeLessThanOrEqual(1);
      expect(crop.x).toBeLessThanOrEqual(hit.x); expect(crop.y).toBeLessThanOrEqual(hit.y);
      expect(crop.x + crop.w).toBeGreaterThanOrEqual(hit.x + hit.w); expect(crop.y + crop.h).toBeGreaterThanOrEqual(hit.y + hit.h);
    }
  });
});
