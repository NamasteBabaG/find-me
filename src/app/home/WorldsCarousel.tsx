"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";
import { PlaceEmblem } from "./PlaceEmblem";
import { Icon } from "@/ui/Icon";

/** Independent worlds: destination symbols keep the actual paintings a surprise. */

export interface CarouselTile {
  key: string;
  label: string;
  soon?: boolean;
}

export interface CarouselWorld {
  slug: string;
  name: string;
  tagline: string;
  /** Not yet available in the catalogue. */
  upcoming: boolean;
  /** Already in this visitor's library. */
  owned: boolean;
  available: boolean;
  palette: { sky: string; ground: string; accent: string };
  tiles: CarouselTile[];
}

export interface WorldsCopy {
  worldOf: string;
  prev: string;
  next: string;
  owned: string;
  inTheMaking: string;
}

export function WorldsCarousel({ worlds, copy }: { worlds: CarouselWorld[]; copy: WorldsCopy }) {
  const [at, setAt] = useState(0);
  const world = worlds[at];
  if (!world) return null;
  const go = (d: number) => setAt((n) => (n + d + worlds.length) % worlds.length);
  const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

  return (
    // The world's palette tints its own tiles and nothing else: the arrows, the
    // counter and the dots are the product's furniture, and a carousel that
    // repaints them per world has no design system left.
    <div className="wc" style={{ ["--wc-sky" as string]: world.palette.sky }}>
      <div className="wc__bar">
        <button type="button" className="wc__arrow wc__arrow--prev" onClick={() => go(-1)} aria-label={copy.prev}>
          <Icon name="chevron" strokeWidth={2.6} />
        </button>
        <div className="wc__title">
          <strong>{world.name}</strong>
          <span className="fm-small">{world.tagline}</span>
          <span className="wc__count">{fill(copy.worldOf, { n: at + 1, total: worlds.length })}</span>
        </div>
        <button type="button" className="wc__arrow wc__arrow--next" onClick={() => go(1)} aria-label={copy.next}>
          <Icon name="chevron" strokeWidth={2.6} />
        </button>
      </div>

      {/* Said only when it tells the parent something: the world is already theirs, or not on sale yet. */}
      {world.owned || !world.available ? <p className="wc__lock">
        {world.owned ? <span className="wc__owned"><Icon name="check" strokeWidth={2.6} />{copy.owned}</span> : null}
        {world.available ? null : <span className="wc__state">{copy.inTheMaking}</span>}
      </p> : null}

      {/* "places", not "worlds": the wizard's world step owns .worlds (a column), and sharing the name
          stretched every place here into one full-width card (2026-11-26). */}
      <div className="places">
        {world.tiles.map((tile, i) => (
          <Reveal as="article" key={tile.key} className="world" delay={(i % 3) * 60}>
            <div className="world__destination">
              <span className="world__route" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <PlaceEmblem place={tile.key} />
            </div>
            <div className="world__body">
              <span className="world__name">{tile.label}</span>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="wc__dots">
        {worlds.map((w, i) => (
          <button
            key={w.slug}
            type="button"
            aria-pressed={i === at}
            aria-label={w.name}
            className={`wc__dot${i === at ? " is-on" : ""}`}
            onClick={() => setAt(i)}
          />
        ))}
      </div>
    </div>
  );
}
