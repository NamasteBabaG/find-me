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
export function carouselWorlds(locale: Locale, owned: readonly string[] = []): CarouselWorld[] {
  const real = allWorlds();
  const out: CarouselWorld[] = real.map((world, i) => {
    // Bought worlds carry no lock, whichever order they were bought in — and a
    // world still behind the lock shows its paintings behind glass, which is
    // the same rule whether it is finished or still being painted.
    const locked = i > 0 && !owned.includes(world.slug);
    return {
      slug: world.slug,
      name: pick(world.name, locale),
      tagline: pick(world.tagline, locale),
      glyph: world.collectible.icon,
      upcoming: false,
      opensAfter: locked ? pick(real[i - 1]!.name, locale) : undefined,
      palette: world.map.palette,
      tiles: boardSlugs(world).map((slug) => {
        const scene = findScene(slug);
        return {
          key: slug,
          label: `${WORLD_GLYPHS[slug] ?? "✨"} ${scene ? pick(scene.name, locale) : slug}`,
          thumb: scene?.art.thumbnail,
          spots: locked ? undefined : scene?.targets.map((t) => pick(t.item, locale)),
          blurred: locked,
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
      opensAfter: previous(world.order),
      palette: world.palette,
      tiles: world.places.map((place, i) => {
        // Real art if it has been painted, blurred by the carousel; the place
        // name alone if it has not.
        const scene = world.boards?.[i] ? findScene(world.boards[i]!) : undefined;
        return { key: `${world.slug}-${i}`, label: pick(place, locale), thumb: scene?.art.thumbnail, blurred: Boolean(scene), soon: true };
      }),
    });
  }
  return out;
}
