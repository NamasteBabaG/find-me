import { describe, expect, it } from "vitest";
import { readMutePreference, writeMutePreference } from "../mute-preference";
import { SoundManager } from "../sounds";

describe("server-safe audio preference", () => {
  it("does not access browser storage or create audio during server rendering", () => {
    expect(typeof window).toBe("undefined");
    expect(readMutePreference()).toBeNull(); expect(() => writeMutePreference(true)).not.toThrow();
    const manager = new SoundManager(); manager.setMuted(true);
    expect(manager.restoreMutePreference()).toBe(true); expect(() => manager.unlock()).not.toThrow();
  });
});
