import type { SoundCue } from "@/domain/scene/schema";
import { readMutePreference, writeMutePreference } from "./mute-preference";

/**
 * Tiny synthesized sound kit (WebAudio). No audio files needed for the MVP;
 * every cue is a few oscillators/noise bursts. Swap for real samples later by
 * keeping the same `play(cue)` API.
 *
 * Every cue a child hears more than once has several voicings, and the kit
 * never plays the same one twice in a row: the third find of a board should
 * not sound like the first. Each voicing is also nudged a little in pitch, so
 * even the same phrase is never exactly the same phrase.
 *
 * Browsers block audio until a user gesture: call `unlock()` from the
 * "פתיחת ההרפתקה" button.
 */
type Ctx = AudioContext;
type KeepNode = <T extends AudioNode>(node: T) => T;

/**
 * What the kit can play: every cue a scene may ask for, plus the ones only
 * the renderer's own chrome plays. "star" belongs to the star tray, not to a
 * board, so it stays out of the scene schema.
 */
export type PlayCue = SoundCue | "star" | "stamp" | "discovery" | "drawer" | "page";
type SoundTheme = "default" | "forest" | "water" | "bells" | "wood" | "crystal" | "city";
const SCENE_THEMES: Record<string, SoundTheme> = {
  amazon: "forest", fairyforest: "forest", sydney: "water", underwater: "water",
  tokyo: "bells", greatwall: "bells", giza: "wood", marrakech: "wood",
  antarctica: "crystal", icepalace: "crystal", newyork: "city", paris: "city", cloudcity: "city",
};
const THEME_NOTES: Record<SoundTheme, readonly number[]> = {
  default: [523, 659, 784, 1047], forest: [659, 784, 988, 1175], water: [523, 698, 880, 1047],
  bells: [587, 740, 880, 1175], wood: [392, 494, 587, 784], crystal: [880, 1175, 1568, 1760], city: [523, 622, 784, 1047],
};

/** A note in a phrase: frequency, length, offset from the phrase start, voice and loudness. */
type Note = readonly [freq: number, dur: number, at: number, type: OscillatorType, vol: number];

/** Frequencies of the notes the phrases are written in (equal temperament, A4 = 440). */
const N = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
};

/** "Found!" — four short rising phrases. */
const SUCCESS: readonly (readonly Note[])[] = [
  [
    [N.C5, 0.12, 0, "sine", 0.35],
    [N.E5, 0.12, 0.1, "sine", 0.35],
    [N.G5, 0.2, 0.2, "sine", 0.4],
  ],
  [
    [N.D5, 0.1, 0, "triangle", 0.3],
    [N.G5, 0.1, 0.08, "triangle", 0.3],
    [N.B5, 0.1, 0.16, "triangle", 0.32],
    [N.D6, 0.24, 0.24, "sine", 0.38],
  ],
  [
    [N.G5, 0.16, 0, "sine", 0.34],
    [N.C6, 0.3, 0.14, "sine", 0.4],
    [N.E6, 0.3, 0.14, "sine", 0.12],
  ],
  [
    [N.E5, 0.09, 0, "sine", 0.3],
    [N.G5, 0.09, 0.07, "sine", 0.3],
    [N.C6, 0.09, 0.14, "sine", 0.32],
    [N.E6, 0.22, 0.21, "sine", 0.36],
    [N.G6, 0.22, 0.21, "sine", 0.1],
  ],
];

/** The board is done — three fanfares. */
const FANFARE: readonly (readonly Note[])[] = [
  [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6].map((f, i): Note => [f, 0.16, i * 0.12, i % 2 ? "triangle" : "sine", 0.4]),
  [N.G5, N.C6, N.E6, N.G6, N.E6, N.G6].map((f, i): Note => [f, 0.15, i * 0.11, i % 2 ? "sine" : "triangle", 0.38]),
  [
    [N.E5, 0.14, 0, "triangle", 0.36],
    [N.G5, 0.14, 0.12, "triangle", 0.36],
    [N.C6, 0.14, 0.24, "sine", 0.38],
    [N.E6, 0.3, 0.36, "sine", 0.4],
    [N.C6, 0.3, 0.36, "sine", 0.16],
    [N.G6, 0.3, 0.6, "sine", 0.34],
  ],
];

/**
 * A gold star landing in the tray — a bright two-note ding with a shimmer on
 * top. Three voicings; the finish card plays it once per star, each a few
 * semitones higher than the last (see `play`'s pitch option).
 */
