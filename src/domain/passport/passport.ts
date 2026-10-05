import type { GameConfig } from "../game/config";
import { readAdventureProgress, type AdventureProgress } from "../adventure/progress";
import type { AdventureRect } from "../adventure/content";

export type PassportPreference = { photoTargetId: string | null; stampSeen: boolean; seenDiscoveries: string[] };
export type PassportPageState = "locked" | "available" | "in-progress" | "stamped" | "complete";
export type PassportDiscoveryView = { id: string; collected: boolean; rarity: "common" | "rare" | "epic"; name?: string; description?: string; imageUrl?: string };
export type PassportPageView = {
  /** `total` is the board's own hiding-spot count, so no reader ever has to assume one. */
  id: string; title: string; state: PassportPageState; finds: number; total: number;
  stampIcon: string; photoUrl?: string;
  discoveries: PassportDiscoveryView[];
  photoChoices?: Array<{ id: string; imageUrl: string; selected: boolean }>;
  playHref?: string;
};
export type PassportWorldView = { id: string; title: string; pages: PassportPageView[] };

/**
 * The passport's product contract: a board earns a page with exactly three hiding spots and six discoveries.
 * Older five-hide formats stay playable with the classic completion card and bag, and never enter the passport
 * (`passport.service.ts`). Every gate, on the client and the server, reads this one rule instead of its own numbers.
 */
export const PASSPORT_TARGETS = 3;
export const PASSPORT_DISCOVERIES = 6;
type ContractBoard = { targetIds: readonly unknown[]; discoveries: readonly unknown[] };
export function isPassportBoard(board: ContractBoard): boolean {
  return board.targetIds.length === PASSPORT_TARGETS && board.discoveries.length === PASSPORT_DISCOVERIES;
}
/** A game plays with the passport only when every board of its book keeps the contract. */
export function isPassportBook(book: { boards: readonly ContractBoard[] } | null | undefined): boolean {
  return !!book && book.boards.every(isPassportBoard);
}
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
  if (!board || board.targetIds.length !== PASSPORT_TARGETS) return null;
  const found = progress.finds.filter(f => f.boardSlug === boardSlug);
  if (found.length !== PASSPORT_TARGETS) return null;
  return found.find(f => f.targetId === preferred) ?? found[found.length - 1]!;
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
    if (!isPassportBoard(board)) throw new Error("passport-product-contract");
    const scene = config.scenes.find(s => s.slug === board.boardSlug);
    if (!scene) throw new Error("passport-content-mismatch");
    let world = worlds.find(w => w.id === board.worldSlug);
    if (!world) {
      world = { id: board.worldSlug, title: config.worlds?.find(w => w.slug === board.worldSlug)?.name ?? (config.world?.slug === board.worldSlug ? config.world.name : config.locale === "he" ? "ההרפתקה שלי" : "My adventure"), pages: [] };
      worlds.push(world);
    }
    const finds = progress.finds.filter(f => f.boardSlug === board.boardSlug).length;
    const collected = new Set(progress.discoveries.filter(d => d.boardSlug === board.boardSlug).map(d => d.discoveryId));
    const complete = finds === board.targetIds.length;
    const unlocked = world.pages.length === 0 || ["stamped", "complete"].includes(world.pages[world.pages.length - 1]!.state);
    const photo = passportPhoto(progress, board.boardSlug, preferences[board.boardSlug]?.photoTargetId);
    world.pages.push({
      id: board.boardSlug, title: scene.name, finds, total: board.targetIds.length,
      state: complete ? collected.size === board.discoveries.length ? "complete" : "stamped" : finds || collected.size ? "in-progress" : unlocked ? "available" : "locked",
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
  const complete = Boolean(board && board.targetIds.length === PASSPORT_TARGETS && progress.finds.filter(f => f.boardSlug === boardSlug).length === PASSPORT_TARGETS);
  if (!complete) return { stamp: false, discoveryIds: [] as string[] };
  return { stamp: !preference?.stampSeen, discoveryIds: progress.discoveries.filter(d => d.boardSlug === boardSlug && !preference?.seenDiscoveries.includes(d.discoveryId)).map(d => d.discoveryId) };
}
