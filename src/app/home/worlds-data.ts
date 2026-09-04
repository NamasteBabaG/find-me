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
 * Worlds are bought in order, so every world after the first says which one
 * opens it. That is the same rule the create flow enforces — a parent should
 * meet it here, where it reads as a journey, rather than at checkout where it
 * would read as a refusal.
 */
export function carouselWorlds(locale: Locale): CarouselWorld[] {
  const real = allWorlds();
  const out: CarouselWorld[] = real.map((world, i) => ({
    slug: world.slug,
    name: pick(world.name, locale),
    tagline: pick(world.tagline, locale),
    glyph: pick(world.collectible.name, locale).slice(0, 0) || world.collectible.icon,
    upcoming: false,
    opensAfter: i === 0 ? undefined : pick(real[i - 1]!.name, locale),
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
  }));

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
      opensAfter: previous(world.order),
      palette: world.palette,
      tiles: world.places.map((place, i) => ({ key: `${world.slug}-${i}`, label: pick(place, locale), soon: true })),
    });
  }
  return out;
}
