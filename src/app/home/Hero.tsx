"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Hero: a torch sweeping a real world.
 *
 * This used to be a dark stage scattered with emoji — shells, kites, rockets —
 * that the beam uncovered, and a comment saying "no world image here: the real
 * world lives in the demo below". That was a fair trade when there were nine
 * boards. There are twenty-seven now, they are the best thing the product has,
 * and a visitor met a screen of emoji before seeing any of them.
 *
 * So the beam lights the paintings themselves. The board sits under a deep blue
 * wash — legible as a place, too dark to search — and the torch restores full
 * colour wherever it lands, which is exactly what the game is. It moves through
 * one board per world, so the first ten seconds of the page say "there are
 * worlds in here" without a word of copy.
 *
 * Art is built from the boards themselves:
 *   sharp(base.webp).resize(1400, 934, { fit: "cover", position: "attention" }).webp({ quality: 58 })
 */
const WORLDS = [
  { slug: "newyork", src: "/home/hero-newyork.webp" },
  { slug: "dragoncave", src: "/home/hero-dragoncave.webp" },
  { slug: "futurecity", src: "/home/hero-futurecity.webp" },
];
const HOLD_MS = 7000;
const NOA_DESKTOP = { x: 0.87, y: 0.66 };
const NOA_MOBILE = { x: 0.8, y: 0.74 };

export function Hero({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const h = t.home.hero;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, active: false, last: 0 });
  const [lit, setLit] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [at, setAt] = useState(0);
  const noaRef = useRef(NOA_DESKTOP);

  // Noa moves out of the way of the copy on small screens.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      setNarrow(mq.matches);
      noaRef.current = mq.matches ? NOA_MOBILE : NOA_DESKTOP;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // One world at a time. Held still for anyone who reads motion as noise.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setAt((n) => (n + 1) % WORLDS.length), HOLD_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = pointer.current;
      // The torch roams on its own until a pointer takes it, and goes back to
      // roaming when one is put down. On a phone there is no pointer at all,
      // so roaming is the whole show — which is why none of this is hidden on
      // small screens any more.
      const idle = !p.active || now - p.last > 2500;
      if (idle && !reduced) {
        const s = (now - start) / 1000;
        const tx = 0.5 + 0.34 * Math.cos(s * 0.16);
        const ty = 0.5 + 0.26 * Math.sin(s * 0.23);
        p.x += (tx - p.x) * 0.02;
        p.y += (ty - p.y) * 0.02;
      }
      el.style.setProperty("--lx", `${(p.x * 100).toFixed(2)}%`);
      el.style.setProperty("--ly", `${(p.y * 100).toFixed(2)}%`);
      const rect = el.getBoundingClientRect();
      const noa = noaRef.current;
      const d = Math.hypot((p.x - noa.x) * rect.width, (p.y - noa.y) * rect.height);
      setLit(d < 96);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, active: true, last: performance.now() };
  };

  const title = h.title.endsWith("?") ? (
    <>
      {h.title.slice(0, -1)}
      <span className="hero3__q">?</span>
    </>
  ) : (
    h.title
  );

  // Both layers are the same file, so lighting a world costs no second download.
  const plates = (className: string) =>
    WORLDS.map((w, i) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={w.slug}
        src={w.src}
        alt=""
        className={`${className}${i === at ? " is-on" : ""}`}
        loading={i === 0 ? "eager" : "lazy"}
        fetchPriority={i === 0 ? "high" : "low"}
        draggable={false}
      />
    ));

  return (
    <section className="hero3" aria-labelledby="hero-title">
      <div ref={stageRef} className="hero3__stage" onPointerMove={track} onPointerDown={track} aria-hidden>
        <div className="hero3__dark">{plates("hero3__plate")}</div>
        <div className="hero3__stars" />
        <div className="hero3__hidden">{plates("hero3__plate")}</div>
        <div className="hero3__beam" />
        <div className="hero3__ring" />
        <div className={`hero3__noa${lit ? " is-lit" : ""}`} style={{ left: `${(narrow ? NOA_MOBILE : NOA_DESKTOP).x * 100}%`, top: `${(narrow ? NOA_MOBILE : NOA_DESKTOP).y * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/noa-face.png" alt="" className="fm-sticker hero3__noa-img" width={104} height={104} draggable={false} />
          <span className="hero3__bubble">{h.found}</span>
        </div>
        <span className="hero3__hint fm-pill fm-pill--night">{h.searchHint}</span>
      </div>

      <div className="fm-container hero3__content">
        <span className="fm-pill fm-pill--night hero3__pill">{h.pill}</span>
        <h1 id="hero-title" className="hero3__title">
          {title}
        </h1>
        <p className="hero3__lead">{h.lead}</p>
        <div className="hero3__cta">
          <Link href="/create" className="fm-btn fm-btn--lg">
            {h.cta}
            <span className="fm-btn__arrow" aria-hidden>
              ➜
            </span>
          </Link>
          <a href="#demo" className="fm-btn fm-btn--white fm-btn--lg">
            {h.demo}
          </a>
        </div>
      </div>
      {children ? <div className="hero3__marquee">{children}</div> : null}
    </section>
  );
}
