import { describe, expect, it } from "vitest";
import { guestConfig } from "@/services/__tests__/guest-sharing-fixture";
import { emptyGuestSnapshot, guestBoardStates, guestWorldConfig, guestWorldEligible, mergeGuestSnapshot, type GuestSnapshot } from "../guest-sharing";

const config = guestWorldConfig(guestConfig(), "world-1");
const find = (targetId: string, sceneSlug = "board-1-1") => ({ sceneSlug, targetId, variant: "A" as const });
const event = (partial: Partial<GuestSnapshot>) => ({ ...emptyGuestSnapshot(), ...partial });
describe("independent guest snapshot rules", () => {
  it("freezes exactly one nine-board world and strips the gift and other book chapters", () => {
    expect(config.scenes).toHaveLength(9); expect(config.worlds?.map(w => w.slug)).toEqual(["world-1"]);
    expect(config.adventure?.boards).toHaveLength(9); expect(config).not.toHaveProperty("gift");
    expect(() => guestWorldConfig(guestConfig(), "world-missing")).toThrow("unavailable");
    const broken = guestConfig(); broken.worlds![0]!.nodes[8] = broken.worlds![0]!.nodes[0]!;
    expect(() => guestWorldConfig(broken, "world-1")).toThrow("unavailable");
  });
  it("an actual ready visit has no finds; untouched boards remain unvisited", () => {
    const result = mergeGuestSnapshot(config, emptyGuestSnapshot(), event({ visited: ["board-1-1"] }));
    const boards = guestBoardStates(config, result.snapshot);
    expect(boards[0]?.state).toBe("visited"); expect(boards[0]?.finds).toBe(0); expect(boards[1]?.state).toBe("unvisited");
  });
  it("sharing eligibility supports bookless find-any games but hides historical serial and incomplete worlds", () => {
    const bookless = guestConfig(); delete bookless.adventure;
    expect(guestWorldEligible(bookless, "world-1")).toBe(true);
    expect(guestWorldConfig(bookless, "world-1").adventure).toBeUndefined();
    delete bookless.scenes[0]!.playMode;
    expect(guestWorldEligible(bookless, "world-1")).toBe(false);
    expect(guestWorldEligible(bookless, "world-2")).toBe(true);
    expect(() => guestWorldConfig(bookless, "world-1")).toThrow("unavailable");
    expect(guestWorldEligible(bookless, "unknown")).toBe(false);
    bookless.scenes.pop();
    expect(guestWorldEligible(bookless, "world-2")).toBe(false);
  });
  it("distinct finds are sets, preserve the first variant, and retry identically", () => {
    const result = mergeGuestSnapshot(config, emptyGuestSnapshot(), event({ finds: [find("hide-1"), find("hide-1")] }));
    expect(result.snapshot.finds).toHaveLength(1);
    expect(mergeGuestSnapshot(config, result.snapshot, result.snapshot).changed).toBe(false);
    expect(mergeGuestSnapshot(config, result.snapshot, event({ finds: [{ ...find("hide-1"), variant: "B" }] })).changed).toBe(false);
  });
  it("stale snapshots union without erasing finds or discoveries", () => {
    const first = mergeGuestSnapshot(config, emptyGuestSnapshot(), event({ finds: [find("hide-1")], discoveries: [{ sceneSlug: "board-1-1", discoveryId: "cat" }] })).snapshot;
    const second = mergeGuestSnapshot(config, first, event({ finds: [find("hide-2")] })).snapshot;
    expect(second.finds).toHaveLength(2); expect(second.discoveries).toHaveLength(1);
  });
  it("rejects unknown targets, foreign worlds, client completion flags and premature reactions", () => {
    for (const input of [event({ finds: [find("unknown")] }), event({ visited: ["board-2-1"] }), event({ reactionId: "wow" }), { ...event({}), complete: true }]) {
      expect(() => mergeGuestSnapshot(config, emptyGuestSnapshot(), input)).toThrow("invalid-event");
    }
  });
  it("future-board events require the real previous-board find threshold", () => {
    expect(() => mergeGuestSnapshot(config, emptyGuestSnapshot(), event({ visited: ["board-1-2"] }))).toThrow("invalid-event");
    const ready = event({ finds: [find("hide-1"), find("hide-2"), find("hide-3")], visited: ["board-1-2"] });
    expect(mergeGuestSnapshot(config, emptyGuestSnapshot(), ready).snapshot.visited).toEqual(["board-1-1", "board-1-2"]);
  });
  it("one predefined reaction is recorded after all shipped finds, independent of optional discoveries", () => {
    const done = event({ finds: config.scenes.flatMap(scene => scene.targets.map(target => find(target.id, scene.slug))), reactionId: "loved" });
    const result = mergeGuestSnapshot(config, emptyGuestSnapshot(), done);
    expect(result.snapshot.finds).toHaveLength(27); expect(result.snapshot.reactionId).toBe("loved");
    const retry = mergeGuestSnapshot(config, result.snapshot, { ...done, reactionId: "again" });
    expect(retry.changed).toBe(false); expect(retry.snapshot.reactionId).toBe("loved");
    const withDiscovery = mergeGuestSnapshot(config, result.snapshot, event({ reactionId: "again", discoveries: [{ sceneSlug: "board-1-1", discoveryId: "cat" }] }));
    expect(withDiscovery.changed).toBe(true); expect(withDiscovery.snapshot.reactionId).toBe("loved");
    expect(withDiscovery.snapshot.discoveries).toHaveLength(1);
    expect(() => mergeGuestSnapshot(config, result.snapshot, event({ reactionId: "again", finds: [find("unknown")] }))).toThrow("invalid-event");
  });
});
