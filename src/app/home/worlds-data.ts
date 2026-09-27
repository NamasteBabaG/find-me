import { allWorlds } from "../../../content/worlds";
import { UPCOMING_WORLDS } from "../../../content/worlds/upcoming";
import { findScene } from "../../../content/scenes";
import { boardPresentation, presentationMatchesScene } from "../../../content/home/board-presentation";
import { boardSlugs } from "@/domain/world";
import { pick, type Locale } from "@/i18n/config";
import { getDict } from "@/i18n";
import type { CarouselWorld } from "./WorldsCarousel";

/** Painted previews stay visible, but availability comes from the same pinned
 * catalogue as creation. Worlds are independent, never an unlock ladder. */
export function carouselWorlds(locale: Locale, owned: readonly string[] = [], offer: { available: readonly string[]; sceneVersion?: number } = { available: [] }): CarouselWorld[] {
  const taglines = getDict(locale).home.worlds.taglines;
  const real = allWorlds();
  const out: CarouselWorld[] = real.map((world) => {
    const isOwned = owned.includes(world.slug);
    return {
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: taglines[world.slug as keyof typeof taglines] ?? pick(world.tagline, locale),
      glyph: world.collectible.icon,
      upcoming: false,
      owned: isOwned,
      available: offer.available.includes(world.slug),
      previewArt: boardSlugs(world).some(slug => boardPresentation(slug) && !presentationMatchesScene(slug, findScene(slug, offer.sceneVersion)?.art)),
      palette: world.map.palette,
      tiles: boardSlugs(world).map((slug) => {
        const scene = findScene(slug);
        const presentation = boardPresentation(slug);
        return {
          key: slug,
          label: presentation ? pick(presentation.name, locale) : scene ? pick(scene.name, locale) : slug,
          thumb: presentation?.thumbnail ?? scene?.art.thumbnail,
          spots: presentation ? presentation.discoveries.map(d => pick(d.name, locale)) : scene?.targets.map((t) => pick(t.item, locale)),
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
      glyph: world.glyph,
      upcoming: true,
      owned: false,
      available: false,
      previewArt: true,
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
