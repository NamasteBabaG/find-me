import Link from "next/link";
import type { SceneDefinition } from "@/domain/scene/schema";
import { PACKAGES, PACKAGE_ORDER, boardsFor, priceFor, searchesFor } from "@/domain/package";
import { formatMoney, pick, tf, type Currency, type Dictionary, type Locale } from "@/i18n";
import { Reveal } from "./Reveal";
import { WorldsCarousel, type CarouselWorld } from "./WorldsCarousel";

export const WORLD_GLYPHS: Record<string, string> = {
  // Around the World
  newyork: "🗽", amazon: "🦜", paris: "🎠", marrakech: "🏮", giza: "🐫", tokyo: "🌸", greatwall: "🐉", sydney: "🏄", antarctica: "🐧",
  // Retired from world 1, kept for world 3 and for old games still in libraries
  beach: "🏖️", jungle: "🌴", space: "🚀", city: "🏙️", ship: "⚓", stadium: "🏟️", market: "🍉", park: "🪁", volcano: "🌋",
};
const STEP_ICONS = ["📷", "🗺️", "💌", "🎉"] as const;
const STEP_TONES = ["sun", "aqua", "lavender", "coral"] as const;
/** The holiday icon follows the locale: Hebrew site → menorah, everywhere else → a generic tree. */
const occasionIcons = (locale: Locale) => ["🎂", "✈️", "👵", locale === "he" ? "🕎" : "🎄"] as const;
const TRUST_ICONS = ["🗑️", "🔒", "🚫", "🧠"] as const;

interface SectionProps {
  t: Dictionary;
  locale: Locale;
}

