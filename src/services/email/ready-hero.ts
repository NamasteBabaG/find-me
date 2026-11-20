import { findScene } from "../../../content/scenes";
import { worldOfBoard } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import type { Locale } from "@/i18n";

/**
 * Child-free art for the top of the "game ready" mail: where the child's
 * adventure starts, the first board of their first world, in the art of the
 * level they play. Keyed by the board art it was cut from, so a board drawn
 * again under a new version simply has no picture until one is cut for it.
 * `scripts/email-heroes.ts` cuts these files from the board art (1040x520 JPEG).
 *
 * Served from the site itself, like any transactional mail picture: the QA gate
 * lets exactly `/email/<name>.jpg` through, because a mail client brings no QA
 * session. Nothing here is the child, a photo or a generated picture.
 */
export const READY_MAIL_HEROES: Readonly<Record<string, string>> = Object.freeze({
  "/scenes/kingdom-castlegate-detectives-v1/base.webp": "/email/kingdom-castlegate-detectives-v1.jpg",
  "/scenes/magic-castlegate-v18/base.webp": "/email/magic-castlegate-v18.jpg",
  "/scenes/journey-newyork-detectives-v1/base.webp": "/email/journey-newyork-detectives-v1.jpg",
  "/scenes/adventure-newyork/base.webp": "/email/adventure-newyork.jpg",
});

export interface ReadyMailHero {
  /** Absolute address on this site; mail clients cannot resolve a relative one. */
  src: string;
  /** The world's own name, shown above the title and as the picture's alt text. */
  worldTitle: string;
  /** The world's light colour: behind the picture while it loads or is blocked, and behind the name. */
  tint: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The picture for this game's ready mail, or null when its first board has none. A picture is
 * decoration: it is chosen inside the READY transaction, so nothing about it may ever throw. */
export function readyMailHero(appUrl: string, scenes: readonly { sceneSlug: string; sceneVersion: number }[], locale: Locale): ReadyMailHero | null {
  try { return chooseHero(appUrl, scenes, locale); } catch { return null; }
}

function chooseHero(appUrl: string, scenes: readonly { sceneSlug: string; sceneVersion: number }[], locale: Locale): ReadyMailHero | null {
  const world = scenes.map(scene => worldOfBoard(scene.sceneSlug)).find(Boolean);
  if (!world) return null;
  const first = boardSlugs(world)[0];
  const played = scenes.find(scene => scene.sceneSlug === first);
  if (!first || !played) return null;
  const art = findScene(first, played.sceneVersion)?.art;
  const hero = art ? READY_MAIL_HEROES[art.base] : undefined;
  if (!art || !hero) return null;
  const sky = art.palette?.sky;
  return { src: new URL(hero, appUrl).toString(), worldTitle: world.name[locale], tint: sky && HEX.test(sky) ? sky : "#F3ECDD" };
}
