import { describe, expect, it } from "vitest";
import { ProgressBatchInput } from "../progress-input";

const batch = (events: unknown[]) => ({ gameId: "game-synthetic-progress", anonymousSessionId: "session-synthetic", events });
const validEvent = { eventType: "target_found", sceneSlug: "newyork", targetId: "hide-1" };

describe("progress input resource bounds", () => {
  it("refuses an oversized array before reading any event", () => {
    const events = new Array(51);
    Object.defineProperty(events, 0, { get() { throw Error("Oversized event payload was visited"); } });
    expect(ProgressBatchInput.safeParse(batch(events)).success).toBe(false);
  });
  it("accepts the existing fifty-event boundary", () => {
    expect(ProgressBatchInput.safeParse(batch(Array.from({ length: 50 }, () => validEvent))).success).toBe(true);
  });
  it("still rejects an invalid event inside the boundary", () => {
    expect(ProgressBatchInput.safeParse(batch([{ eventType: "unknown" }])).success).toBe(false);
  });
});
