"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Hero: "Where Am I?" over a real world, with a searchlight that follows the
 * pointer (and roams by itself when idle). Noa is tucked into the scene; when
 * the light finds her she pops up with "Found me!". The whole product in one
 * gesture: a busy illustrated world, a child hiding in it, you searching.
 */
export function Hero({ sceneSrc }: { sceneSrc: string }) {
  const { t } = useI18n();
  const h = t.home.hero;
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.55, active: false, last: 0 });
  const [lit, setLit] = useState(false);

  // Noa's spot inside the scene strip (fractions of the strip, not the art).
  const NOA = { x: 0.76, y: 0.62 };

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = pointer.current;
      const idle = !p.active || now - p.last > 2500;
      if (idle && !reduced) {
        const s = (now - start) / 1000;
        p.x = 0.5 + 0.38 * Math.cos(s * 0.35);
        p.y = 0.55 + 0.25 * Math.sin(s * 0.55);
      }
      el.style.setProperty("--lx", `${(p.x * 100).toFixed(2)}%`);
      el.style.setProperty("--ly", `${(p.y * 100).toFixed(2)}%`);
      const rect = el.getBoundingClientRect();
      const dx = (p.x - NOA.x) * rect.width;
      const dy = (p.y - NOA.y) * rect.height;
      setLit(Math.hypot(dx, dy) < Math.max(120, rect.width * 0.09));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, active: true, last: performance.now() };
  };

  const title = h.title.endsWith("?") ? (
    <>
      {h.title.slice(0, -1)}
      <span className="hero2__q">?</span>
    </>
  ) : (
    h.title
  );

  return (
    <section className="hero2" aria-labelledby="hero-title">
      <div className="hero2__stars" aria-hidden />
      <div className="fm-container hero2__content">
        <span className="fm-pill fm-pill--night hero2__pill">{h.pill}</span>
        <h1 id="hero-title" className="hero2__title">
          {title}
        </h1>
        <p className="hero2__lead">{h.lead}</p>
        <div className="hero2__cta">
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

      <div ref={sceneRef} className="hero2__scene" onPointerMove={onPointerMove} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sceneSrc} alt="" className="hero2__img hero2__img--dim" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sceneSrc} alt="" className="hero2__img hero2__img--lit" draggable={false} />
        <div className="hero2__fade" />
        <div className={`hero2__noa${lit ? " is-lit" : ""}`} style={{ left: `${NOA.x * 100}%`, top: `${NOA.y * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/noa-face.png" alt="" className="fm-sticker hero2__noa-img" width={96} height={96} draggable={false} />
          <span className="hero2__bubble">{h.found}</span>
        </div>
        <span className="hero2__hint fm-pill fm-pill--night">{h.searchHint}</span>
        <ul className="hero2__facts">
          {h.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
