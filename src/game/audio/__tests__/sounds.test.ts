// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindGameAudio, SoundManager } from "../sounds";

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn();
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeNode {
  gain = new FakeParam(); frequency = new FakeParam(); Q = new FakeParam();
  type = "sine"; loop = false; buffer: unknown;
  connect = vi.fn((node: unknown) => node);
  disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state = "suspended";
  currentTime = 10; sampleRate = 20;
  destination = new FakeNode();
  gains: FakeNode[] = []; oscillators: FakeNode[] = []; sources: FakeNode[] = [];
  constructor() { contexts.push(this); }
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  createGain() { const node = new FakeNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new FakeNode(); this.sources.push(node); return node; }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
}
const settled = async () => { await Promise.resolve(); await Promise.resolve(); };
let manager: SoundManager;
beforeEach(() => {
  vi.useFakeTimers(); contexts.length = 0; manager = new SoundManager();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("mobile audio unlock, interruption and lifecycle", () => {
  it("does not create a context or play autoplay audio merely by mounting or starting a scene", () => {
    const element = document.createElement("div"), cleanup = bindGameAudio(element, manager);
    manager.startAmbient("waves"); manager.play("success");
    expect(contexts).toHaveLength(0); cleanup();
  });

  it("calls resume synchronously inside touch-end capture, before a child handler runs", async () => {
    const element = document.createElement("div"), button = document.createElement("button"); element.append(button);
    const cleanup = bindGameAudio(element, manager);
    button.addEventListener("touchend", () => expect(contexts[0]!.resume).toHaveBeenCalledTimes(1));
    button.dispatchEvent(new Event("touchend", { bubbles: true }));
    expect(contexts).toHaveLength(1); await settled(); cleanup();
  });

  it.each(["pointerup", "click"])("retries Safari interrupted audio from %s instead of ignoring it", async type => {
    manager.unlock(); await settled();
    const ctx = contexts[0]!; ctx.state = "interrupted"; ctx.resume.mockClear();
    const element = document.createElement("div"), cleanup = bindGameAudio(element, manager);
    await settled(); ctx.state = "interrupted"; ctx.resume.mockClear();
    element.dispatchEvent(new Event(type, { bubbles: true }));
    expect(ctx.resume).toHaveBeenCalledTimes(1); await settled();
    manager.play("success"); expect(ctx.oscillators.length).toBeGreaterThan(1); cleanup();
  });

  it("waits for running before scheduling a fresh cue, then plays it exactly once", async () => {
    manager.unlock(); await settled();
    const ctx = contexts[0]!; ctx.state = "suspended";
    let resolve!: () => void;
    ctx.resume.mockImplementation(() => new Promise<void>(done => { resolve = () => { ctx.state = "running"; done(); }; }));
    manager.unlock(); manager.play("tap");
    expect(ctx.oscillators).toHaveLength(0);
    resolve(); await settled(); expect(ctx.oscillators).toHaveLength(1);
    manager.resume(); expect(ctx.oscillators).toHaveLength(1);
  });

  it("handles a rejected resume without an unhandled rejection and retries on the next gesture", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!; ctx.state = "interrupted";
    ctx.resume.mockRejectedValueOnce(new DOMException("Permission needed", "NotAllowedError"));
    manager.unlock(); manager.play("tap"); await settled();
    expect(ctx.oscillators).toHaveLength(0);
    manager.unlock(); await settled(); expect(ctx.state).toBe("running"); expect(ctx.oscillators).toHaveLength(1);
  });

  it("retries a pending non-gesture resume in the actual gesture instead of waiting forever", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!; ctx.state = "suspended";
    ctx.resume.mockImplementationOnce(() => new Promise<void>(() => {}));
    manager.resume(); const count = ctx.resume.mock.calls.length;
    manager.unlock(); await settled(); expect(ctx.resume).toHaveBeenCalledTimes(count + 1); expect(ctx.state).toBe("running");
  });

  it("recreates a closed context only at a gesture and restores the requested ambience", async () => {
    manager.unlock(); await settled(); manager.startAmbient("waves"); const first = contexts[0]!;
    first.state = "closed"; manager.resume(); expect(contexts).toHaveLength(1);
    manager.unlock(); await settled(); expect(contexts).toHaveLength(2);
    expect(first.sources[0]!.stop).toHaveBeenCalledTimes(1);
    expect(first.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
    expect(contexts[1]!.sources).toHaveLength(1); manager.stopAmbient();
  });

  it("preserves mute across gestures and lifecycle recovery without raising the existing gain", async () => {
    manager.setMuted(true); manager.unlock(); manager.startAmbient("waves"); manager.resume();
    expect(contexts).toHaveLength(0);
    manager.setMuted(false); manager.unlock(); await settled(); const ctx = contexts[0]!;
    expect(ctx.gains[0]!.gain.value).toBe(0.5);
    manager.setMuted(true); ctx.state = "interrupted"; ctx.resume.mockClear();
    manager.resume(); manager.unlock(); manager.play("success");
    expect(ctx.resume).not.toHaveBeenCalled(); expect(manager.muted).toBe(true);
    expect(ctx.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.02);
    manager.stopAmbient();
  });

  it.each(["mute", "hidden", "expired"])("does not replay stale cue after %s", async reason => {
    manager.unlock(); await settled(); const ctx = contexts[0]!; ctx.state = "suspended";
    manager.play("success"); manager.play("tap");
    if (reason === "mute") { manager.setMuted(true); manager.setMuted(false); }
    if (reason === "hidden") { manager.suspend(); await settled(); manager.resume(); }
    if (reason === "expired") vi.advanceTimersByTime(1001);
    manager.unlock(); await settled(); expect(ctx.oscillators).toHaveLength(0);
  });

  it("retains only the latest current cue while resume is pending", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!; ctx.state = "interrupted";
    manager.play("success"); manager.play("fanfare"); manager.play("tap");
    manager.unlock(); await settled(); expect(ctx.oscillators).toHaveLength(1);
  });

  it("cancels already scheduled fanfare notes on hide instead of resuming an old celebration later", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    manager.play("fanfare"); const scheduled = [...ctx.oscillators];
    expect(scheduled.length).toBeGreaterThan(1);
    manager.suspend(); await settled();
    for (const node of scheduled) { expect(node.stop).toHaveBeenCalledTimes(2); expect(node.disconnect).toHaveBeenCalledTimes(1); }
    manager.resume(); await settled(); expect(ctx.oscillators).toHaveLength(scheduled.length);
    manager.play("tap"); expect(ctx.oscillators).toHaveLength(scheduled.length + 1);
  });

  it("uses the WebKit constructor when the standard constructor is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined); vi.stubGlobal("webkitAudioContext", FakeAudioContext);
    manager.unlock(); await settled(); expect(contexts).toHaveLength(1); expect(contexts[0]!.state).toBe("running");
  });

  it("suspends across pagehide and respects visibility and keyboard activation", async () => {
    const element = document.createElement("div"), cleanup = bindGameAudio(element, manager);
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); expect(contexts).toHaveLength(0);
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settled(); const ctx = contexts[0]!;
    window.dispatchEvent(new Event("pagehide")); await settled(); expect(ctx.state).toBe("suspended");
    manager.play("success"); expect(ctx.oscillators).toHaveLength(0);
    window.dispatchEvent(new Event("pageshow")); await settled(); expect(ctx.state).toBe("running");
    cleanup(); const calls = ctx.resume.mock.calls.length;
    element.dispatchEvent(new Event("touchend", { bubbles: true })); window.dispatchEvent(new Event("pageshow"));
    expect(ctx.resume).toHaveBeenCalledTimes(calls);
  });

  it("stops and disconnects the ambient source AND its modulation oscillator", async () => {
    manager.unlock(); await settled(); manager.startAmbient("waves"); const ctx = contexts[0]!;
    manager.startAmbient("jungle"); vi.advanceTimersByTime(800);
    expect(ctx.sources[0]!.stop).toHaveBeenCalledTimes(1); expect(ctx.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
    expect(ctx.oscillators[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(ctx.sources[1]!.stop).not.toHaveBeenCalled();
    manager.stopAmbient(); vi.advanceTimersByTime(800);
    expect(ctx.sources[1]!.stop).toHaveBeenCalledTimes(1); expect(ctx.oscillators[1]!.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps construction and closed-context suspension failures out of the game", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Audio device unavailable"); } });
    expect(() => manager.unlock()).not.toThrow();
    vi.stubGlobal("AudioContext", FakeAudioContext); manager.unlock(); await settled(); const ctx = contexts[0]!;
    ctx.suspend.mockRejectedValueOnce(new Error("Device interrupted")); manager.suspend(); await settled();
    ctx.state = "closed"; expect(() => manager.suspend()).not.toThrow();
  });
});
