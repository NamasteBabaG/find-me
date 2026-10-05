import { emptyGuestSnapshot, mergeGuestSnapshot, GuestSnapshotSchema, type GuestSnapshot } from "@/domain/guest-sharing";
import type { GameConfig } from "@/domain/game/config";
import { currentTargetId } from "@/domain/game/mission";
import { sceneFoundIds } from "@/domain/game/progress";
import type { AdventureProgress } from "@/domain/adventure/progress";
import type { PlayStore } from "../store/play-store";
import type { ZodType } from "zod";

export type FriendSyncState = "saving" | "saved" | "offline" | "unavailable" | "switched" | "sync-error";

export const friendParticipantKey = (shareId: string) => `findme:friends:participant:v1:${shareId}`;
/** This UI signal contains no access proof. Cookie authorization stays on the server. */
export function announceFriendParticipant(shareId: string, participantId: string) {
  try { window.localStorage.setItem(friendParticipantKey(shareId), participantId); } catch { /* Server checks remain authoritative. */ }
}

/** Local cache recovery only. Server writes still require the complete strict schema. */
function recoverPendingSnapshot(raw: unknown): GuestSnapshot {
  const parsed = GuestSnapshotSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) return emptyGuestSnapshot();
  const data = raw as Record<string, unknown>;
  const rows = <T,>(value: unknown, schema: ZodType<T>, limit: number): T[] => {
    if (!Array.isArray(value)) return [];
    const valid: T[] = [];
    for (const row of value.slice(0, limit * 4)) {
      const result = schema.safeParse(row);
      if (result.success) valid.push(result.data);
      if (valid.length === limit) break;
    }
    return valid;
  };
  const shape = GuestSnapshotSchema.shape;
  const reaction = shape.reactionId.safeParse(data.reactionId);
  return { version: 1,
    visited: rows(data.visited, shape.visited.element, 9),
    finds: rows(data.finds, shape.finds.element, 45),
    hints: rows(data.hints, shape.hints.element, 45),
    discoveries: rows(data.discoveries, shape.discoveries.element, 54),
    reactionId: reaction.success ? reaction.data : null,
  };
}

/** Rebase valid pending events onto server truth; a corrupt delta cannot poison the outbox. */
export function rebaseFriendSnapshot(config: GameConfig, server: GuestSnapshot, local: GuestSnapshot): GuestSnapshot {
  let result = mergeGuestSnapshot(config, emptyGuestSnapshot(), server).snapshot;
  const add = (delta: Partial<GuestSnapshot>) => {
    try { result = mergeGuestSnapshot(config, result, { ...emptyGuestSnapshot(), ...delta }).snapshot; }
    catch { /* Unsupported or locked-board local data is never sent again. */ }
  };
  const route = config.worlds?.[0]?.nodes.slice().sort((a, b) => a.routeIndex - b.routeIndex).map(node => node.boardSlug) ?? config.scenes.map(scene => scene.slug);
  for (const slug of route) {
    for (const find of local.finds.filter(row => row.sceneSlug === slug)) add({ finds: [find] });
    if (local.visited.includes(slug)) add({ visited: [slug] });
    for (const hint of local.hints.filter(row => row.sceneSlug === slug)) add({ hints: [hint] });
    for (const discovery of local.discoveries.filter(row => row.sceneSlug === slug)) add({ discoveries: [discovery] });
  }
  if (!server.reactionId && local.reactionId) add({ reactionId: local.reactionId });
  return result;
}

export function friendAlbumSeed(snapshot: GuestSnapshot): Pick<AdventureProgress, "finds" | "discoveries"> {
  return {
    finds: snapshot.finds.map(find => ({ boardSlug: find.sceneSlug, targetId: find.targetId, variant: find.variant })),
    discoveries: snapshot.discoveries.map(found => ({ boardSlug: found.sceneSlug, discoveryId: found.discoveryId })),
  };
}

/** Only actual finds/hints are projected here. Opening a scene is not a visit. */
export function friendSnapshotFromPlay(store: PlayStore): GuestSnapshot {
  const snapshot = emptyGuestSnapshot();
  for (const scene of store.config.scenes) {
    const ids = sceneFoundIds(store.progress, scene);
    for (const targetId of ids) {
      const find = store.album?.finds.find(row => row.boardSlug === scene.slug && row.targetId === targetId);
      snapshot.finds.push({ sceneSlug: scene.slug, targetId, variant: find?.variant ?? store.progress.scenes[scene.slug]?.lastVariants[targetId] ?? "A" });
      if ((store.progress.scenes[scene.slug]?.foundRecords?.[targetId]?.hintsUsed ?? 0) > 0) snapshot.hints.push({ sceneSlug: scene.slug, targetId });
    }
  }
  snapshot.discoveries = (store.album?.discoveries ?? []).map(row => ({ sceneSlug: row.boardSlug, discoveryId: row.discoveryId }));
  if (store.sceneSlug && store.mission?.hintLevel && !store.replay) {
    const targetId = currentTargetId(store.mission);
    if (targetId) snapshot.hints.push({ sceneSlug: store.sceneSlug, targetId });
  }
  return snapshot;
}

