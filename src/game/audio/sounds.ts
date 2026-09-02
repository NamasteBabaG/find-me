import type { SoundCue } from "@/domain/scene/schema";

/**
 * Tiny synthesized sound kit (WebAudio). No audio files needed for the MVP;
 * every cue is a few oscillators/noise bursts. Swap for real samples later by
 * keeping the same `play(cue)` API.
 *
 * Browsers block audio until a user gesture: call `unlock()` from the
 * "פתיחת ההרפתקה" button.
 */
type Ctx = AudioContext;

export class SoundManager {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private ambient: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private _muted = false;

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
        this.blip(520, 0.08, t, "sine", 0.4);
        break;
      case "tap":
        this.blip(300, 0.05, t, "triangle", 0.25);
        break;
      case "success":
        this.blip(523, 0.12, t, "sine", 0.35);
        this.blip(659, 0.12, t + 0.1, "sine", 0.35);
        this.blip(784, 0.2, t + 0.2, "sine", 0.4);
        break;
      case "fanfare":
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.blip(f, 0.16, t + i * 0.12, i % 2 ? "triangle" : "sine", 0.4));
        break;
      case "twinkle":
        [1318, 1568, 2093].forEach((f, i) => this.blip(f, 0.1, t + i * 0.07, "sine", 0.25));
        break;
      case "boing":
        this.sweep(600, 150, 0.25, t, "sine", 0.4);
        break;
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

let shared: SoundManager | null = null;
export function sounds(): SoundManager {
  if (!shared) shared = new SoundManager();
  return shared;
}
