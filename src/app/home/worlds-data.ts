import { allWorlds } from "../../../content/worlds";
import { UPCOMING_WORLDS } from "../../../content/worlds/upcoming";
import { findScene } from "../../../content/scenes";
import { boardSlugs } from "@/domain/world";
import { pick, type Locale } from "@/i18n/config";
import type { CarouselWorld } from "./WorldsCarousel";
import { WORLD_GLYPHS } from "./sections";

/**
 * The worlds as the shop shows them: the finished ones first, then the ones
 * being painted, all in one carousel.
 *
 * Every world is on show — its paintings, its places, its hiding spots. The
 * blur and the padlock that used to sit on the second and third worlds were
 * hiding the thing being sold; what a visitor needs to know is said in words
 * instead. Three facts, kept apart: a world you own ("in your library"), a
 * world you can buy next (worlds are a ladder, so each one names the one
 * before it), and a world still being painted. Ownership is read from the
 * database and passed in, so it survives closing the tab.
 */
export function carouselWorlds(locale: Locale, owned: readonly string[] = []): CarouselWorld[] {
  const real = allWorlds();
  const out: CarouselWorld[] = real.map((world, i) => {
    const isOwned = owned.includes(world.slug);
    return {
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: pick(world.tagline, locale),
      glyph: world.collectible.icon,
      upcoming: false,
      owned: isOwned,
      opensAfter: i > 0 && !isOwned ? pick(real[i - 1]!.name, locale) : undefined,
      palette: world.map.palette,
      tiles: boardSlugs(world).map((slug) => {
        const scene = findScene(slug);
        return {
          key: slug,
          label: `${WORLD_GLYPHS[slug] ?? "✨"} ${scene ? pick(scene.name, locale) : slug}`,
          thumb: scene?.art.thumbnail,
          spots: scene?.targets.map((t) => pick(t.item, locale)),
          soon: !scene?.active,
        };
      }),
    };
  });

  const previous = (order: number): string => {
    const before = [...real.map((w) => ({ order: w.order, name: pick(w.name, locale) })), ...UPCOMING_WORLDS.map((w) => ({ order: w.order, name: pick(w.name, locale) }))]
      .filter((w) => w.order < order)
      .sort((a, b) => b.order - a.order);
    return before[0]?.name ?? "";
  };

  for (const world of [...UPCOMING_WORLDS].sort((a, b) => a.order - b.order)) {
    out.push({
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: pick(world.tagline, locale),
      glyph: world.glyph,
      upcoming: true,
      owned: false,
      opensAfter: previous(world.order),
      palette: world.palette,
      tiles: world.places.map((place, i) => {
        // Real art if it has been painted; the place name alone if it has not.
        const scene = world.boards?.[i] ? findScene(world.boards[i]!) : undefined;
        return { key: `${world.slug}-${i}`, label: pick(place, locale), thumb: scene?.art.thumbnail, soon: true };
      }),
    });
  }
  return out;
}
