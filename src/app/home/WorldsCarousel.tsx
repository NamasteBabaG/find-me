"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

/**
 * The worlds, one at a time, with arrows.
 *
 * A flat grid of every board said "here are twenty-seven places" and never said
 * "these are three worlds, and they are a ladder" — which is the thing a parent
 * is actually choosing between. One world on screen at a time, with its own
 * name and keepsake, makes the ladder visible; the worlds still being painted
 * sit in the same carousel, locked, so the shape of what is coming is part of
 * the offer instead of a bigger number in the price table.
 */

export interface CarouselTile {
  key: string;
  label: string;
  thumb?: string;
  spots?: string[];
  soon?: boolean;
  /** Shown behind glass: the painting exists, this world is not bought yet. */
  blurred?: boolean;
}

export interface CarouselWorld {
  slug: string;
  name: string;
  tagline: string;
  glyph: string;
  /** Not yet painted: the tiles are place names, not pictures. */
  upcoming: boolean;
  /** Cannot be bought on its own — the name of the world that opens it. */
  opensAfter?: string;
  palette: { sky: string; ground: string; accent: string };
  tiles: CarouselTile[];
}

export interface WorldsCopy {
  worldOf: string;
  prev: string;
  next: string;
  locked: string;
  opensAfter: string;
  inTheMaking: string;
  harder: string;
  spotsAria: string;
}

export function WorldsCarousel({ worlds, copy }: { worlds: CarouselWorld[]; copy: WorldsCopy }) {
  const [at, setAt] = useState(0);
  const world = worlds[at];
  if (!world) return null;
  const go = (d: number) => setAt((n) => (n + d + worlds.length) % worlds.length);
  const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

  return (
    <div className="wc" style={{ ["--wc-accent" as string]: world.palette.accent, ["--wc-ground" as string]: world.palette.ground, ["--wc-sky" as string]: world.palette.sky }}>
      <div className="wc__bar">
        <button type="button" className="wc__arrow" onClick={() => go(-1)} aria-label={copy.prev}>
          ‹
        </button>
        <div className="wc__title">
          <span className="wc__glyph" aria-hidden>
            {world.glyph}
          </span>
          <strong>{world.name}</strong>
          <span className="fm-small">{world.tagline}</span>
          <span className="wc__count">{fill(copy.worldOf, { n: at + 1, total: worlds.length })}</span>
        </div>
        <button type="button" className="wc__arrow" onClick={() => go(1)} aria-label={copy.next}>
          ›
        </button>
      </div>

      {world.opensAfter ? (
        <p className="wc__lock">
          <span className="fm-sticker-badge fm-sticker-badge--sun">🔒 {copy.locked}</span>
          <span>{fill(copy.opensAfter, { world: world.opensAfter })}</span>
          {world.upcoming ? <span className="wc__soon">{copy.inTheMaking}</span> : null}
          <span className="wc__soon">{copy.harder}</span>
        </p>
      ) : null}

      <div className={`worlds${world.upcoming ? " worlds--upcoming" : ""}`}>
        {world.tiles.map((tile, i) => (
          <Reveal key={tile.key} className={`world${tile.soon ? " world--soon" : ""}`} delay={(i % 3) * 60}>
            <div className={`world__img${tile.blurred ? " world__img--veiled" : ""}`}>
              {tile.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tile.thumb} alt="" loading="lazy" />
              ) : (
                <span className="world__veil" aria-hidden>
                  {world.glyph}
                </span>
              )}
              {tile.blurred ? (
                <span className="world__lockmark" aria-hidden>
                  🔒
                </span>
              ) : null}
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

      <div className="wc__dots" role="tablist">
        {worlds.map((w, i) => (
          <button
            key={w.slug}
            type="button"
            role="tab"
            aria-selected={i === at}
            aria-label={w.name}
            className={`wc__dot${i === at ? " is-on" : ""}`}
            onClick={() => setAt(i)}
          />
        ))}
      </div>
    </div>
  );
}
