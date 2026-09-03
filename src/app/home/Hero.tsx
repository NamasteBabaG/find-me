"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { seededRng } from "@/lib/random";

/**
 * Hero: "Where Am I?" on a dark stage. A searchlight follows the pointer
 * (and roams on its own) and reveals a hidden layer of little doodles —
 * shells, kites, rockets — invisible outside the beam. Noa hides in there
 * too; when the light finds her she pops up with "Found me!".
 * No world image here: the real world lives in the demo right below.
 */
const DOODLES = ["🐚", "⭐", "🍃", "🪁", "⚓", "🍉", "🚀", "🦜", "🏰", "🛟", "🌴", "🐒", "👽", "🎈", "🦀", "🔭", "⛵", "🍦", "🦋", "🪐", "🐋", "🎪", "🐢", "🌋"];
const NOA_DESKTOP = { x: 0.74, y: 0.6 };
const NOA_MOBILE = { x: 0.82, y: 0.76 };

interface Doodle {
  glyph: string;
  x: number;
  y: number;
  size: number;
  rot: number;
}

export function Hero({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const h = t.home.hero;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, active: false, last: 0 });
  const [lit, setLit] = useState(false);
  const [narrow, setNarrow] = useState(false);
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

  // Deterministic scatter (same on server and client → no hydration mismatch).
  const doodles = useMemo<Doodle[]>(() => {
    const rng = seededRng("hero-doodles");
    const out: Doodle[] = [];
    for (let i = 0; i < 56; i++) {
      const x = rng();
      const y = rng();
      // keep the headline area a little clearer
      if (y > 0.28 && y < 0.62 && x > 0.2 && x < 0.8 && rng() < 0.7) continue;
      out.push({ glyph: DOODLES[i % DOODLES.length] ?? "✨", x, y, size: 20 + Math.round(rng() * 28), rot: Math.round((rng() - 0.5) * 50) });
    }
    return out;
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = pointer.current;
      const idle = !p.active || now - p.last > 2500;
      if (idle && !reduced) {
        const s = (now - start) / 1000;
        const tx = 0.5 + 0.4 * Math.cos(s * 0.14);
        const ty = 0.5 + 0.3 * Math.sin(s * 0.21);
        p.x += (tx - p.x) * 0.02;
        p.y += (ty - p.y) * 0.02;
      }
      el.style.setProperty("--lx", `${(p.x * 100).toFixed(2)}%`);
      el.style.setProperty("--ly", `${(p.y * 100).toFixed(2)}%`);
      const rect = el.getBoundingClientRect();
      const noa = noaRef.current;
      const d = Math.hypot((p.x - noa.x) * rect.width, (p.y - noa.y) * rect.height);
      setLit(d < 90);
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

  return (
    <section className="hero3" aria-labelledby="hero-title">
      <div ref={stageRef} className="hero3__stage" onPointerMove={track} onPointerDown={track} aria-hidden>
        <div className="hero3__stars" />
        <div className="hero3__hidden">
          {doodles.map((d, i) => (
            <span key={i} className="hero3__doodle" style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, fontSize: d.size, transform: `translate(-50%, -50%) rotate(${d.rot}deg)` }}>
              {d.glyph}
            </span>
          ))}
        </div>
        <div className="hero3__beam" />
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
          <Link href="/create" className="fm-btn fm-btn--xl">
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