/** Full monotonic snapshots are kept until acknowledged. No token is persisted. */
export class FriendProgressSync {
  private snapshot: GuestSnapshot;
  private acknowledged = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  /** The request on its way, if any; resolves when it ends, whatever its outcome. */
  private inFlight: Promise<void> = Promise.resolve();
  private stopped = false;
  private terminal = false;
  private rejections = 0;
  private readonly key: string;
  constructor(private readonly options: {
    config: GameConfig; shareToken: string; shareId: string; participantId: string; initial: GuestSnapshot;
    onState: (state: FriendSyncState) => void;
  }) {
    this.key = `findme:friends:outbox:v1:${options.shareId}:${options.participantId}`;
    this.snapshot = options.initial;
    this.acknowledged = JSON.stringify(options.initial);
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(this.key) : null;
      if (raw) this.snapshot = rebaseFriendSnapshot(options.config, this.snapshot, recoverPendingSnapshot(JSON.parse(raw)));
    } catch { /* A bad local outbox cannot replace the acknowledged server state. */ }
  }
  start() {
    if (this.terminal || this.participantSwitched()) return;
    this.stopped = false;
    if (typeof window !== "undefined") { window.addEventListener("online", this.wake); window.addEventListener("focus", this.wake); window.addEventListener("storage", this.storage); }
    this.schedule(0);
  }
  stop() {
    this.stopped = true; clearTimeout(this.timer);
    if (typeof window !== "undefined") { window.removeEventListener("online", this.wake); window.removeEventListener("focus", this.wake); window.removeEventListener("storage", this.storage); }
  }
  current() { return this.snapshot; }
  isSaved() { return !this.pending && !this.terminal && JSON.stringify(this.snapshot) === this.acknowledged; }
  /** Waits for a request already on its way, then sends whatever is still owed: true once every find is acknowledged. */
  async saveNow(): Promise<boolean> {
    await this.inFlight;
    await this.flush();
    return this.isSaved();
  }
  push(incoming: GuestSnapshot) {
    if (this.terminal || this.participantSwitched()) return;
    let merged: ReturnType<typeof mergeGuestSnapshot>;
    try { merged = mergeGuestSnapshot(this.options.config, this.snapshot, incoming); }
    catch {
      const snapshot = rebaseFriendSnapshot(this.options.config, this.snapshot, incoming);
      merged = { snapshot, changed: JSON.stringify(snapshot) !== JSON.stringify(this.snapshot) };
    }
    if (!merged.changed) return;
    this.snapshot = merged.snapshot;
    try { window.localStorage.setItem(this.key, JSON.stringify(this.snapshot)); } catch { /* Keep it in memory and try the server. */ }
    this.options.onState("saving"); this.schedule(200);
  }
  visit(sceneSlug: string) { this.push({ ...emptyGuestSnapshot(), visited: [sceneSlug] }); }
  react(reactionId: GuestSnapshot["reactionId"]) { this.push({ ...emptyGuestSnapshot(), reactionId }); }
  private wake = () => { this.schedule(0); };
  private end(state: "switched" | "unavailable" | "sync-error") { this.terminal = true; this.stop(); this.options.onState(state); }
  private participantSwitched() {
    try {
      const current = window.localStorage.getItem(friendParticipantKey(this.options.shareId));
      if (current && current !== this.options.participantId) { this.end("switched"); return true; }
    } catch { /* No storage is required for authorization or saving. */ }
    return false;
  }
  private storage = (event: StorageEvent) => {
    if (event.key === friendParticipantKey(this.options.shareId) && event.newValue && event.newValue !== this.options.participantId) this.end("switched");
  };
  private schedule(delay: number) {
    if (this.stopped || this.terminal) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, delay);
  }
  async flush() {
    if (this.stopped || this.pending || this.terminal || this.participantSwitched()) return;
    const sent = this.snapshot, serialized = JSON.stringify(sent);
    if (serialized === this.acknowledged) { this.options.onState("saved"); return; }
    this.pending = true;
    let settle!: () => void;
    this.inFlight = new Promise<void>(resolve => { settle = resolve; });
    this.options.onState("saving");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/friends/progress", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ shareToken: this.options.shareToken, participantId: this.options.participantId, snapshot: sent }),
        cache: "no-store", credentials: "same-origin", signal: controller.signal, keepalive: true });
      if (this.terminal || this.stopped || this.participantSwitched()) return;
      if (response.status === 404 || response.status === 403 || response.status === 409) {
        this.end(response.status === 409 ? "switched" : "unavailable"); return;
      }
      let server: GuestSnapshot;
      if (response.status === 400) {
        if (++this.rejections > 2) { this.end("sync-error"); return; }
        // A permanent delta rejection needs server truth, not an endless offline retry.
        const loaded = await fetch("/api/friends/play", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ shareToken: this.options.shareToken, participantId: this.options.participantId }),
          cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if ([403, 404, 409].includes(loaded.status)) {
          this.end(loaded.status === 409 ? "switched" : "unavailable"); return;
        }
        if (!loaded.ok) throw new Error("connection");
        const body = await loaded.json(); server = GuestSnapshotSchema.parse(body.participant?.snapshot);
      } else {
        if (!response.ok) throw new Error("connection");
        this.rejections = 0;
        const body = await response.json(); server = GuestSnapshotSchema.parse(body.snapshot);
      }
      if (this.terminal || this.stopped || this.participantSwitched()) return;
      this.snapshot = rebaseFriendSnapshot(this.options.config, server, this.snapshot);
      // A newer local find made during this request is still owed; only the returned server state is acknowledged.
      this.acknowledged = JSON.stringify(server);
      try {
        if (JSON.stringify(this.snapshot) === this.acknowledged) window.localStorage.removeItem(this.key);
        else window.localStorage.setItem(this.key, JSON.stringify(this.snapshot));
      } catch { /* The account acknowledgement remains true when local storage is unavailable. */ }
      this.options.onState(JSON.stringify(this.snapshot) === this.acknowledged ? "saved" : "saving");
      if (JSON.stringify(this.snapshot) !== this.acknowledged) this.schedule(response.status === 400 ? 1000 * this.rejections : 0);
    } catch {
      if (!this.stopped) { this.options.onState("offline"); this.schedule(5_000); }
    } finally { clearTimeout(timeout); this.pending = false; settle(); }
  }
}