const STAR: readonly (readonly Note[])[] = [
  [
    [N.E6, 0.09, 0, "sine", 0.3],
    [N.B5, 0.16, 0.07, "sine", 0.34],
    [N.E6, 0.22, 0.07, "triangle", 0.08],
    [N.G6, 0.3, 0.14, "sine", 0.18],
  ],
  [
    [N.G6, 0.08, 0, "sine", 0.28],
    [N.C7, 0.24, 0.06, "sine", 0.3],
    [N.E6, 0.24, 0.06, "triangle", 0.07],
  ],
  [
    [N.D6, 0.07, 0, "sine", 0.26],
    [N.A6, 0.1, 0.06, "sine", 0.3],
    [N.D6, 0.26, 0.12, "sine", 0.28],
    [N.A6, 0.26, 0.12, "triangle", 0.07],
  ],
];

/** A hint or a bonus — three sparkles. */
const TWINKLE: readonly (readonly Note[])[] = [
  [N.E6, N.G6, N.C7].map((f, i): Note => [f, 0.1, i * 0.07, "sine", 0.25]),
  [N.C7, N.G6, N.E6, N.G6].map((f, i): Note => [f, 0.09, i * 0.06, "sine", 0.22]),
  [N.D6, N.A6, N.D6, N.A6].map((f, i): Note => [f, 0.08, i * 0.065, "triangle", 0.2]),
];

export class SoundManager {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private ambient: { source: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode; filter: BiquadFilterNode; lfoGain: GainNode } | null = null;
  private ambientCue: SoundCue | undefined;
  private ambientTimer: ReturnType<typeof setTimeout> | undefined;
  private ambientFailed = false;
  private ambientBuffer: AudioBuffer | null = null;
  private noiseBuffers = new Map<number, AudioBuffer>();
  private paused = false;
  private pendingCue: { cue: PlayCue; pitch: number | undefined; requestedAt: number } | null = null;
  private oneShots = new Map<AudioScheduledSourceNode, () => void>();
  private _muted = false;
  private muteListeners = new Set<(muted: boolean) => void>();
  private theme: SoundTheme = "default";
  /** Which voicing each cue played last, so the next one is different. */
  private last: Partial<Record<PlayCue, number>> = {};

  get muted(): boolean {
    return this._muted;
  }
  setScene(slug: string): void { this.theme = SCENE_THEMES[slug] ?? "default"; }

