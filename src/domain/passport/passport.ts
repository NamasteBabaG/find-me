import type { GameConfig } from "../game/config";
import { readAdventureProgress, type AdventureProgress } from "../adventure/progress";
import type { AdventureRect } from "../adventure/content";

export type PassportPreference = { photoTargetId: string | null; stampSeen: boolean; seenDiscoveries: string[] };
export type PassportPageState = "locked" | "available" | "in-progress" | "stamped" | "complete";
export type PassportDiscoveryView = { id: string; collected: boolean; rarity: "common" | "rare" | "epic"; name?: string; description?: string; imageUrl?: string };
export type PassportPageView = {
  id: string; title: string; state: PassportPageState; finds: number;
  stampIcon: string; photoUrl?: string;
  discoveries: PassportDiscoveryView[];
  photoChoices?: Array<{ id: string; imageUrl: string; selected: boolean }>;
  playHref?: string;
};
export type PassportWorldView = { id: string; title: string; pages: PassportPageView[] };
export type PassportView = { name: string; avatarUrl?: string; worlds: PassportWorldView[]; preparing: number };

/** Repeated purchases stay separate, with distinct reader labels. No merging
 * progress or silently dropping a paid adventure to hide a duplicate title. */
export function distinguishPassportWorlds(worlds: PassportWorldView[]): PassportWorldView[] {
  const totals = new Map<string, number>(), seen = new Map<string, number>();
  for (const world of worlds) totals.set(world.title, (totals.get(world.title) ?? 0) + 1);
  return worlds.map(world => {
    const n = (seen.get(world.title) ?? 0) + 1;
    seen.set(world.title, n);
    return totals.get(world.title)! > 1 ? { ...world, title: `${world.title} · ${n}` } : world;
  });
}

/** Last find at first completion is stable: progress is an ordered, unique union. */
export function passportPhoto(progress: AdventureProgress, boardSlug: string, preferred?: string | null) {
  const board = progress.book.boards.find(b => b.boardSlug === boardSlug);
  if (!board || board.targetIds.length !== 3) return null;
  const found = progress.finds.filter(f => f.boardSlug === boardSlug);
  if (found.length !== 3) return null;
  return found.find(f => f.targetId === preferred) ?? found[2]!;
}

/** Crop a scene around the child, preserving a margin for location/context. */
export function passportPhotoCrop(hit: AdventureRect, art: { width: number; height: number }): AdventureRect {
  const h = Math.min(1, Math.max(hit.h * 1.7, .22));
  const w = Math.min(1, Math.max(hit.w * 2.2, h * art.height / art.width * 1.25));
  return { x: Math.max(0, Math.min(1 - w, hit.x + hit.w / 2 - w / 2)), y: Math.max(0, Math.min(1 - h, hit.y + hit.h / 2 - h / 2)), w, h };
}

/** Explicit allowlist projection. No config, hit regions, hints or hidden items. */
export function projectPassport(config: GameConfig, raw: AdventureProgress, preferences: Record<string, PassportPreference>, media: (board: string, kind: "photo" | "discovery", id: string) => string, owner = false): PassportWorldView[] {
  if (!config.adventure) return [];
  const progress = readAdventureProgress(raw, config.gameId, config.adventure);
  const worlds: PassportWorldView[] = [];
  for (const board of progress.book.boards) {
    // The new product contract, not five-hide test migrations.
    if (board.targetIds.length !== 3 || board.discoveries.length !== 6) throw new Error("passport-product-contract");
    const scene = config.scenes.find(s => s.slug === board.boardSlug);
    if (!scene) throw new Error("passport-content-mismatch");
    let world = worlds.find(w => w.id === board.worldSlug);
    if (!world) {
      world = { id: board.worldSlug, title: config.worlds?.find(w => w.slug === board.worldSlug)?.name ?? (config.world?.slug === board.worldSlug ? config.world.name : config.locale === "he" ? "ההרפתקה שלי" : "My adventure"), pages: [] };
      worlds.push(world);
    }
    const finds = progress.finds.filter(f => f.boardSlug === board.boardSlug).length;
    const collected = new Set(progress.discoveries.filter(d => d.boardSlug === board.boardSlug).map(d => d.discoveryId));
    const complete = finds === 3;
    const unlocked = world.pages.length === 0 || ["stamped", "complete"].includes(world.pages[world.pages.length - 1]!.state);
    const photo = passportPhoto(progress, board.boardSlug, preferences[board.boardSlug]?.photoTargetId);
    world.pages.push({
      id: board.boardSlug, title: scene.name, finds,
      state: complete ? collected.size === 6 ? "complete" : "stamped" : finds || collected.size ? "in-progress" : unlocked ? "available" : "locked",
      stampIcon: scene.collectible.icon,
      ...(photo ? { photoUrl: media(board.boardSlug, "photo", photo.targetId) } : {}),
      discoveries: board.discoveries.map(d => collected.has(d.id) ? {
        id: d.id, collected: true, rarity: d.rarity ?? "common", name: d.name, description: d.description, imageUrl: media(board.boardSlug, "discovery", d.id),
      } : { id: d.id, collected: false, rarity: d.rarity ?? "common" }),
      ...(owner && complete ? { photoChoices: progress.finds.filter(f => f.boardSlug === board.boardSlug).map(f => ({ id: f.targetId, imageUrl: media(board.boardSlug, "photo", f.targetId), selected: f.targetId === photo?.targetId })) } : {}),
    });
  }
  return worlds;
}

/** Delta acknowledgements never grant achievements and never reissue stamps. */
export function passportCeremony(progress: AdventureProgress, boardSlug: string, preference?: PassportPreference) {
  const board = progress.book.boards.find(b => b.boardSlug === boardSlug);
  const complete = Boolean(board && board.targetIds.length === 3 && progress.finds.filter(f => f.boardSlug === boardSlug).length === 3);
  if (!complete) return { stamp: false, discoveryIds: [] as string[] };
  return { stamp: !preference?.stampSeen, discoveryIds: progress.discoveries.filter(d => d.boardSlug === boardSlug && !preference?.seenDiscoveries.includes(d.discoveryId)).map(d => d.discoveryId) };
}
