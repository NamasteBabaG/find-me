import type { CSSProperties } from "react";
import type { WorldSummary } from "@/domain/adventure/summary";
import type { FamilyAdventure } from "@/services/family-adventures.service";

/** The world a child is playing now: the first one with a place still to stamp, or the last once all are. */
export function currentWorld(adventure: FamilyAdventure): WorldSummary | undefined {
  return adventure.worlds.find(world => world.stamped < world.places) ?? adventure.worlds[adventure.worlds.length - 1];
}

/** The illustrated sticker the child plays as; their initial until one exists. Decorative: the name is always beside it. */
export function Sticker({ url, name, className = "" }: { url: string | null; name: string; className?: string }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={`fm-sticker family-sticker ${className}`} src={url} alt="" width={96} height={96} decoding="async" />
    : <span className={`family-sticker family-sticker--initial ${className}`} aria-hidden="true">{Array.from(name)[0] ?? ""}</span>;
}

/**
 * The world's map with the child standing where they are, as on the map in the game: only the child, at one place,
 * with that place's name. The words beside it say the same thing for anyone who can't see it.
 */
export function MapGlimpse({ world, avatarUrl, name, eager = false }: { world: WorldSummary; avatarUrl: string | null; name: string; eager?: boolean }) {
  // Map art is never mirrored, so the place sits at its physical left in either direction.
  const at = { "--x": `${world.here.x * 100}%`, "--y": `${world.here.y * 100}%` } as CSSProperties;
  return (
    <div className="glimpse" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="glimpse__map" src={world.map.art} alt="" width={world.map.width} height={world.map.height} loading={eager ? "eager" : "lazy"} decoding="async" />
      <span className="glimpse__here" style={at}>
        <Sticker url={avatarUrl} name={name} className="glimpse__sticker" />
        <span className="glimpse__place">{world.here.name}</span>
      </span>
    </div>
  );
}

/** One mark per place on the route, in order. */
export function PlaceRoute({ world }: { world: WorldSummary }) {
  return (
    <span className="route" aria-hidden="true">
      {world.route.map((state, i) => <span key={i} className={`route__mark route__mark--${state}`} />)}
    </span>
  );
}

/** Gold stars found, the way the game's counter shows them. */
export function StarTally({ found, total, label }: { found: number; total: number; label: string }) {
  return (
    <span className="tally" role="img" aria-label={label}>
      <span className="tally__star" aria-hidden="true" />
      <span aria-hidden="true">{found}<span className="tally__total">/{total}</span></span>
    </span>
  );
}
