import type { CSSProperties } from "react";
import type { WorldSummary } from "@/domain/adventure/summary";
import { PlaceEmblem } from "@/app/home/PlaceEmblem";
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

/** Three places of the route around the child, left to right (mirrored for right to left). */
const GLIMPSE_SPOTS = [{ x: 0.2, y: 0.6 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.6 }];

/**
 * A piece of the game's icon map with the child standing where they are: the place they are at, with the place
 * before and the place after it on the trail, each as the emblem the site and the game show. The words beside it
 * say the same thing for anyone who can't see it.
 */
export function MapGlimpse({ world, avatarUrl, name }: { world: WorldSummary; avatarUrl: string | null; name: string; eager?: boolean }) {
  const here = Math.max(0, world.boards.indexOf(world.here.boardSlug));
  // A window of up to three places that holds the child's: one before and one after, where the route has them.
  const first = Math.max(0, Math.min(here - 1, world.boards.length - 3));
  const shown = world.boards.slice(first, first + 3).map((board, i) => ({ board, index: first + i, spot: GLIMPSE_SPOTS[i]! }));
  const style = { "--glimpse-sky": world.colors.sky, "--glimpse-ground": world.colors.ground } as CSSProperties;
  return (
    <div className="glimpse" aria-hidden="true" style={style}>
      <svg className="glimpse__trail" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
        <path d="M0 640Q100 600 200 600T500 500T800 600T1000 640" />
      </svg>
      {shown.map(({ board, index, spot }) => {
        const state = world.route[index] ?? "ahead";
        const at = { "--x": spot.x, "--y": spot.y } as CSSProperties;
        return (
          <span key={board} className={`glimpse__stop glimpse__stop--${state}`} style={at}>
            {board === world.here.boardSlug ? <Sticker url={avatarUrl} name={name} className="glimpse__sticker" /> : null}
            <span className="glimpse__medal"><PlaceEmblem place={board} />{state === "stamped" ? <span className="glimpse__done">✓</span> : null}</span>
            {board === world.here.boardSlug ? <span className="glimpse__place">{world.here.name}</span> : null}
          </span>
        );
      })}
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
      <span aria-hidden="true" dir="ltr">{found}<span className="tally__total">/{total}</span></span>
    </span>
  );
}