/* ─── Marquee: world chips ─── */
export function Marquee({ scenes, locale }: { scenes: SceneDefinition[]; locale: Locale }) {
  const items = scenes.map((s) => ({ key: s.slug, glyph: WORLD_GLYPHS[s.slug] ?? "✨", name: pick(s.name, locale), soon: !s.active }));
  const all = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee__track">
        {all.map((it, i) => (
          <span key={`${it.key}-${i}`} className={`chip${it.soon ? " chip--soon" : ""}`}>
            <span className="chip__glyph">{it.glyph}</span> {it.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── How it works ─── */
export function HowItWorks({ t }: SectionProps) {
  const h = t.home.how;
  return (
    <section id="how" className="how">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{h.pill}</span>
          <h2>{h.title}</h2>
          <p className="fm-lead">{h.lead}</p>
        </Reveal>
        <ol className="steps">
          {h.steps.map((s, i) => (
            <Reveal as="li" key={s.title} className="step" delay={i * 90}>
              <span className="step__num" aria-hidden>
                {i + 1}
              </span>
              <span className={`step__icon step__icon--${STEP_TONES[i] ?? "sun"}`} aria-hidden>
                {STEP_ICONS[i] ?? "✨"}
              </span>
              <span className="fm-badge fm-badge--outline step__time">{s.time}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── What's inside: six equal cards with a check ─── */
const INSIDE_ORDER = ["three", "hints", "noFail", "replay", "bag", "link"] as const;
const INSIDE_TONES = ["sun", "aqua", "coral", "lavender", "lime", "sea"] as const;

export function Inside({ t }: SectionProps) {
  const s = t.home.inside;
  return (
    <section id="inside" className="fm-section">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{s.pill}</span>
          <h2>{s.title}</h2>
          <p className="fm-lead">{s.lead}</p>
        </Reveal>
        <div className="features">
          {INSIDE_ORDER.map((key, i) => {
            const tile = s.tiles[key];
            return (
              <Reveal key={key} className={`feature feature--${INSIDE_TONES[i] ?? "sun"}`} delay={(i % 3) * 80}>
                <span className="feature__check" aria-hidden>
                  ✓
                </span>
                <h3>{tile.title}</h3>
                <p>{tile.text}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Gift ─── */
export function GiftSection({ t, locale }: SectionProps) {
  const g = t.home.gift;
  return (
    <section id="gift" className="gift-sec">
      <div className="fm-container">
        <div className="fm-sheet fm-sheet--lavender">
          <Reveal className="sec-head">
            <span className="fm-pill">{g.pill}</span>
            <h2>{g.title}</h2>
            <p className="fm-lead">{g.lead}</p>
          </Reveal>
          <div className="gift-grid">
            <Reveal className="gift-visual" delay={80}>
              <div className="gift-box" aria-hidden>
                <span className="gift-box__ribbon" />
                <span className="gift-box__ribbon gift-box__ribbon--h" />
                <div className="gift-tag">
                  <span className="fm-eyebrow">{g.tagEyebrow}</span>
                  <strong>{g.tagName}</strong>
                  <span className="fm-small">{g.tagFrom}</span>
                </div>
              </div>
              <ul className="gift-features">
                {g.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Reveal>
            <ul className="occasions">
              {g.occasions.map((o, i) => (
                <Reveal as="li" key={o.title} className="occasion" delay={i * 70}>
                  <span className="occasion__icon" aria-hidden>
                    {occasionIcons(locale)[i] ?? "🎁"}
                  </span>
                  <h3>{o.title}</h3>
                  <p>{o.text}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Worlds ─── */
export function Worlds({ t, locale, scenes, activeSlugs, carousel }: SectionProps & { scenes: SceneDefinition[]; activeSlugs: string[]; carousel: CarouselWorld[] }) {
  const w = t.home.worlds;
  // Counted off the carousel, which is what the visitor is looking at: three
  // worlds, and every board inside them. It used to count only the boards on
  // sale today and read "9 places", which undersold the catalog by two thirds
  // and framed the whole section as a list of places when the thing being
  // offered is worlds. The locks in the carousel say what is available; the
  // headline is allowed to say what exists.
  const worldCount = carousel.length;
  const places = carousel.reduce((n, world) => n + world.tiles.length, 0);
  const perPlace = 3;
  return (
    <section id="worlds" className="worlds-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{w.pill}</span>
          <h2>
            <span className="worlds-count">{worldCount}</span> {w.titleWorlds} <span className="worlds-count">{places}</span> {w.titlePlaces}{" "}
            <span className="worlds-count">{places * perPlace}</span> {w.titleSpots}
          </h2>
          <p className="fm-lead">{w.lead}</p>
        </Reveal>
        <WorldsCarousel
          worlds={carousel}
          copy={{
            worldOf: w.worldOf,
            prev: w.prev,
            next: w.next,
            owned: w.owned,
            opensAfter: w.opensAfter,
            inTheMaking: w.inTheMaking,
            harder: w.harder,
            spotsAria: w.spotsAria,
          }}
        />
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
export function Pricing({ t, locale, activeCount, currency }: SectionProps & { activeCount: number; currency: Currency }) {
  const p = t.home.pricing;
  return (
    <section id="pricing" className="pricing-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{p.pill}</span>
          <h2>{p.title}</h2>
          <p className="fm-lead">{p.lead}</p>
        </Reveal>
        <div className="pricing">
          {PACKAGE_ORDER.map((tier, i) => {
            const pkg = PACKAGES[tier];
            const available = pkg.worldCount <= activeCount;
            const name = pick(pkg.name, locale);
            return (
              <Reveal key={tier} className={`plan${pkg.popular ? " plan--hot" : ""}${available ? "" : " plan--soon"}`} delay={i * 90}>
                {pkg.popular && available ? <span className="fm-sticker-badge plan__ribbon">{t.common.popular} 💛</span> : null}
                <h3>{name}</h3>
                <div className="plan__worlds">
                  {pkg.worldCount}
                  <small>{pkg.worldCount === 1 ? p.world : p.worlds}</small>
                </div>
                <ul className="plan__feats">
                  <li className="plan__feat">{tf(p.feats.boards, { boards: boardsFor(tier), n: searchesFor(tier) })}</li>
                  <li className="plan__feat">{tf(p.feats.time, { time: pick(pkg.playtime, locale) })}</li>
                  <li className="plan__feat">{p.feats.link}</li>
                  <li className="plan__feat">{p.feats.wrap}</li>
                </ul>
                <div className="plan__price">{formatMoney(priceFor(tier, currency), currency, locale)}</div>
                {available ? (
                  <Link href="/create" className={`fm-btn fm-btn--lg${pkg.popular ? "" : " fm-btn--secondary"}`}>
                    {tf(p.choose, { name })}
                  </Link>
                ) : (
                  <span className="fm-badge fm-badge--outline">{p.soon}</span>
                )}
              </Reveal>
            );
          })}
        </div>
        <p className="fm-small fm-center" style={{ marginTop: "var(--space-3)" }}>
          {p.note}
        </p>
      </div>
    </section>
  );
}

/* ─── Trust ─── */
export function Trust({ t }: SectionProps) {
  const tr = t.home.trust;
  return (
    <section id="trust" className="trust-sec">
      <div className="fm-container">
        <div className="fm-sheet fm-sheet--aqua">
          <Reveal className="sec-head">
            <span className="fm-pill">{tr.pill}</span>
            <h2>{tr.title}</h2>
          </Reveal>
          <div className="trust">
            {tr.items.map((item, i) => (
              <Reveal key={item.title} className="trust__item" delay={i * 70}>
                <span className="trust__icon" aria-hidden>
                  {TRUST_ICONS[i] ?? "✅"}
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
export function Faq({ t }: SectionProps) {
  const f = t.home.faq;
  return (
    <section id="faq" className="faq-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{f.pill}</span>
          <h2>{f.title}</h2>
        </Reveal>
        <div className="faq">
          {f.items.map(([q, a], i) => (
            <Reveal key={q} delay={i * 40}>
              <details>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
