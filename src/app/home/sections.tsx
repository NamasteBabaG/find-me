import Link from "next/link";
import type { SceneDefinition } from "@/domain/scene/schema";
import { PACKAGES, PACKAGE_ORDER, searchesFor } from "@/domain/package";
import { formatPrice, pick, tf, type Dictionary, type Locale } from "@/i18n";
import { ComposedSprite } from "@/game/components/ComposedSprite";
import { Reveal } from "./Reveal";

const DEMO_FACE = "/demo/noa-face.png";
export const WORLD_GLYPHS: Record<string, string> = { beach: "🏖️", jungle: "🌴", space: "🚀", city: "🏙️", ship: "⚓", stadium: "🏟️", market: "🍉", park: "🪁", volcano: "🌋" };
const STEP_ICONS = ["📷", "🗺️", "💌", "🎉"] as const;
const STEP_TONES = ["sun", "aqua", "lavender", "coral"] as const;
const OCCASION_ICONS = ["🎂", "✈️", "👵", "🕎"] as const;
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

/* ─── Bento: what's inside ─── */
export function Inside({ t }: SectionProps) {
  const s = t.home.inside;
  const tiles = s.tiles;
  return (
    <section id="inside" className="fm-section">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{s.pill}</span>
          <h2>{s.title}</h2>
          <p className="fm-lead">{s.lead}</p>
        </Reveal>
        <div className="bento">
          <Reveal className="tile tile--wide tile--sun">
            <div className="tile__art">
              <ComposedSprite faceUrl={DEMO_FACE} bodyTemplate="beach_float" className="tile__sprite" />
              <ComposedSprite faceUrl={DEMO_FACE} bodyTemplate="beach_sandcastle" className="tile__sprite" />
              <ComposedSprite faceUrl={DEMO_FACE} bodyTemplate="beach_umbrella_peek" className="tile__sprite" />
            </div>
            <h3>{tiles.three.title}</h3>
            <p>{tiles.three.text}</p>
          </Reveal>
          <Reveal className="tile tile--aqua" delay={80}>
            <div className="tile__art">
              <span className="tile__hint" aria-hidden>
                💡
              </span>
            </div>
            <h3>{tiles.hints.title}</h3>
            <p>{tiles.hints.text}</p>
          </Reveal>
          <Reveal className="tile tile--coral" delay={160}>
            <div className="tile__art">
              <span className="tile__ripple" aria-hidden />
            </div>
            <h3>{tiles.noFail.title}</h3>
            <p>{tiles.noFail.text}</p>
          </Reveal>
          <Reveal className="tile tile--lavender" delay={60}>
            <div className="tile__art">
              <div className="tile__ab" aria-hidden>
                <span>A</span>
                <span>B</span>
              </div>
            </div>
            <h3>{tiles.replay.title}</h3>
            <p>{tiles.replay.text}</p>
          </Reveal>
          <Reveal className="tile tile--lime" delay={120}>
            <div className="tile__art">
              <div className="tile__glyphs" aria-hidden>
                <span className="tile__glyph">🐚</span>
                <span className="tile__glyph">🍃</span>
                <span className="tile__glyph">⭐</span>
                <span className="tile__glyph tile__glyph--dim">⚓</span>
                <span className="tile__glyph tile__glyph--dim">💎</span>
              </div>
            </div>
            <h3>{tiles.bag.title}</h3>
            <p>{tiles.bag.text}</p>
          </Reveal>
          <Reveal className="tile tile--night" delay={180}>
            <div className="tile__art">
              <span className="tile__link" aria-hidden>
                🔗
              </span>
            </div>
            <h3>{tiles.link.title}</h3>
            <p>{tiles.link.text}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─── Gift ─── */
export function GiftSection({ t }: SectionProps) {
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
                    {OCCASION_ICONS[i] ?? "🎁"}
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
export function Worlds({ t, locale, scenes, activeSlugs }: SectionProps & { scenes: SceneDefinition[]; activeSlugs: string[] }) {
  const w = t.home.worlds;
  const total = scenes.length;
  return (
    <section id="worlds" className="worlds-sec">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{w.pill}</span>
          <h2>
            <span className="worlds-count">{total}</span> {w.titleWorlds} <span className="worlds-count">{total * 3}</span> {w.titleSpots}
          </h2>
          <p className="fm-lead">{w.lead}</p>
        </Reveal>
        <div className="worlds">
          {scenes.map((scene, i) => {
            const isActive = activeSlugs.includes(scene.slug);
            return (
              <Reveal key={scene.slug} className={`world${isActive ? "" : " world--soon"}`} delay={(i % 3) * 80}>
                <div className="world__img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.art.thumbnail} alt="" loading="lazy" />
                </div>
                {!isActive ? <span className="fm-sticker-badge fm-sticker-badge--sun world__soon">{t.common.soon}</span> : null}
                <div className="world__body">
                  <span className="world__name">
                    <span aria-hidden>{WORLD_GLYPHS[scene.slug] ?? "✨"}</span> {pick(scene.name, locale)}
                  </span>
                  <span className="fm-small">{pick(scene.tagline, locale)}</span>
                  <div className="world__items" aria-label={w.spotsAria}>
                    {scene.targets.map((tg) => (
                      <span key={tg.id}>{pick(tg.item, locale)}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
export function Pricing({ t, locale, activeCount }: SectionProps & { activeCount: number }) {
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
            const available = pkg.sceneCount <= activeCount;
            const name = pick(pkg.name, locale);
            return (
              <Reveal key={tier} className={`plan${pkg.popular ? " plan--hot" : ""}${available ? "" : " plan--soon"}`} delay={i * 90}>
                {pkg.popular ? <span className="fm-sticker-badge plan__ribbon">{t.common.popular} 💛</span> : null}
                <h3>{name}</h3>
                <div className="plan__worlds">
                  {pkg.sceneCount}
                  <small>{p.worlds}</small>
                </div>
                <ul className="plan__feats">
                  <li className="plan__feat">{tf(p.feats.spots, { n: searchesFor(tier) })}</li>
                  <li className="plan__feat">{tf(p.feats.time, { time: pick(pkg.playtime, locale) })}</li>
                  <li className="plan__feat">{p.feats.link}</li>
                  <li className="plan__feat">{p.feats.wrap}</li>
                </ul>
                <div className="plan__price">{formatPrice(pkg.priceAgorot, locale)}</div>
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
