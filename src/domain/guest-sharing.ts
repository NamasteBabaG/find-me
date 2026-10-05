import { z } from "zod";
import { gameWorlds, worldOfScene, type GameConfig } from "./game/config";

export const GUEST_NICKNAME_IDS = ["guest", "star", "rainbow", "fox", "owl", "lightning"] as const;
export const GUEST_REACTION_IDS = ["wow", "loved", "again"] as const;
export const GuestNicknameId = z.enum(GUEST_NICKNAME_IDS);
export const GuestReactionId = z.enum(GUEST_REACTION_IDS);
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const GuestSnapshotSchema = z.object({
  version: z.literal(1),
  visited: z.array(Id).max(9),
  finds: z.array(z.object({ sceneSlug: Id, targetId: Id, variant: z.enum(["A", "B"]) }).strict()).max(45),
  hints: z.array(z.object({ sceneSlug: Id, targetId: Id }).strict()).max(45),
  discoveries: z.array(z.object({ sceneSlug: Id, discoveryId: Id }).strict()).max(54),
  reactionId: GuestReactionId.nullable(),
}).strict();
export type GuestSnapshot = z.infer<typeof GuestSnapshotSchema>;
export type GuestNickname = z.infer<typeof GuestNicknameId>;
export type GuestReaction = z.infer<typeof GuestReactionId>;
export class GuestSharingError extends Error {
  constructor(readonly code: "unavailable" | "invalid-event" | "conflict" | "parent-required") { super(code); }
}
export const emptyGuestSnapshot = (): GuestSnapshot => ({ version: 1, visited: [], finds: [], hints: [], discoveries: [], reactionId: null });

/** The same content rule drives server invitations and their visible controls. */
export function guestWorldEligible(config: GameConfig, worldSlug: string): boolean {
  const world = gameWorlds(config).find(row => row.slug === worldSlug);
  if (!world) return false;
  const scenes = config.scenes.filter(scene => worldOfScene(config, scene.slug)?.slug === worldSlug);
  return scenes.length === 9 && scenes.every(scene => scene.playMode === "find-any") && new Set(scenes.map(scene => scene.slug)).size === 9
    && world.nodes.length === 9 && new Set(world.nodes.map(node => node.boardSlug)).size === 9
    && new Set(world.nodes.map(node => node.routeIndex)).size === 9
    && world.nodes.every(node => scenes.some(scene => scene.slug === node.boardSlug));
}

/** Only a frozen authored nine-board world can become a friends invitation. */
export function guestWorldConfig(config: GameConfig, worldSlug: string): GameConfig {
  if (!guestWorldEligible(config, worldSlug)) throw new GuestSharingError("unavailable");
  const world = gameWorlds(config).find(row => row.slug === worldSlug)!;
  const scenes = config.scenes.filter(scene => worldOfScene(config, scene.slug)?.slug === worldSlug);
  const { gift: _gift, adventure: book, ...base } = config;
  return { ...base, packageTier: "ONE_WORLD", scenes, world, worlds: [world],
    ...(book ? { adventure: { ...book, boards: book.boards.filter(board => scenes.some(scene => scene.slug === board.boardSlug)) } } : {}) };
}

function key(row: { sceneSlug: string; targetId?: string; discoveryId?: string }): string {
  return `${row.sceneSlug}\u0000${row.targetId ?? row.discoveryId}`;
}
function unique<T>(rows: T[], identity: (row: T) => string): T[] {
  const seen = new Set<string>(); return rows.filter(row => { const id = identity(row); if (seen.has(id)) return false; seen.add(id); return true; });
}
export function guestBoardStates(config: GameConfig, snapshot: GuestSnapshot) {
  return config.scenes.map(scene => {
    const finds = snapshot.finds.filter(find => find.sceneSlug === scene.slug).length;
    return { sceneSlug: scene.slug, title: scene.name, finds, total: scene.targets.length,
      hintsUsed: snapshot.hints.filter(hint => hint.sceneSlug === scene.slug).length,
      state: finds === scene.targets.length ? "complete" as const : finds > 0 ? "partial" as const
        : snapshot.visited.includes(scene.slug) ? "visited" as const : "unvisited" as const };
  });
}

/** A monotonic set union: stale requests cannot erase finds; a retry earns no
 * extra find, visit, reaction or activity revision. No completion flags from clients. */
export function mergeGuestSnapshot(config: GameConfig, previousRaw: unknown, incomingRaw: unknown): { snapshot: GuestSnapshot; changed: boolean } {
  const previous = GuestSnapshotSchema.safeParse(previousRaw), incoming = GuestSnapshotSchema.safeParse(incomingRaw);
  if (!previous.success || !incoming.success) throw new GuestSharingError("invalid-event");
  const data = incoming.data;
  const valid = (snapshot: GuestSnapshot) => {
    if (snapshot.visited.some(slug => !config.scenes.some(scene => scene.slug === slug))) return false;
    for (const find of [...snapshot.finds, ...snapshot.hints]) if (!config.scenes.find(scene => scene.slug === find.sceneSlug)?.targets.some(target => target.id === find.targetId)) return false;
    for (const found of snapshot.discoveries) if (!config.adventure?.boards.find(board => board.boardSlug === found.sceneSlug)?.discoveries.some(discovery => discovery.id === found.discoveryId)) return false;
    return true;
  };
  if (!valid(previous.data) || !valid(data)) throw new GuestSharingError("invalid-event");
  const snapshot: GuestSnapshot = { version: 1,
    visited: unique([...previous.data.visited, ...data.visited, ...data.finds.map(find => find.sceneSlug)], row => row),
    finds: unique([...previous.data.finds, ...data.finds], key), hints: unique([...previous.data.hints, ...data.hints], key),
    discoveries: unique([...previous.data.discoveries, ...data.discoveries], key), reactionId: previous.data.reactionId ?? data.reactionId };
  const route = config.worlds?.[0]?.nodes.slice().sort((a, b) => a.routeIndex - b.routeIndex).map(node => node.boardSlug) ?? config.scenes.map(scene => scene.slug);
  let playable = true;
  for (const slug of route) {
    const scene = config.scenes.find(row => row.slug === slug)!;
    const active = snapshot.visited.includes(slug) || [...snapshot.finds, ...snapshot.hints, ...snapshot.discoveries].some(row => row.sceneSlug === slug);
    if (active && !playable) throw new GuestSharingError("invalid-event");
    playable = playable && snapshot.finds.filter(find => find.sceneSlug === slug).length >= (scene.findsRequiredToAdvance ?? 3);
  }
  if (snapshot.reactionId && !guestBoardStates(config, snapshot).every(board => board.state === "complete")) throw new GuestSharingError("invalid-event");
  // Canonical route/target order makes equal sets equal JSON across delivery order.
  snapshot.visited.sort((a, b) => route.indexOf(a) - route.indexOf(b));
  const sort = (a: { sceneSlug: string; targetId?: string; discoveryId?: string }, b: typeof a) => route.indexOf(a.sceneSlug) - route.indexOf(b.sceneSlug) || key(a).localeCompare(key(b));
  snapshot.finds.sort(sort); snapshot.hints.sort(sort); snapshot.discoveries.sort(sort);
  return { snapshot, changed: JSON.stringify(snapshot) !== JSON.stringify(previous.data) };
}
