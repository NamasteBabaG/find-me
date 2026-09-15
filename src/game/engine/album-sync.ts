import type { AdventureEvent, AdventureProgress } from "@/domain/adventure/progress";

/**
 * The owner's album lives in the family account; this is the browser's side of
 * that conversation. It never announces a save before the server has answered,
 * it retries the SAME event (the server records each find once, so a retry can
 * never hand out a second card), and on a conflict it reads the account's copy
 * again before trying once more, instead of overwriting it.
 *
 * Only an owner's browser gets one of these: a guest on the shared link has
 * no session, and the route refuses anything but the owner's own session.
 */
export type AlbumSyncState = "idle" | "loading" | "saving" | "saved" | "offline" | "refused";

export interface AlbumServerReply {
  progress: AdventureProgress;
  revision: number;
  changed: boolean;
}

interface Options {
  gameId: string;
  onState: (state: AlbumSyncState) => void;
  /** The account's copy, after every successful read or write. */
  onProgress: (progress: AdventureProgress) => void;
  fetcher?: typeof fetch;
  /** Retry delays after a network failure; the last one repeats. */
  backoffMs?: number[];
  /** New pilot: no POST before its account snapshot has been read. */
  readBeforeWrite?: boolean;
  validateProgress?: (progress: unknown) => AdventureProgress;
}

const ENDPOINT = "/api/play/album";

export class AlbumSync {
  private queue: AdventureEvent[] = [];
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = false;
  /** The account's copy has not been read yet (the first read failed): it is read again before anything is sent. */
  private loadOwed = false;
  private loading: Promise<"loaded" | "offline" | "refused"> | null = null;
  private readonly fetcher: typeof fetch;
  private readonly backoff: number[];

  constructor(private readonly opts: Options) {
    this.loadOwed = !!opts.readBeforeWrite;
    this.fetcher = opts.fetcher ?? ((input, init) => fetch(input, init));
    this.backoff = opts.backoffMs ?? [2_000, 5_000, 15_000, 30_000];
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }

  /** How many finds this browser still owes the account. */
  get pending(): number {
    return this.queue.length;
  }

  /** The finds this browser still owes the account, in order. */
  pendingEvents(): AdventureEvent[] {
    return [...this.queue];
  }

  /** The account's copy, or a network failure (the caller keeps its cache). One read at a time: a second call joins the first. */
  load(): Promise<"loaded" | "offline" | "refused"> {
    if (this.stopped) return Promise.resolve("refused");
    if (!this.loading) this.loading = this.read().finally(() => { this.loading = null; });
    return this.loading;
  }

  private async read(): Promise<"loaded" | "offline" | "refused"> {
    this.opts.onState("loading");
    try {
      const res = await this.fetcher(`${ENDPOINT}?gameId=${encodeURIComponent(this.opts.gameId)}`, { credentials: "same-origin", cache: "no-store" });
      if (this.stopped) return "refused";
      if (res.ok) {
        const body = (await res.json()) as AlbumServerReply;
        if (this.stopped) return "refused";
        if (!this.acceptProgress(body.progress)) return "refused";
        this.loadOwed = false;
        this.failures = 0;
        this.opts.onProgress(body.progress);
        this.opts.onState(this.queue.length ? "saving" : "saved");
        return "loaded";
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        this.loadOwed = false;
        this.opts.onState("refused");
        return "refused";
      }
      return this.loadFailed();
    } catch {
      return this.loadFailed();
    }
  }

  /**
   * The account could not be read. The read stays owed and is tried again on
   * its own (backoff, or the moment the browser is back online): a refresh
   * while offline empties the in-memory queue, so what this browser found is
   * only reconciled once the account's copy has actually been read.
   */
  private loadFailed(): "offline" {
    if (this.stopped) return "offline";
    this.loadOwed = true;
    this.opts.onState("offline");
    this.scheduleRetry();
    return "offline";
  }

  private scheduleRetry(): void {
    if (this.timer || this.stopped) return;
    const delay = this.backoff[Math.min(this.failures, this.backoff.length - 1)]!;
    this.failures++;
    this.timer = setTimeout(() => { this.timer = null; void this.resume(); }, delay);
  }

  /** Read the account first when that is still owed, then send what is queued. */
  private async resume(): Promise<void> {
    if (this.stopped) return;
    if (this.loadOwed && (await this.load()) !== "loaded") return;
    void this.drain();
  }

  /** Queue a find for the account. Returns at once; the state reports what happened. */
  push(event: AdventureEvent): void {
    if (this.stopped) return;
    this.queue.push(event);
    this.opts.onState("saving");
    void this.drain();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
  }

  /** A different book is not an ordinary retryable write conflict. */
  private acceptProgress(progress: unknown): boolean {
    try { this.opts.validateProgress?.(progress); return true; }
    catch {
      this.loadOwed = false;
      this.queue = [];
      this.stop();
      this.opts.onState("refused");
      return false;
    }
  }

  private onOnline = () => {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.failures = 0;
    void this.resume();
  };

  private async drain(): Promise<void> {
    if (this.busy || this.stopped || !this.queue.length) return;
    this.busy = true;
    try {
      // The account is read before anything is sent, a new find included:
      // what it holds decides what this browser still owes.
      if (this.loadOwed) {
        const loaded = await this.load();
        if (this.stopped) return;
        if (loaded === "refused") { this.queue = []; return; }
        if (loaded !== "loaded") { this.opts.onState("offline"); this.scheduleRetry(); return; }
      }
      while (this.queue.length && !this.stopped) {
        const event = this.queue[0]!;
        const outcome = await this.send(event);
        if (this.stopped) return;
        if (outcome === "done") {
          this.queue.shift();
          this.failures = 0;
          continue;
        }
        if (outcome === "refused") {
          // The account said no (not the owner, game gone, event impossible): stop
          // pretending. What was queued stays in this browser's cache.
          this.queue = [];
          this.opts.onState("refused");
          return;
        }
        if (outcome === "conflict") {
          // Someone else moved the album; read it again, then send the same event.
          const loaded = await this.load();
          if (this.stopped) return;
          if (loaded === "loaded") continue;
          if (loaded === "refused") { this.queue = []; return; }
        }
        // offline: keep the event, come back later
        this.opts.onState("offline");
        this.scheduleRetry();
        return;
      }
      if (!this.stopped && !this.queue.length) this.opts.onState("saved");
    } finally {
      this.busy = false;
    }
  }

  private async send(event: AdventureEvent): Promise<"done" | "conflict" | "refused" | "offline"> {
    try {
      const res = await this.fetcher(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: this.opts.gameId, event }),
      });
      if (this.stopped) return "refused";
      if (res.ok) {
        const body = (await res.json()) as AlbumServerReply;
        if (this.stopped || !this.acceptProgress(body.progress)) return "refused";
        this.opts.onProgress(body.progress);
        return "done";
      }
      if (res.status === 409) return "conflict";
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return "refused";
      return "offline";
    } catch {
      return "offline";
    }
  }
}
