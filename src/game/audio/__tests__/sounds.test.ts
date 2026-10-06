// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindGameAudio, SoundManager } from "../sounds";
import { MUTE_PREFERENCE_KEY } from "../mute-preference";

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
  onended: (() => void) | null = null;
}
const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state = "suspended";
  currentTime = 10; sampleRate = 20;
  destination = new FakeNode();
  gains: FakeNode[] = []; oscillators: FakeNode[] = []; sources: FakeNode[] = []; filters: FakeNode[] = [];
  constructor() { contexts.push(this); }
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createGain() { const node = new FakeNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new FakeNode(); this.sources.push(node); return node; }
  createBiquadFilter() { const node = new FakeNode(); this.filters.push(node); return node; }
  createBuffer = vi.fn((_channels: number, length: number) => {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  });
}
const settled = async () => { await Promise.resolve(); await Promise.resolve(); };
let manager: SoundManager;
beforeEach(() => {
  vi.useFakeTimers(); contexts.length = 0; manager = new SoundManager();
  localStorage.clear();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("mobile audio unlock, interruption and lifecycle", () => {
  it("restores a deliberate mute after reload without creating audio, and keeps explicit unmute for the next reload", async () => {
    manager.setMuted(true);
    const reloaded = new SoundManager();
    expect(reloaded.restoreMutePreference()).toBe(true); reloaded.unlock();
    expect(contexts).toHaveLength(0);
    reloaded.setMuted(false); reloaded.unlock(); await settled();
    expect(contexts).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(MUTE_PREFERENCE_KEY)!)).toEqual({ version: 1, muted: false });
    expect(new SoundManager().restoreMutePreference()).toBe(false);
  });

  it.each(["{broken", '{"version":2,"muted":false}', '{"version":1,"muted":"false"}', '{"version":1,"muted":false,"extra":true}'])
    ("does not overwrite the current mute with malformed/stale preference %s", value => {
      manager.setMuted(true); localStorage.setItem(MUTE_PREFERENCE_KEY, value);
      expect(manager.restoreMutePreference()).toBe(true);
    });

  it("storage failure cannot break mute or unlock, or erase a user's current choice", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect(() => manager.setMuted(true)).not.toThrow(); expect(manager.restoreMutePreference()).toBe(true);
    manager.unlock(); expect(contexts).toHaveLength(0);
  });

  it("updates subscribed mute widgets and unsubscribes without changing sound preference", () => {
    const a = vi.fn(), b = vi.fn(), stopA = manager.subscribeMuted(a), stopB = manager.subscribeMuted(b);
    manager.setMuted(true); expect(a).toHaveBeenCalledWith(true); expect(b).toHaveBeenCalledWith(true);
    stopA(); manager.setMuted(false); expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenLastCalledWith(false);
    stopB(); manager.setMuted(true); expect(b).toHaveBeenCalledTimes(2);
  });

  it("one shell unmount cannot silence another, and repeated old cleanup cannot silence a replacement", async () => {
    const first = document.createElement("div"), second = document.createElement("div");
    const stopFirst = bindGameAudio(first, manager), stopSecond = bindGameAudio(second, manager);
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    stopFirst(); expect(ctx.suspend).not.toHaveBeenCalled();
    second.dispatchEvent(new Event("click", { bubbles: true })); manager.play("tap");
    expect(ctx.oscillators).toHaveLength(1);
    stopSecond(); await settled(); expect(ctx.suspend).toHaveBeenCalledTimes(1);
    const replacement = document.createElement("div"), stopReplacement = bindGameAudio(replacement, manager); await settled();
    stopFirst(); stopSecond(); expect(ctx.state).toBe("running"); expect(ctx.suspend).toHaveBeenCalledTimes(1);
    replacement.dispatchEvent(new Event("touchend", { bubbles: true })); manager.play("tap");
    expect(ctx.oscillators).toHaveLength(2); stopReplacement();
  });

  it("varies finds with the board, gives drawer/page feedback, and keeps all new cues silent when muted", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    vi.spyOn(Math, "random").mockReturnValue(.1);
    manager.setScene("giza"); manager.play("discovery");
    const wooden = ctx.oscillators.map(n => [n.type, n.frequency.value]);
    manager.setScene("antarctica"); manager.play("discovery");
    expect(ctx.oscillators.slice(3).map(n => [n.type, n.frequency.value])).not.toEqual(wooden);
    manager.play("drawer"); manager.play("page");
    expect(ctx.sources).toHaveLength(1);
    const count = ctx.oscillators.length;
    manager.setMuted(true); manager.play("drawer"); manager.play("page"); manager.play("discovery");
    expect(ctx.oscillators).toHaveLength(count); expect(ctx.sources).toHaveLength(1);
  });
  it("plays one short paper-stamp impact only after unlock and respects mute", async () => {
    manager.play("stamp"); expect(contexts).toHaveLength(0);
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    manager.play("stamp");
    expect(ctx.oscillators).toHaveLength(1); expect(ctx.sources).toHaveLength(1);
    expect(ctx.oscillators[0]!.stop.mock.calls[0]![0]).toBeLessThan(10.3);
    manager.setMuted(true); manager.play("stamp");
    expect(ctx.oscillators).toHaveLength(1); expect(ctx.sources).toHaveLength(1);
  });
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

  it("leaves ambience allocation out of gesture capture and schedules the first tap immediately", async () => {
    const element = document.createElement("div"), button = document.createElement("button"); element.append(button);
    const cleanup = bindGameAudio(element, manager);
    manager.startAmbient("waves");
    button.addEventListener("touchend", () => {
      manager.play("tap");
      expect(contexts[0]!.createBuffer).not.toHaveBeenCalled();
      expect(contexts[0]!.oscillators).toHaveLength(1);
    });
    button.dispatchEvent(new Event("touchend", { bubbles: true }));
    await settled(); const ctx = contexts[0]!;
    expect(ctx.createBuffer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1); expect(ctx.sources).toHaveLength(1);
    cleanup();
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

  it("plays resumed feedback before deferred ambience and preserves its pitch", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    ctx.state = "suspended";
    let resolve!: () => void;
    ctx.resume.mockImplementation(() => new Promise<void>(done => { resolve = () => { ctx.state = "running"; done(); }; }));
    vi.spyOn(Math, "random").mockReturnValue(.1);
    manager.startAmbient("waves"); manager.unlock(); manager.play("star", { pitch: 7 });
    resolve(); await settled();
    expect(ctx.createBuffer).not.toHaveBeenCalled();
    expect(ctx.oscillators[0]!.frequency.value).toBeCloseTo(1318.51 * 2 ** ((7 - .4) / 12));
    vi.advanceTimersByTime(0); expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    manager.stopAmbient();
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
    manager.unlock(); await settled(); manager.startAmbient("waves"); vi.advanceTimersByTime(0); const first = contexts[0]!;
    first.state = "closed"; manager.resume(); expect(contexts).toHaveLength(1);
    manager.unlock(); await settled(); vi.advanceTimersByTime(0); expect(contexts).toHaveLength(2);
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
    manager.unlock(); await settled(); manager.startAmbient("waves"); vi.advanceTimersByTime(0); const ctx = contexts[0]!;
    manager.startAmbient("jungle"); vi.advanceTimersByTime(800);
    expect(ctx.sources[0]!.stop).toHaveBeenCalledTimes(1); expect(ctx.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
    expect(ctx.oscillators[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(ctx.sources[1]!.stop).not.toHaveBeenCalled();
    manager.stopAmbient(); vi.advanceTimersByTime(800);
    expect(ctx.sources[1]!.stop).toHaveBeenCalledTimes(1); expect(ctx.oscillators[1]!.stop).toHaveBeenCalledTimes(1);
  });

  it("reuses noise samples across repeated cues and world ambience without reusing source nodes", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    manager.play("page"); manager.play("page"); manager.play("stamp"); manager.play("stamp");
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
    expect(ctx.sources).toHaveLength(4);
    expect(ctx.sources[0]!.buffer).toBe(ctx.sources[1]!.buffer);
    expect(ctx.sources[2]!.buffer).toBe(ctx.sources[3]!.buffer);
    manager.startAmbient("waves"); vi.advanceTimersByTime(0);
    manager.startAmbient("jungle"); vi.advanceTimersByTime(0);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(3);
    expect(ctx.sources[4]!.buffer).toBe(ctx.sources[5]!.buffer);
    manager.stopAmbient();
  });

  it.each(["stop", "mute", "suspend"])("cancels deferred ambience on %s and cannot start it later", async reason => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    manager.startAmbient("waves");
    if (reason === "stop") manager.stopAmbient();
    if (reason === "mute") manager.setMuted(true);
    if (reason === "suspend") manager.suspend();
    vi.advanceTimersByTime(0); expect(ctx.createBuffer).not.toHaveBeenCalled(); expect(ctx.sources).toHaveLength(0);
  });

  it("stops muted ambience while retaining its cue for a later explicit unmute", async () => {
    manager.unlock(); await settled(); manager.startAmbient("waves"); vi.advanceTimersByTime(0);
    const ctx = contexts[0]!, buffer = ctx.sources[0]!.buffer;
    manager.setMuted(true);
    expect(ctx.sources[0]!.stop).toHaveBeenCalledOnce(); expect(ctx.oscillators[0]!.stop).toHaveBeenCalledOnce();
    manager.setMuted(false); manager.unlock(); vi.advanceTimersByTime(0);
    expect(ctx.sources).toHaveLength(2); expect(ctx.sources[1]!.buffer).toBe(buffer);
    expect(ctx.createBuffer).toHaveBeenCalledOnce(); manager.stopAmbient();
  });

  it("allocates fresh noise buffers after a closed context is recreated", async () => {
    manager.unlock(); await settled(); const first = contexts[0]!;
    manager.play("page"); manager.startAmbient("waves"); vi.advanceTimersByTime(0);
    first.state = "closed";
    manager.unlock(); await settled(); manager.play("page"); vi.advanceTimersByTime(0);
    const second = contexts[1]!;
    expect(second.createBuffer).toHaveBeenCalledTimes(2);
    expect(second.sources[0]!.buffer).not.toBe(first.sources[0]!.buffer);
    expect(second.sources[1]!.buffer).not.toBe(first.sources[1]!.buffer);
    manager.stopAmbient();
  });

  it.each(["buffer", "gain", "start"])("contains a deferred ambient %s failure, releases partial nodes, and retries only explicitly", async fault => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    if (fault === "buffer") ctx.createBuffer.mockImplementationOnce(() => { throw new Error("Buffer unavailable"); });
    if (fault === "gain") vi.spyOn(ctx, "createGain").mockImplementationOnce(() => { throw new Error("Gain unavailable"); });
    if (fault === "start") vi.spyOn(ctx, "createOscillator").mockImplementationOnce(() => {
      const lfo = new FakeNode(); ctx.oscillators.push(lfo);
      lfo.start.mockImplementationOnce(() => { throw new Error("Start unavailable"); });
      return lfo;
    });
    manager.startAmbient("waves");
    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
    for (const source of [...ctx.sources, ...ctx.oscillators]) {
      expect(source.stop).toHaveBeenCalledOnce(); expect(source.disconnect).toHaveBeenCalledOnce();
    }
    for (const filter of ctx.filters) expect(filter.disconnect).toHaveBeenCalledOnce();
    if (fault === "start") expect(ctx.sources[0]!.start).toHaveBeenCalledOnce(); // Already started before the LFO failed.
    const allocations = ctx.createBuffer.mock.calls.length;
    for (let i = 0; i < 5; i += 1) manager.unlock();
    vi.advanceTimersByTime(0);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(allocations);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => manager.play("tap")).not.toThrow();
    expect(ctx.oscillators.at(-1)!.start).toHaveBeenCalledOnce();
    manager.startAmbient("waves"); vi.advanceTimersByTime(0);
    const recovered = ctx.sources.at(-1)!;
    expect(recovered.start).toHaveBeenCalledOnce(); expect(recovered.stop).not.toHaveBeenCalled();
    expect(() => manager.setMuted(true)).not.toThrow();
    expect(recovered.stop).toHaveBeenCalledOnce(); expect(manager.muted).toBe(true);
  });

  it.each(["buffer", "gain", "start", "scheduled stop"])("keeps a one-shot %s failure inside the kit and can play the next healthy cue", async fault => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    if (fault === "buffer") ctx.createBuffer.mockImplementationOnce(() => { throw new Error("Buffer unavailable"); });
    if (fault === "gain") vi.spyOn(ctx, "createGain").mockImplementationOnce(() => { throw new Error("Gain unavailable"); });
    if (fault === "start") vi.spyOn(ctx, "createBufferSource").mockImplementationOnce(() => {
      const source = new FakeNode(); ctx.sources.push(source);
      source.start.mockImplementationOnce(() => { throw new Error("Start unavailable"); });
      return source;
    });
    if (fault === "scheduled stop") vi.spyOn(ctx, "createOscillator").mockImplementationOnce(() => {
      const source = new FakeNode(); ctx.oscillators.push(source);
      source.stop.mockImplementationOnce(() => { throw new Error("Scheduled stop unavailable"); });
      return source;
    });
    expect(() => manager.play(fault === "gain" || fault === "scheduled stop" ? "tap" : "page")).not.toThrow();
    const failed = [...ctx.oscillators, ...ctx.sources];
    for (const source of failed) {
      expect(source.disconnect).toHaveBeenCalledOnce(); expect(source.onended).toBeNull();
    }
    for (const node of [...ctx.filters, ...ctx.gains.slice(1)]) expect(node.disconnect).toHaveBeenCalledOnce();
    expect(() => manager.play("tap")).not.toThrow();
    const healthy = ctx.oscillators.at(-1)!;
    expect(healthy.start).toHaveBeenCalledOnce(); expect(healthy.disconnect).not.toHaveBeenCalled();
    expect(() => manager.setMuted(true)).not.toThrow();
    expect(healthy.disconnect).toHaveBeenCalledOnce();
    for (const source of failed) expect(source.disconnect).toHaveBeenCalledOnce(); // No failed graph left tracked.
  });

  it("discards a context whose master allocation failed and retries on the next real unlock", async () => {
    vi.spyOn(FakeAudioContext.prototype, "createGain").mockImplementationOnce(() => { throw new Error("Master unavailable"); });
    expect(() => manager.unlock()).not.toThrow(); await settled();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    expect(() => manager.play("tap")).not.toThrow();
    manager.unlock(); await settled(); manager.play("tap");
    expect(contexts).toHaveLength(2); expect(contexts[1]!.oscillators[0]!.start).toHaveBeenCalledOnce();
  });

  it("keeps the mute choice and listeners working when gain automation or cleanup fails", async () => {
    manager.unlock(); await settled(); const ctx = contexts[0]!;
    manager.play("tap"); const source = ctx.oscillators[0]!;
    source.stop.mockImplementationOnce(() => { throw new Error("Device gone"); });
    source.disconnect.mockImplementationOnce(() => { throw new Error("Device gone"); });
    ctx.gains[0]!.gain.setTargetAtTime.mockImplementationOnce(() => { throw new Error("Device gone"); });
    const listener = vi.fn(); manager.subscribeMuted(listener);
    expect(() => manager.setMuted(true)).not.toThrow();
    expect(listener).toHaveBeenCalledWith(true); expect(manager.muted).toBe(true);
    expect(JSON.parse(localStorage.getItem(MUTE_PREFERENCE_KEY)!)).toEqual({ version: 1, muted: true });
    expect(ctx.gains[1]!.disconnect).toHaveBeenCalledOnce();
    expect(() => manager.suspend()).not.toThrow();
    manager.setMuted(false); manager.resume(); await settled(); manager.play("tap");
    expect(ctx.oscillators.at(-1)!.start).toHaveBeenCalledOnce();
  });

  it("keeps construction and closed-context suspension failures out of the game", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Audio device unavailable"); } });
    expect(() => manager.unlock()).not.toThrow();
    vi.stubGlobal("AudioContext", FakeAudioContext); manager.unlock(); await settled(); const ctx = contexts[0]!;
    ctx.suspend.mockRejectedValueOnce(new Error("Device interrupted")); manager.suspend(); await settled();
    ctx.state = "closed"; expect(() => manager.suspend()).not.toThrow();
  });
});
