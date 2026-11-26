import Link from "next/link";
import type { CSSProperties } from "react";
import type { SceneDefinition } from "@/domain/scene/schema";
import { PACKAGES, PACKAGE_ORDER, WORLD_PRICES, boardsFor, priceFor, type PackageTier } from "@/domain/package";
import { formatMoney, pick, tf, type Currency, type Dictionary, type Locale } from "@/i18n";
import { Reveal } from "./Reveal";
import { WorldsCarousel, type CarouselWorld } from "./WorldsCarousel";
import { Icon, type IconName } from "@/ui/Icon";
import { StepArt } from "./StepArt";

/** The colour grammar's chip run: one fixed order of the four gouache tints, for every row of icon chips on paper. */
const TINTS = ["sun", "aqua", "lavender", "coral"] as const;
const tint = (i: number) => `tint--${TINTS[i % TINTS.length]}`;
/** Birthday, a trip, grandparents, a holiday: drawn in the site's own icon family, never emoji (Guy, 2026-11-16). */
const OCCASION_ICONS: readonly IconName[] = ["cake", "plane", "heart", "candle"];
const TRUST_ICONS: readonly IconName[] = ["camera", "link", "search", "book"];

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
    <section id="how" className="how band band--white">
      <div className="fm-container">
        <Reveal className="sec-head">
          <h2>{h.title}</h2>
          <p className="fm-lead">{h.lead}</p>
        </Reveal>
        {/* One road, four stops: the list arrives as a group, its stops in order, and the road between them draws itself. */}
        <Reveal as="ol" className="steps">
          {h.steps.map((s, i) => (
            <li key={s.title} className="step" style={{ ["--i" as string]: i } as CSSProperties}>
              <span className="step__stop">
                <StepArt step={i} />
                <span className="step__num" aria-hidden>
                  {i + 1}
                </span>
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ─── What's inside: six promises as one ruled table, each chip in the next tint of the run ─── */
const INSIDE_ORDER = ["three", "hints", "noFail", "replay", "bag", "link"] as const;
/** One picture per promise (a check on every card said nothing). */
const INSIDE_ICONS: readonly IconName[] = ["search", "bulb", "heart", "replay", "bag", "family"];

export function Inside({ t }: SectionProps) {
  const s = t.home.inside;
  return (
    <section id="inside" className="fm-section band band--sky">
      <div className="fm-container">
        <Reveal className="sec-head">
          <h2>{s.title}</h2>
          <p className="fm-lead">{s.lead}</p>
        </Reveal>
        <div className="features">
          {INSIDE_ORDER.map((key, i) => {
            const tile = s.tiles[key];
            return (
              <Reveal key={key} className="feature" delay={(i % 3) * 90}>
                <span className={`feature__icon ${tint(i)}`} aria-hidden>
                  <Icon name={INSIDE_ICONS[i] ?? "sparkle"} />
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
export function GiftSection({ t }: SectionProps) {
  const g = t.home.gift;
  return (
    <section id="gift" className="gift-sec band band--lilac">
      <div className="fm-container">
        <Reveal className="sec-head">
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
              <Reveal as="li" key={o.title} className="occasion" delay={i * 90}>
                <span className="occasion__icon" aria-hidden>
                  <Icon name={OCCASION_ICONS[i] ?? "gift"} />
                </span>
                <h3>{o.title}</h3>
                <p>{o.text}</p>
              </Reveal>
            ))}
          </ul>
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
    <section id="worlds" className="worlds-sec band band--white">
      <div className="fm-container">
        <Reveal className="sec-head">
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
          <span className="offer__plus" aria-hidden="true"><Icon name="plus" strokeWidth={2.6} /></span>
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
    <section id="trust" className="trust-sec band band--mint">
      <div className="fm-container">
        <Reveal className="sec-head">
          <h2>{tr.title}</h2>
        </Reveal>
        <div className="trust">
          {tr.items.map((item, i) => (
            <Reveal key={item.title} className="trust__item" delay={i * 90}>
              <span className="trust__icon" aria-hidden>
                <Icon name={TRUST_ICONS[i] ?? "sparkle"} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
export function Faq({ t }: SectionProps) {
  const f = t.home.faq;
  return (
    <section id="faq" className="faq-sec band band--white">
      <div className="fm-container">
        <Reveal className="sec-head">
          <h2>{f.title}</h2>
        </Reveal>
        <Reveal className="faq">
          {f.items.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
