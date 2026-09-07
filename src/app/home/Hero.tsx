"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import heroArt from "../../../content/home/hero-art.json";

/**
 * Hero: a torch sweeping a real world.
 *
 * This used to be a dark stage scattered with emoji — shells, kites, rockets —
 * that the beam uncovered, and a comment saying "no world image here: the real
 * world lives in the demo below". That was a fair trade when there were nine
 * boards. There are twenty-seven now, they are the best thing the product has,
 * and a visitor met a screen of emoji before seeing any of them.
 *
 * So the torch lights the paintings themselves — through a hard-edged porthole
 * on a pure white page. It was a night stage first (the board dimmed under a
 * blue wash, a feathered beam), and Guy read the dark hero plus the blue demo
 * as a colour island in a paper-white site. He was right: now the world is
 * simply invisible until the light lands on it, which is exactly what the game
 * is. The circle moves through one board per world, so the first ten seconds
 * of the page say "there are worlds in here" without a word of copy.
 *
 * Rebuild marketing copies with scripts/refresh-hero-art.ts --apply whenever
 * board art changes. One manifest feeds BOTH ghost and flashlight layers.
 */
const WORLDS = heroArt;
const HOLD_MS = 12000;
const NOA_DESKTOP = { x: 0.87, y: 0.66 };
const NOA_MOBILE = { x: 0.8, y: 0.74 };
// The idle torch orbits AROUND the copy instead of wandering through it: ink
// text over a lit painting is unreadable, and the white hero has no scrim to
// save it the way the dark one did. One angle for x and y = a closed ellipse;
// its right edge passes Noa, so she still gets found once a lap.
const ORBIT_DESKTOP = { cx: 0.5, cy: 0.55, rx: 0.37, ry: 0.29 };
const ORBIT_MOBILE = { cx: 0.5, cy: 0.66, rx: 0.42, ry: 0.17 };

export function Hero({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const h = t.home.hero;
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, active: false, last: 0 });
  const [lit, setLit] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [at, setAt] = useState(0);
  const noaRef = useRef(NOA_DESKTOP);
  const orbitRef = useRef(ORBIT_DESKTOP);
  const navLinks = useRef<HTMLElement[] | null>(null);

  // Noa and the orbit move out of the way of the copy on small screens.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      setNarrow(mq.matches);
      noaRef.current = mq.matches ? NOA_MOBILE : NOA_DESKTOP;
      orbitRef.current = mq.matches ? ORBIT_MOBILE : ORBIT_DESKTOP;
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

  // The torch steps aside for anything clickable: while the pointer is on a
  // nav link or a hero button the whole light fades out (fast, never a cut)
  // and comes back the moment it leaves. A circle parked under a button felt
  // stuck (Guy). Delegated listeners, so the header — a sibling — counts too.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const clicky = (t: EventTarget | null) =>
      t instanceof Element && t.closest(".hero3__content a, .hero3__content button, .fm-header a, .fm-header button") !== null;
    const over = (e: PointerEvent) => {
      if (clicky(e.target)) el.classList.add("hero3--hush");
    };
    const out = (e: PointerEvent) => {
      if (clicky(e.target) && !clicky(e.relatedTarget)) el.classList.remove("hero3--hush");
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      el.classList.remove("hero3--hush");
    };
  }, []);

  useEffect(() => {
    // The circle's vars live on the SECTION, so the stage layers, the ring and
    // the lit copy of the words all read the same torch.
    const el = sectionRef.current;
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
      if (idle) {
        const o = orbitRef.current;
        const a = ((now - start) / 1000) * 0.22;
        // Reduced motion: the torch does not roam — it rests just off Noa, so
        // the still page is a found child in a lit circle, not a circle parked
        // behind the headline.
        const tx = reduced ? noaRef.current.x - 0.02 : o.cx + o.rx * Math.cos(a);
        const ty = reduced ? noaRef.current.y - 0.04 : o.cy + o.ry * Math.sin(a);
        p.x += (tx - p.x) * (reduced ? 0.2 : 0.02);
        p.y += (ty - p.y) * (reduced ? 0.2 : 0.02);
      }
      el.style.setProperty("--lx", `${(p.x * 100).toFixed(2)}%`);
      el.style.setProperty("--ly", `${(p.y * 100).toFixed(2)}%`);
      const rect = el.getBoundingClientRect();
      const noa = noaRef.current;
      const d = Math.hypot((p.x - noa.x) * rect.width, (p.y - noa.y) * rect.height);
      setLit(d < 96);
      // The torch lighting the nav: a link whose middle is inside the circle
      // flips white (CSS scoped to the glass header); a hovered link goes
      // yellow and wins. Viewport rects each frame, so scrolling stays exact.
      if (!navLinks.current) navLinks.current = Array.from(document.querySelectorAll<HTMLElement>(".fm-header--clear .fm-nav a"));
      if (navLinks.current.length > 0) {
        const cx = rect.left + p.x * rect.width;
        const cy = rect.top + p.y * rect.height;
        const torch = parseFloat(getComputedStyle(el).getPropertyValue("--torch")) || 160;
        for (const a of navLinks.current) {
          const r = a.getBoundingClientRect();
          a.classList.toggle("is-lit", Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)) < torch + 8);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      navLinks.current?.forEach((a) => a.classList.remove("is-lit"));
    };
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

  // One plate per world, crossfading inside the porthole.
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
    <section ref={sectionRef} className="hero3" aria-labelledby="hero-title">
      <div ref={stageRef} className="hero3__stage" onPointerMove={track} onPointerDown={track} aria-hidden>
        <div className="hero3__ghost">{plates("hero3__plate")}</div>
        <div className="hero3__hidden">{plates("hero3__plate")}</div>
        <div className="hero3__ring" />
        <div className={`hero3__noa${lit ? " is-lit" : ""}`} style={{ left: `${(narrow ? NOA_MOBILE : NOA_DESKTOP).x * 100}%`, top: `${(narrow ? NOA_MOBILE : NOA_DESKTOP).y * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/noa-face.png" alt="" className="fm-sticker hero3__noa-img" width={104} height={104} draggable={false} />
          <span className="hero3__bubble">{h.found}</span>
        </div>
        <span className="hero3__hint fm-pill">{h.searchHint}</span>
      </div>

      <div className="fm-container hero3__content">
        <span className="hero3__pill">{h.pill}</span>
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
          <a href="#demo" className="fm-btn fm-btn--night fm-btn--lg">
            {h.demo}
          </a>
        </div>
      </div>
      {/* The same words, white, visible only inside the torch: the light paints
          what it crosses. The pill and the buttons are opaque chips the light
          never shows through — they hold the layout here, invisibly. */}
      <div className="hero3__lit" aria-hidden>
        <div className="fm-container hero3__content hero3__content--lit">
          <span className="hero3__pill">{h.pill}</span>
          <div className="hero3__title">{title}</div>
          <p className="hero3__lead">{h.lead}</p>
          <div className="hero3__cta">
            <span className="fm-btn fm-btn--lg">
              {h.cta}
              <span className="fm-btn__arrow">➜</span>
            </span>
            <span className="fm-btn fm-btn--night fm-btn--lg">{h.demo}</span>
          </div>
        </div>
      </div>
      {children ? <div className="hero3__marquee">{children}</div> : null}
    </section>
  );
}
