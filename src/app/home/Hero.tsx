"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { GoldStar } from "@/game/components/GoldStar";
import found from "../../../content/home/hero-found.json";

/**
 * Hero: the moment of the game, on the device a family actually holds.
 *
 * Four heroes came before this one — emoji under a torch, a night stage, a
 * porthole roaming a white page. They all showed the WORLD and hoped a visitor
 * would infer the game. Guy drew the line: what is interesting is finding
 * your child in the painting, and nothing says that like watching it happen.
 * So the hero is a screen with the real search HUD (the face, five gold star
 * slots, the hint), a hand that arrives, taps the child, a ring, a bubble in
 * her voice, and a gold star that flies into its empty slot. Every eight
 * seconds the screen is a different device — phone, tablet, laptop — which
 * says "no app, works everywhere" without a word of copy. The words themselves
 * are the ones the site already had; Guy preferred them.
 *
 * On a phone there is no device frame (the visitor is holding one): the board
 * card itself plays the moment under the copy.
 *
 * Nothing here is measured by eye. The child's head comes from the demo
 * patch's anchor through `scripts/refresh-hero-found.ts` (rebuild the crops
 * with `--apply` whenever the beach art or the demo patch changes), and the
 * star's flight is aimed at the first empty slot at runtime, in the screen's
 * own coordinates, so it lands in the slot in every language and at every
 * size. Motion is CSS; with reduced motion the phone simply shows the found
 * child.
 */

/** Five hiding spots per board, three of them open the next place: the tray shows what the game shows. */
const SLOTS = 5;
/** The flying star's box in design px; it shrinks to the slot's size as it lands (see --fs). */
const FLY_BASE = 32;
/** The three devices are drawn at this size and scaled as one to the column (--k). */
const STAGE_W = 704;
/** A portrait board leaves room for the identity header above the found child,
 * even on a 320px phone. Shared by CSS sizing and the cover-point geometry. */
const CARD_ASPECT = 2 / 3;

type Kind = "phone" | "tablet" | "laptop" | "card";
type Crop = keyof typeof found.crops;
const SCREENS: Record<Exclude<Kind, "card">, { w: number; h: number; crop: Crop }> = {
  phone: { w: 288, h: 616, crop: "phone" },
  tablet: { w: 656, h: 480, crop: "wide" },
  laptop: { w: 656, h: 416, crop: "wide" },
};
/** Where a point of an image lands inside a box the image covers (object-fit: cover, centred). */
export function coverPoint(p: { x: number; y: number }, image: number, box: number) {
  if (image > box) {
    const w = image / box;
    return { x: p.x * w - (w - 1) / 2, y: p.y };
  }
  const h = box / image;
  return { x: p.x, y: p.y * h - (h - 1) / 2 };
}
/** A 1x1 transparent gif: the phone crop is only fetched where the phone is shown (>720px). */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const SPARKS: Array<[number, number, string]> = [[-72, -56, "0s"], [80, -72, "0.1s"], [-88, 32, "0.05s"], [96, 24, "0.15s"], [0, -104, "0.08s"]];
const HAND = "M19 27V9.5a3.5 3.5 0 0 1 7 0V22l6.5-1.2a3.5 3.5 0 0 1 4.2 3.4V30c0 6.2-4.6 11-11 11h-3.3c-3.4 0-6.4-1.6-8.3-4.4L7.6 27.5a3 3 0 0 1 4.6-3.7L19 30";

interface Child {
  name: string;
  avatarUrl: string;
}