  unlock(): void {
    if (typeof window === "undefined" || this.paused || this._muted) return;
    if (!this.ctx || this.ctx.state === "closed") {
      this.stopOneShots();
      this.pendingCue = null;
      this.cancelAmbientStart();
      this.releaseAmbient(false);
      this.ambientFailed = false;
      this.ambientBuffer = null;
      this.noiseBuffers.clear();
      if (this.master) this.releaseNodes([this.master], false);
      this.ctx = null;
      this.master = null;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      let ctx: Ctx | undefined, master: GainNode | undefined;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
      } catch {
        if (master) this.releaseNodes([master], false);
        try { if (ctx) void ctx.close().catch(() => {}); } catch { /* An unavailable device may also refuse close. */ }
        return;
      } // Audio availability must not stop the game.
    }
    // Safari can report "interrupted", not just "suspended". Retry here on
    // EACH genuine gesture, even if an earlier non-gesture resume is pending.
    this.resumeContext();
  }

  setMuted(muted: boolean): void {
    writeMutePreference(muted);
    this.applyMuted(muted);
  }

  /** Called after mount, never while constructing an SSR-rendered store. */
  restoreMutePreference(): boolean {
    const saved = readMutePreference();
    if (saved !== null) this.applyMuted(saved);
    return this._muted;
  }

  subscribeMuted(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => { this.muteListeners.delete(listener); };
  }

  private applyMuted(muted: boolean): void {
    const changed = this._muted !== muted;
    this._muted = muted;
    if (changed && !muted) this.ambientFailed = false;
    if (muted) {
      this.pendingCue = null;
      this.stopOneShots();
      this.cancelAmbientStart();
      this.releaseAmbient(false);
    }
    try {
      if (this.master && this.ctx && this.ctx.state !== "closed") this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    } catch { /* Still publish the chosen mute if the audio device has failed. */ }
    if (changed) for (const listener of this.muteListeners) listener(muted);
  }

  suspend(): void {
    this.paused = true;
    this.pendingCue = null;
    this.stopOneShots();
    this.cancelAmbientStart();
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    try { void ctx.suspend().catch(() => {}); } catch { /* Device already gone. */ }
  }

  resume(): void {
    this.paused = false;
    // Lifecycle events may resume an existing authorized context, never create
    // one. If the browser still requires a tap, the next gesture retries.
    this.resumeContext();
  }

  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx || this.paused || this._muted || ctx.state === "closed") return;
    if (ctx.state === "running") { this.audioReady(ctx); return; }
    try { void ctx.resume().then(() => this.audioReady(ctx)).catch(() => {}); }
    catch { /* A rejected resume remains retryable from the next gesture. */ }
  }

  private audioReady(ctx: Ctx): void {
    if (ctx !== this.ctx || ctx.state !== "running" || this.paused || this._muted) return;
    const pending = this.pendingCue;
    this.pendingCue = null;
    // Never replay a backlog of finds after an interruption or permission prompt.
    if (pending && Date.now() - pending.requestedAt <= 1000) this.play(pending.cue, { pitch: pending.pitch });
    this.scheduleAmbientStart();
  }

  /** `pitch` shifts a phrase by that many semitones — a row of stars climbs. */
  play(cue: PlayCue, options: { pitch?: number } = {}): void {
    if (!this.ctx || !this.master || this._muted || this.paused) return;
    if (this.ctx.state !== "running") {
      if (this.ctx.state !== "closed") this.pendingCue = { cue, pitch: options.pitch, requestedAt: Date.now() };
      return;
    }
    const t = this.ctx.currentTime;
    const shift = options.pitch ?? 0;
    switch (cue) {
      case "stamp":
        // A short rubber-on-paper thump, not another musical fanfare.
        this.sweep(180, 70, 0.10, t, "triangle", 0.3);
        this.noise(0.065, t, 1500, 0.20);
        break;
      case "star":
        this.phrase(STAR[this.pick(cue, STAR.length)]!, t, semitones(shift + between(-0.5, 0.5)));
        break;
      case "pop":
        this.blip(between(440, 640), 0.08, t, "sine", 0.4);
        break;
      case "tap":
        this.blip(between(250, 360), 0.05, t, "triangle", 0.16);
        break;
      case "success":
        if (this.theme === "default") this.phrase(SUCCESS[this.pick(cue, SUCCESS.length)]!, t, semitones(between(-2, 2)));
        else this.themedFind(cue, t);
        break;
      case "discovery":
        this.themedFind(cue, t);
        break;
      case "drawer":
        this.sweep(420, 660, 0.09, t, "sine", 0.14);
        this.blip(880, 0.1, t + .07, "sine", .12);
        break;
      case "page":
        this.noise(.13, t, 850, .1);
        break;
      case "fanfare":
        this.phrase(FANFARE[this.pick(cue, FANFARE.length)]!, t, semitones(between(-1, 1)));
        break;
      case "twinkle":
        this.phrase(TWINKLE[this.pick(cue, TWINKLE.length)]!, t, semitones(between(-1, 2)));
        break;
      case "boing": {
        const v = this.pick(cue, 3);
        if (v === 0) this.sweep(600, 150, 0.25, t, "sine", 0.4);
        else if (v === 1) {
          this.sweep(720, 220, 0.18, t, "sine", 0.38);
          this.sweep(520, 160, 0.2, t + 0.16, "sine", 0.3);
        } else this.sweep(480, 120, 0.32, t, "triangle", 0.34);
        break;
      }
      case "chirp":
        this.sweep(800, 1600, 0.12, t, "square", 0.15);
        this.sweep(800, 1600, 0.12, t + 0.15, "square", 0.15);
        break;
      case "splash":
        this.noise(0.3, t, 1200, 0.35);
        break;
      case "whoosh":
        this.noise(0.4, t, 400, 0.3);
        break;
      case "crowd":
        this.noise(0.9, t, 300, 0.25);
        break;
      case "waves":
      case "jungle":
      case "space":
        // ambient cues are started with startAmbient()
        break;
    }
  }

  startAmbient(cue: SoundCue | undefined): void {
    this.stopAmbient();
    this.ambientFailed = false;
    this.ambientCue = cue;
    this.scheduleAmbientStart();
  }

  private cancelAmbientStart(): void {
    clearTimeout(this.ambientTimer);
    this.ambientTimer = undefined;
  }

  private scheduleAmbientStart(): void {
    if (this.ambient || this.ambientFailed || this.ambientTimer !== undefined || !this.ambientCue || this._muted || this.paused || this.ctx?.state !== "running") return;
    const ctx = this.ctx;
    // A first gesture must schedule its feedback before filling an ambience
    // buffer. Leave capture and the game handler free to finish immediately.
    this.ambientTimer = setTimeout(() => {
      this.ambientTimer = undefined;
      if (ctx !== this.ctx || ctx.state !== "running" || this._muted || this.paused || !this.ambientCue) return;
      // An allocation failure must not escape this deferred task, or repeatedly
      // retry a large buffer on every tap. A new scene request/context retries.
      if (!this.createAmbient(this.ambientCue)) this.ambientFailed = true;
    }, 0);
  }

  private createAmbient(cue: SoundCue): boolean {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return false;
    const settings: Record<string, { freq: number; q: number; gain: number }> = {
      waves: { freq: 220, q: 0.6, gain: 0.08 },
      jungle: { freq: 900, q: 1.2, gain: 0.05 },
      space: { freq: 90, q: 2, gain: 0.06 },
      crowd: { freq: 300, q: 0.8, gain: 0.05 },
    };
    const s = settings[cue];
    if (!s) return true;
    // The filters and modulation give each world its character; their shared
    // two-second noise bed only needs to be allocated once per context.
    return this.createNodes(keep => {
      if (!this.ambientBuffer) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.ambientBuffer = buffer;
      }
      const source = keep(ctx.createBufferSource());
      source.buffer = this.ambientBuffer;
      source.loop = true;
      const filter = keep(ctx.createBiquadFilter());
      filter.type = "lowpass";
      filter.frequency.value = s.freq;
      filter.Q.value = s.q;
      const lfo = keep(ctx.createOscillator());
      lfo.frequency.value = cue === "waves" ? 0.12 : 0.05;
      const lfoGain = keep(ctx.createGain());
      lfoGain.gain.value = s.gain * 0.6;
      const gain = keep(ctx.createGain());
      gain.gain.value = s.gain;
      lfo.connect(lfoGain).connect(gain.gain);
      source.connect(filter).connect(gain).connect(master);
      source.start();
      lfo.start();
      this.ambient = { source, gain, lfo, filter, lfoGain };
    });
  }

  stopAmbient(): void {
    this.ambientCue = undefined;
    this.cancelAmbientStart();
    this.releaseAmbient(true);
  }

  private releaseAmbient(fade: boolean): void {
    if (!this.ambient) return;
    const { source, gain, lfo, filter, lfoGain } = this.ambient;
    this.ambient = null;
    const stop = () => this.releaseNodes([source, lfo, gain, filter, lfoGain], true);
    if (fade && this.ctx?.state === "running") {
      try { gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(stop, 800); }
      catch { stop(); }
    } else stop();
  }

  /** A voicing for this cue that is not the one it played last time. */
  private pick(cue: PlayCue, count: number): number {
    if (count < 2) return 0;
    const previous = this.last[cue];
    let next = Math.floor(Math.random() * count);
    if (next === previous) next = (next + 1 + Math.floor(Math.random() * (count - 1))) % count;
    this.last[cue] = next;
    return next;
  }

  private phrase(notes: readonly Note[], at: number, pitch: number): void {
    for (const [freq, dur, offset, type, vol] of notes) this.blip(freq * pitch, dur, at + offset, type, vol);
  }
  private themedFind(cue: "success" | "discovery", at: number): void {
    const notes = THEME_NOTES[this.theme], variant = this.pick(cue, 3);
    const order = variant === 0 ? [0, 1, 3] : variant === 1 ? [1, 2, 3] : [2, 1, 3];
    const voice = this.theme === "wood" || this.theme === "city" ? "triangle" : "sine";
    const pitch = semitones(between(-.5, .5));
    order.forEach((index, i) => this.blip(notes[index]! * pitch, i === 2 ? .22 : .09, at + i * .085, voice, cue === "discovery" ? .22 : .3));
    if (this.theme === "forest") this.sweep(1100, 1700, .07, at + .22, "sine", .08);
    if (this.theme === "water") this.blip(notes[0]! / 2, .13, at, "sine", .13);
  }

  private trackOneShot(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      this.releaseNodes([source, ...nodes], false);
    };
    source.onended = cleanup;
    this.oneShots.set(source, cleanup);
  }

  /** Allocate a graph transactionally. Partial or already-started sources are
   * stopped and detached when a device refuses an allocation/connect/start. */
  private createNodes(build: (keep: KeepNode) => void): boolean {
    const nodes: AudioNode[] = [];
    try { build(node => { nodes.push(node); return node; }); return true; }
    catch { this.releaseNodes(nodes, true); return false; }
  }

  private releaseNodes(nodes: readonly AudioNode[], stop: boolean): void {
    for (const node of nodes) {
      const source = node as AudioScheduledSourceNode;
      if (typeof source.stop === "function") {
        source.onended = null;
        this.oneShots.delete(source);
        if (stop) try { source.stop(); } catch { /* Not started, already ended or device gone. */ }
      }
      try { node.disconnect(); } catch { /* Cleanup must tolerate a failed/closed device too. */ }
    }
  }

  private stopOneShots(): void {
    for (const [source, cleanup] of this.oneShots) {
      try { source.stop(); } catch { /* Already ended. */ }
      cleanup();
    }
  }

  private blip(freq: number, dur: number, at: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    this.createNodes(keep => {
      const osc = keep(ctx.createOscillator());
      const gain = keep(ctx.createGain());
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(master);
      this.trackOneShot(osc, [gain]);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    });
  }

  private sweep(from: number, to: number, dur: number, at: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    this.createNodes(keep => {
      const osc = keep(ctx.createOscillator());
      const gain = keep(ctx.createGain());
      osc.type = type;
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + dur);
      gain.gain.setValueAtTime(vol, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(master);
      this.trackOneShot(osc, [gain]);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    });
  }

  private noise(dur: number, at: number, cutoff: number, vol: number): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    this.createNodes(keep => {
      // There are five fixed noise lengths in the cue kit. Reuse their samples,
      // but create fresh source/filter/gain nodes for independently timed cues.
      let buffer = this.noiseBuffers.get(dur);
      if (!buffer) {
        buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        this.noiseBuffers.set(dur, buffer);
      }
      const src = keep(ctx.createBufferSource());
      src.buffer = buffer;
      const filter = keep(ctx.createBiquadFilter());
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      const gain = keep(ctx.createGain());
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(master);
      this.trackOneShot(src, [filter, gain]);
      src.start(at);
    });
  }
}

