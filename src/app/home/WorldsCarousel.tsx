"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

/** Independent worlds, with explicit purchase availability and preview art. */

export interface CarouselTile {
  key: string;
  label: string;
  thumb?: string;
  spots?: string[];
  soon?: boolean;
}

export interface CarouselWorld {
  slug: string;
  name: string;
  tagline: string;
  glyph: string;
  /** Not yet painted: the tiles are place names, not pictures. */
  upcoming: boolean;
  /** Already in this visitor's library. */
  owned: boolean;
  available: boolean;
  /** At least one displayed painting differs from the creation catalogue. */
  previewArt: boolean;
  palette: { sky: string; ground: string; accent: string };
  tiles: CarouselTile[];
}

export interface WorldsCopy {
  worldOf: string;
  prev: string;
  next: string;
  owned: string;
  inTheMaking: string;
  available: string;
  previewArt: string;
  spotsAria: string;
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
    <div className="wc" style={{ ["--wc-ground" as string]: world.palette.ground, ["--wc-sky" as string]: world.palette.sky }}>
      <div className="wc__bar">
        <button type="button" className="wc__arrow" onClick={() => go(-1)} aria-label={copy.prev}>
          ‹
        </button>
        <div className="wc__title">
          <strong>{world.name}</strong>
          <span className="fm-small">{world.tagline}</span>
          <span className="wc__count">{fill(copy.worldOf, { n: at + 1, total: worlds.length })}</span>
        </div>
        <button type="button" className="wc__arrow" onClick={() => go(1)} aria-label={copy.next}>
          ›
        </button>
      </div>

      <p className="wc__lock">
        {world.owned ? <span className="fm-sticker-badge fm-sticker-badge--sun">✓ {copy.owned}</span> : null}
        <span className="fm-badge fm-badge--sea">{world.available ? copy.available : copy.inTheMaking}</span>
        {world.previewArt ? <span className="wc__soon">{copy.previewArt}</span> : null}
      </p>

      <div className={`worlds${world.upcoming ? " worlds--upcoming" : ""}`}>
        {world.tiles.map((tile, i) => (
          <Reveal key={tile.key} className={`world${tile.soon ? " world--soon" : ""}`} delay={(i % 3) * 60}>
            <div className="world__img">
              {tile.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tile.thumb} alt="" loading="lazy" />
              ) : (
                <span className="world__veil" aria-hidden>
                  {world.glyph}
                </span>
              )}
            </div>
            <div className="world__body">
              <span className="world__name">{tile.label}</span>
              {tile.spots ? (
                <div className="world__items" aria-label={copy.spotsAria}>
                  {tile.spots.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              ) : null}
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
