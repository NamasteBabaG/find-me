import Link from "next/link";
import type { SceneDefinition } from "@/domain/scene/schema";
import { PACKAGES, PACKAGE_ORDER, WORLD_PRICES, boardsFor, priceFor, type PackageTier } from "@/domain/package";
import { formatMoney, pick, tf, type Currency, type Dictionary, type Locale } from "@/i18n";
import { Reveal } from "./Reveal";
import { WorldsCarousel, type CarouselWorld } from "./WorldsCarousel";

const STEP_ICONS = ["📷", "🗺️", "💌", "🎉"] as const;
const STEP_TONES = ["sun", "aqua", "lavender", "coral"] as const;
/** The holiday icon follows the locale: Hebrew site → menorah, everywhere else → a generic tree. */
const occasionIcons = (locale: Locale) => ["🎂", "✈️", "👵", locale === "he" ? "🕎" : "🎄"] as const;
const TRUST_ICONS = ["📷", "🔗", "🔍", "📚"] as const;

interface SectionProps {
  t: Dictionary;
  locale: Locale;
}

/* ─── Marquee: world chips ─── */
export function Marquee({ scenes, locale }: { scenes: SceneDefinition[]; locale: Locale }) {
  const items = scenes.map((s) => ({ key: s.slug, name: pick(s.name, locale), soon: !s.active }));
  const all = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee__track">
        {all.map((it, i) => (
          <span key={`${it.key}-${i}`} className={`chip${it.soon ? " chip--soon" : ""}`}>
            {it.name}
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

/* ─── What's inside: six equal white cards, one tinted icon chip each ─── */
const INSIDE_ORDER = ["three", "hints", "noFail", "replay", "bag", "link"] as const;
const INSIDE_TONES = ["sun", "aqua", "coral", "lavender", "lime", "sea"] as const;
/** One picture per promise, in the same chip the steps wear (a check on every card said nothing). */
const INSIDE_ICONS = ["🔍", "💡", "🐢", "🔁", "🎒", "👪"] as const;

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
                <span className="feature__icon" aria-hidden>
                  {INSIDE_ICONS[i] ?? "✨"}
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
export function Worlds({ t, carousel }: { t: Dictionary; carousel: CarouselWorld[] }) {
  const w = t.home.worlds;
  // The catalog can preview unavailable worlds. Do not multiply that preview
  // by a fixed hide count and present it as the purchased game's contents.
  return (
    <section id="worlds" className="worlds-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{w.pill}</span>
          <h2>{w.title}</h2>
          <p className="fm-lead">{w.lead}</p>
        </Reveal>
        <WorldsCarousel
          worlds={carousel}
          copy={{
            worldOf: w.worldOf,
            prev: w.prev,
            next: w.next,
            owned: w.owned,
            inTheMaking: w.inTheMaking,
            available: w.available,
          }}
        />
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
/**
 * One price story, not a ladder of package cards (Guy, 2026-10-05): the first world, and each world added after
 * it. Two or three worlds cost exactly that sum, so they appear only as small links, and only when the purchase
 * policy allows buying them together.
 */
export function Pricing({ t, locale, allowedTiers, currency }: SectionProps & { allowedTiers: readonly PackageTier[]; currency: Currency }) {
  const p = t.home.pricing;
  const money = (amount: number) => formatMoney(amount, currency, locale);
  const bundles = PACKAGE_ORDER.filter(tier => tier !== "ONE_WORLD" && allowedTiers.includes(tier));
  return (
    <section id="pricing" className="pricing-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{p.pill}</span>
          <h2>{p.title}</h2>
          <p className="fm-lead">{p.lead}</p>
        </Reveal>
        <Reveal className="offer">
          <div className="offer__first">
            <div className="offer__head"><h3>{p.firstWorld}</h3><span className="offer__price">{money(WORLD_PRICES[currency].first)}</span></div>
            <ul className="offer__feats">
              <li>{tf(p.feats.boards, { boards: boardsFor("ONE_WORLD") })}</li>
              <li>{p.passport}</li>
              <li>{p.feats.time}</li>
              <li>{p.feats.link}</li>
              <li>{p.feats.wrap}</li>
            </ul>
            {allowedTiers.includes("ONE_WORLD") ? <Link href="/create" className="fm-btn fm-btn--lg">{p.start}</Link> : null}
          </div>
          <span className="offer__plus" aria-hidden="true">+</span>
          <div className="offer__more">
            <div className="offer__head"><h3>{p.eachMore}</h3><span className="offer__price">{money(WORLD_PRICES[currency].additional)}</span></div>
            <p>{p.eachMoreHow}</p>
            <p className="fm-small">{p.sameChild}</p>
            {bundles.length ? <div className="offer__bundles">{bundles.map(tier => <Link key={tier} href="/create" className="fm-btn fm-btn--secondary">
              {tf(p.bundle, { count: PACKAGES[tier].worldCount, price: money(priceFor(tier, currency)) })}</Link>)}</div> : null}
          </div>
        </Reveal>
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