/** A random number in [lo, hi). */
function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** The frequency ratio of `n` semitones. */
function semitones(n: number): number {
  return Math.pow(2, n / 12);
}

let shared: SoundManager | null = null;
const bindings = new WeakMap<SoundManager, Set<symbol>>();
export function sounds(): SoundManager {
  if (!shared) shared = new SoundManager();
  return shared;
}

/** Scope gesture unlock and page lifecycle to the mounted game, including
 * gift/map screens and returning mobile tabs. No sound is played by the hook. */
export function bindGameAudio(element: HTMLElement, manager = sounds()): () => void {
  const owners = bindings.get(manager) ?? new Set<symbol>(), owner = Symbol("game-audio");
  owners.add(owner); bindings.set(manager, owners);
  let disposed = false;
  manager.restoreMutePreference();
  const gesture = () => manager.unlock();
  const click = (event: Event) => {
    manager.unlock();
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a[href]") : null;
    if (!button || button.matches(":disabled, [aria-disabled=true]")) return;
    const cue = button.dataset.gameCue;
    manager.play(cue === "drawer" || cue === "page" ? cue : "tap");
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") manager.unlock();
  };
  const visibility = () => document.hidden ? manager.suspend() : manager.resume();
  const hidden = () => manager.suspend();
  for (const type of ["pointerup", "touchend"]) element.addEventListener(type, gesture, { capture: true, passive: true });
  element.addEventListener("click", click, { capture: true, passive: true });
  element.addEventListener("keydown", keyboard, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", hidden);
  window.addEventListener("pageshow", visibility);
  visibility();
  return () => {
    if (disposed) return;
    disposed = true;
    for (const type of ["pointerup", "touchend"]) element.removeEventListener(type, gesture, true);
    element.removeEventListener("click", click, true);
    element.removeEventListener("keydown", keyboard, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", hidden);
    window.removeEventListener("pageshow", visibility);
    owners.delete(owner);
    // A landing demo or another shell may still be using the shared kit.
    // Removing one widget must not pause audio for every remaining gesture.
    if (!owners.size) { bindings.delete(manager); manager.stopAmbient(); manager.suspend(); }
  };
}
