"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { createHref, displayName, useNameStore } from "./name-store";

export interface HeroWorld {
  slug: string;
  name: string;
  thumbnail: string;
}

/**
 * Hero: the headline is the product. Parents type the child's name and the
 * whole page becomes "Where's Noa?". The art is a stack of world postcards
 * with the demo child peeking out — no image generation, only our assets.
 */
export function Hero({ worlds }: { worlds: HeroWorld[] }) {
  const { t, tf } = useI18n();
  const h = t.home.hero;
  const raw = useNameStore((s) => s.raw);
  const setRaw = useNameStore((s) => s.setRaw);
  const fallback = t.home.defaultName;
  const name = displayName(raw, fallback);
  const [bubble, setBubble] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setBubble((b) => (b + 1) % h.bubbles.length), 6000);
    return () => clearInterval(id);
  }, [h.bubbles.length]);

  const [a, b, c] = worlds;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden>
        <span className="blob blob--1" />
        <span className="blob blob--2" />
        <span className="blob blob--3" />
        <span className="blob blob--4" />
      </div>
      <div className="fm-container hero__inner">
        <div className="hero__copy">
          <span className="fm-pill">
            <span aria-hidden>✨</span> {h.pill}
          </span>
          <h1 id="hero-title" className="hero__title">
            {h.titleBefore}{" "}
            <span className="name-inline" data-value={raw || fallback}>
              <input className="name-inline__input" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={fallback} aria-label={h.nameAria} maxLength={16} size={Math.max(2, (raw || fallback).length)} autoComplete="off" spellCheck={false} />
              <span className="name-inline__pen" aria-hidden>
                ✏️
              </span>
            </span>
            {h.titleAfter}
          </h1>
          <p className="hero__lead">{tf(h.lead, { name })}</p>
          <div className="hero__cta">
            <Link href={createHref(raw)} className="fm-btn fm-btn--xl">
              {tf(h.cta, { name })}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Link>
            <a href="#demo" className="fm-btn fm-btn--ghost fm-btn--lg">
              {h.demo}
            </a>
          </div>
          <ul className="hero__facts">
            {h.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <div className="hero__art" aria-hidden>
          <div className="postcards">
            {a ? (
              <div className="postcard postcard--1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbnail} alt="" />
                <span className="fm-sticker-badge fm-sticker-badge--sun postcard__label">{a.name}</span>
              </div>
            ) : null}
            {b ? (
              <div className="postcard postcard--2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.thumbnail} alt="" />
                <span className="fm-sticker-badge fm-sticker-badge--aqua postcard__label">{b.name}</span>
              </div>
            ) : null}
            {c ? (
              <div className="postcard postcard--3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumbnail} alt="" />
                <span className="fm-sticker-badge postcard__label">{c.name}</span>
              </div>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/noa-face.png" alt="" className="fm-sticker peeker" width={132} height={132} />
            <span className="peeker__bubble" key={bubble}>
              {h.bubbles[bubble]}
            </span>
            <span className="float-sticker float-sticker--1">🐚</span>
            <span className="float-sticker float-sticker--2">⭐</span>
            <span className="float-sticker float-sticker--3">🍃</span>
            <span className="float-sticker float-sticker--4">💡</span>
          </div>
        </div>
      </div>
    </section>
  );
}
