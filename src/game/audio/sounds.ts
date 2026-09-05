import type { SoundCue } from "@/domain/scene/schema";

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

/** A hint or a bonus — three sparkles. */
const TWINKLE: readonly (readonly Note[])[] = [
  [N.E6, N.G6, N.C7].map((f, i): Note => [f, 0.1, i * 0.07, "sine", 0.25]),
  [N.C7, N.G6, N.E6, N.G6].map((f, i): Note => [f, 0.09, i * 0.06, "sine", 0.22]),
  [N.D6, N.A6, N.D6, N.A6].map((f, i): Note => [f, 0.08, i * 0.065, "triangle", 0.2]),
];

export class SoundManager {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private ambient: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private _muted = false;
  /** Which voicing each cue played last, so the next one is different. */
  private last: Partial<Record<SoundCue, number>> = {};

  get muted(): boolean {
    return this._muted;
  }

  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  play(cue: SoundCue): void {
    if (!this.ctx || !this.master || this._muted) return;
    const t = this.ctx.currentTime;
    switch (cue) {
      case "pop":
        this.blip(between(440, 640), 0.08, t, "sine", 0.4);
        break;
      case "tap":
        this.blip(between(250, 360), 0.05, t, "triangle", 0.25);
        break;
      case "success":
        this.phrase(SUCCESS[this.pick(cue, SUCCESS.length)]!, t, semitones(between(-2, 2)));
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
    if (!cue || !this.ctx || !this.master) return;
    const settings: Record<string, { freq: number; q: number; gain: number }> = {
      waves: { freq: 220, q: 0.6, gain: 0.08 },
      jungle: { freq: 900, q: 1.2, gain: 0.05 },
      space: { freq: 90, q: 2, gain: 0.06 },
      crowd: { freq: 300, q: 0.8, gain: 0.05 },
    };
    const s = settings[cue];
    if (!s) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = s.freq;
    filter.Q.value = s.q;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = cue === "waves" ? 0.12 : 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = s.gain * 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = s.gain;
    lfo.connect(lfoGain).connect(gain.gain);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    lfo.start();
    this.ambient = { source, gain };
  }

  stopAmbient(): void {
    if (!this.ambient || !this.ctx) return;
    const { source, gain } = this.ambient;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }, 800);
    this.ambient = null;
  }

  /** A voicing for this cue that is not the one it played last time. */
  private pick(cue: SoundCue, count: number): number {
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

  private blip(freq: number, dur: number, at: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private sweep(from: number, to: number, dur: number, at: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(dur: number, at: number, cutoff: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at);
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
export function sounds(): SoundManager {
  if (!shared) shared = new SoundManager();
  return shared;
}
