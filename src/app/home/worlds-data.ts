import { allWorlds } from "../../../content/worlds";
import { UPCOMING_WORLDS } from "../../../content/worlds/upcoming";
import { findScene } from "../../../content/scenes";
import { boardPresentation } from "../../../content/home/board-presentation";
import { boardSlugs } from "@/domain/world";
import { pick, type Locale } from "@/i18n/config";
import { getDict } from "@/i18n";
import type { CarouselWorld } from "./WorldsCarousel";

/** Send destination names only: no board art or discovery clues in the homepage
 * carousel's client data. Availability still comes from the creation catalogue. */
export function carouselWorlds(locale: Locale, owned: readonly string[] = [], offer: { available: readonly string[] } = { available: [] }): CarouselWorld[] {
  const taglines = getDict(locale).home.worlds.taglines;
  const real = allWorlds();
  const out: CarouselWorld[] = real.map((world) => {
    const isOwned = owned.includes(world.slug);
    return {
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: taglines[world.slug as keyof typeof taglines] ?? pick(world.tagline, locale),
      upcoming: false,
      owned: isOwned,
      available: offer.available.includes(world.slug),
      palette: world.map.palette,
      tiles: boardSlugs(world).map((slug) => {
        const scene = findScene(slug);
        const presentation = boardPresentation(slug);
        return {
          key: slug,
          label: presentation ? pick(presentation.name, locale) : scene ? pick(scene.name, locale) : slug,
          soon: !scene?.active,
        };
      }),
    };
  });

  for (const world of [...UPCOMING_WORLDS].sort((a, b) => a.order - b.order)) {
    out.push({
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: taglines[world.slug as keyof typeof taglines] ?? pick(world.tagline, locale),
      upcoming: true,
      owned: false,
      available: false,
      palette: world.palette,
      tiles: world.places.map((place, i) => {
        return { key: world.boards?.[i] ?? `${world.slug}-${i}`, label: pick(place, locale), soon: true };
      }),
    });
  }
  return out;
}
