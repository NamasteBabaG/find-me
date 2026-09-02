/**
 * Fire-and-forget play telemetry. Coarse events only (see ProgressService).
 * Uses sendBeacon when available so a closing tab still reports completion.
 */
export type PlayEventType = "scene_started" | "target_found" | "hint_used" | "scene_completed" | "game_completed" | "game_replayed";

export interface PlayEvent {
  eventType: PlayEventType;
  sceneSlug?: string;
  targetId?: string;
  hintsUsed?: number;
}

const ANON_KEY = "findme:anon";

export function anonymousId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function deviceType(): "phone" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = Math.min(window.innerWidth, window.innerHeight);
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!touch) return "desktop";
  return w < 600 ? "phone" : "tablet";
}

export class Telemetry {
  private queue: PlayEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly gameId: string,
    private readonly enabled: boolean,
  ) {}

  track(event: PlayEvent): void {
    if (!this.enabled) return;
    this.queue.push(event);
    if (event.eventType === "game_completed" || event.eventType === "scene_completed") {
      this.flush();
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 4000);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || typeof window === "undefined") return;
    const body = JSON.stringify({ gameId: this.gameId, anonymousSessionId: anonymousId(), deviceType: deviceType(), events: this.queue.splice(0, 50) });
    const url = "/api/play/progress";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }
}