/** One game screen: the board with the child in it, the search HUD, and the find. */
function Screen({ kind, child }: { kind: Kind; child: Child }) {
  const { t, tf, locale } = useI18n();
  const crop = found.crops[kind === "card" ? "wide" : SCREENS[kind].crop];
  const box = kind === "card" ? CARD_ASPECT : SCREENS[kind].w / SCREENS[kind].h;
  const head = coverPoint(crop.head, crop.width / crop.height, box);
  return (
    <div className={`hero4__screen hero4__screen--${kind}`} data-screen={kind}>
      {kind === "phone" ? (
        <picture>
          <source media="(min-width: 721px)" srcSet={crop.src} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero4__art" src={BLANK} alt="" draggable={false} fetchPriority="high" />
        </picture>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero4__art" src={crop.src} alt="" draggable={false} loading={kind === "card" ? "eager" : "lazy"} fetchPriority={kind === "card" ? "high" : "low"} />
      )}
      <div className="hero4__chrome">
        <div className="hero4__rail">
          <span className="hero4__tool">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></svg>
          </span>
          <span className="hero4__tool">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 21 21M7.5 10.5h6M10.5 7.5v6" /></svg>
          </span>
          <span className="hero4__tool">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 21 21M7.5 10.5h6" /></svg>
          </span>
        </div>
        {/* An editorial preview of the game HUD: identity first, progress second,
            rules and hint on their own row so they never crowd the face. */}
        <div className="hero4__hud" dir={locale === "he" ? "rtl" : "ltr"}>
          <div className="hero4__hud-top">
            <Image src={child.avatarUrl} alt="" width={56} height={56} unoptimized className="hero4__face" draggable={false} />
            <div className="hero4__hud-col">
              <span className="hero4__mission">{tf(t.game.scene.findChild, { name: child.name })}</span>
              <span className="hero4__tray">
                {Array.from({ length: SLOTS }, (_, i) => (
                  <span key={i} className="hero4__slot" data-slot={i === 0 ? "first" : undefined}>
                    <GoldStar empty />
                    {i === 0 ? (
                      <span className="hero4__landed">
                        <GoldStar />
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div className="hero4__hud-footer">
            <span className="hero4__rules">{t.game.scene.findAnyRules}</span>
            <span className="hero4__hintbtn">{t.game.scene.hint}</span>
          </div>
        </div>
      </div>
      {/* The find, anchored on the child's head: ring, sparks, her bubble, the star that flies to the tray, the hand that taps. */}
      <div className="hero4__fx" style={{ left: `${(head.x * 100).toFixed(2)}%`, top: `${(head.y * 100).toFixed(2)}%` }} data-fx>
        <span className="hero4__ring" />
        {SPARKS.map(([sx, sy, delay], i) => (
          <span key={i} className="hero4__spark" style={{ "--sx": `${sx}px`, "--sy": `${sy}px`, animationDelay: delay } as CSSProperties}>
            <GoldStar />
          </span>
        ))}
        <span className="hero4__bubble">{t.home.hero.found}</span>
        <span className="hero4__fly" data-fly>
          <span className="hero4__fly-star">
            <GoldStar />
          </span>
        </span>
        <svg className="hero4__hand" viewBox="0 0 48 48" aria-hidden focusable="false">
          <path d={HAND} fill="var(--white)" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export function Hero({ child, children }: { child: Child; children?: ReactNode }) {
  const { t, locale } = useI18n();
  const h = t.home.hero;
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    let active = true;
    // The stage is drawn at design size and scaled as one, so three devices
    // keep their proportions on any column. A CSS ladder holds until this runs.
    const fit = () => stage.style.setProperty("--k", Math.min(1, stage.clientWidth / STAGE_W).toFixed(4));
    // The star flies to the FIRST EMPTY SLOT, wherever the HUD put it: layout
    // offsets, not client rects, because the phone is tilted and the stage is
    // scaled, and the flight is measured in the screen's own frame.
    const aim = () => {
      if (!active) return;
      for (const screen of Array.from(root.querySelectorAll<HTMLElement>("[data-screen]"))) {
        const slot = screen.querySelector<HTMLElement>("[data-slot]");
        const fx = screen.querySelector<HTMLElement>("[data-fx]");
        const fly = screen.querySelector<HTMLElement>("[data-fly]");
        if (!slot || !fx || !fly) continue;
        const at = (el: HTMLElement) => {
          let x = 0;
          let y = 0;
          let n: HTMLElement | null = el;
          while (n && n !== screen) {
            x += n.offsetLeft;
            y += n.offsetTop;
            n = n.offsetParent as HTMLElement | null;
          }
          return { x, y };
        };
        const s = at(slot);
        const f = at(fx);
        fly.style.setProperty("--fx", `${(s.x + slot.offsetWidth / 2 - f.x).toFixed(1)}px`);
        fly.style.setProperty("--fy", `${(s.y + slot.offsetHeight / 2 - f.y).toFixed(1)}px`);
        fly.style.setProperty("--fs", (slot.offsetWidth / FLY_BASE).toFixed(3));
      }
    };
    const measure = () => {
      fit();
      aim();
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(stage);
    // The HUD's width depends on the display font; aim again once it is in.
    document.fonts?.ready.then(aim).catch(() => {});
    return () => {
      active = false;
      ro?.disconnect();
    };
  }, [locale, child.name]);

  const title = h.title.endsWith("?") ? (
    <>
      {h.title.slice(0, -1)}
      <span className="hero4__q">?</span>
    </>
  ) : (
    h.title
  );

  return (
    <section ref={rootRef} className="hero4" aria-labelledby="hero-title">
      <div className="fm-container hero4__grid">
        <div className="hero4__copy">
          <span className="hero4__pill">{h.pill}</span>
          <h1 id="hero-title" className="hero4__title">
            {title}
          </h1>
          <p className="hero4__lead">{h.lead}</p>
          <div className="hero4__cta">
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
        {/* The moment, on three devices in turn; decoration to a screen reader, the copy says it all. */}
        <div ref={stageRef} className="hero4__stage" aria-hidden>
          <div className="hero4__frames">
            <div className="hero4__dev hero4__dev--phone">
              <div className="hero4__frame hero4__frame--phone">
                <Screen kind="phone" child={child} />
              </div>
            </div>
            <div className="hero4__dev hero4__dev--tablet">
              <div className="hero4__frame hero4__frame--tablet">
                <Screen kind="tablet" child={child} />
              </div>
            </div>
            <div className="hero4__dev hero4__dev--laptop">
              <div className="hero4__frame hero4__frame--laptop">
                <Screen kind="laptop" child={child} />
              </div>
              <div className="hero4__base" />
            </div>
            <div className="hero4__labels">
              <span className="hero4__label hero4__label--phone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
                {h.devices.phone}
              </span>
              <span className="hero4__label hero4__label--tablet">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M11 17.5h2" /></svg>
                {h.devices.tablet}
              </span>
              <span className="hero4__label hero4__label--laptop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M2 19h20" /></svg>
                {h.devices.laptop}
              </span>
            </div>
          </div>
          <div className="hero4__card" style={{ aspectRatio: CARD_ASPECT }}>
            <Screen kind="card" child={child} />
          </div>
        </div>
      </div>
      {children ? <div className="hero4__marquee">{children}</div> : null}
    </section>
  );
}
