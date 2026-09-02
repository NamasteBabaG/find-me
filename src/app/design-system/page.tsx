import { SiteFooter, SiteHeader, Stepper, Notice } from "@/ui/Shell";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { ComposedSprite } from "@/game/components/ComposedSprite";

export const metadata = { title: "Design system", robots: { index: false } };

const COLORS: Array<[string, string]> = [
  ["--paper", "Paper"],
  ["--paper-2", "Paper 2"],
  ["--ink", "Ink"],
  ["--ink-2", "Ink 2"],
  ["--ink-3", "Ink 3"],
  ["--night", "Night"],
  ["--sun", "Sun (CTA)"],
  ["--coral", "Coral"],
  ["--aqua", "Aqua"],
  ["--sea", "Sea"],
  ["--lime", "Lime"],
  ["--lavender", "Lavender"],
  ["--berry", "Berry"],
  ["--grape", "Grape"],
  ["--leaf", "Leaf"],
];
const SPACES = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8", "--space-12"];

/** Living style guide (internal). Everything here is rendered from tokens — if it looks wrong here, it is wrong everywhere. */
export default async function DesignSystemPage() {
  const user = await currentUser();
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-section ds">
        <div>
          <p className="fm-eyebrow">Playful Premium · v2</p>
          <h1>Design system</h1>
          <p className="fm-lead fm-measure">8px grid, colour slabs, soft depth, motion with intent. Two audiences: parents buy (clean, confident), kids play (big, bright, immediate). Details in docs/DESIGN_SYSTEM.md.</p>
        </div>

        <section className="fm-stack fm-stack--2">
          <h2>Colour</h2>
          <div className="swatches">
            {COLORS.map(([token, name]) => (
              <div key={token} className="swatch">
                <div className="swatch__color" style={{ background: `var(${token})` }} />
                <div className="swatch__meta">
                  <strong>{name}</strong>
                  <div dir="ltr" className="fm-muted">
                    {token}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="fm-row">
            {["night", "sun", "lavender", "aqua", "coral", "lime"].map((k) => (
              <div key={k} className={`fm-sheet fm-sheet--${k}`} style={{ padding: "var(--space-3)", minWidth: 160 }}>
                <strong>fm-sheet--{k}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>Spacing — the 8px rule</h2>
          <div className="spacing-row">
            {SPACES.map((s) => (
              <div key={s} className="fm-stack fm-stack--1 fm-center">
                <div className="spacing-box" style={{ width: `var(${s})`, height: `var(${s})` }} />
                <span className="fm-small" dir="ltr">
                  {s}
                </span>
              </div>
            ))}
          </div>
          <p className="fm-small">4px exists only for icon/text nudges. Everything else is a multiple of 8. Line heights are always multiples of 8.</p>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>Type</h2>
          <div className="type-sample fm-card">
            <span className="fm-hero">Where&apos;s Noa? (Hero 88/96)</span>
            <span className="fm-display">You found me! (Display 64/72)</span>
            <h1>Heading 1 (48/56)</h1>
            <h2>Heading 2 (40/48)</h2>
            <h3>Heading 3 (24/32)</h3>
            <p className="fm-lead">Lead (20/32) — Rubik everywhere on the site; Fredoka only inside the game.</p>
            <p>Body (16/24). Find Noa with the float ring.</p>
            <p className="fm-small">Small (14/24) for notes and secondary info.</p>
          </div>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>Buttons</h2>
          <div className="fm-row">
            <button className="fm-btn">Primary</button>
            <button className="fm-btn fm-btn--secondary">Secondary</button>
            <button className="fm-btn fm-btn--night">Night</button>
            <button className="fm-btn fm-btn--coral">Coral</button>
            <button className="fm-btn fm-btn--sea">Sea</button>
            <button className="fm-btn fm-btn--ghost">Ghost</button>
            <button className="fm-btn fm-btn--danger">Delete</button>
          </div>
          <div className="fm-row">
            <button className="fm-btn fm-btn--sm">Small 40</button>
            <button className="fm-btn">Regular 56</button>
            <button className="fm-btn fm-btn--lg">Large 64</button>
            <button className="fm-btn fm-btn--xl">XL 80</button>
            <button className="fm-btn fm-btn--secondary fm-btn--kid" aria-label="kid">
              💡
            </button>
          </div>
          <p className="fm-small">Minimum 48px for adults, 64px for anything a child taps. Primary glows on hover; nothing has hard offset shadows anymore.</p>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>Pills, badges, notices</h2>
          <div className="fm-row">
            <span className="fm-pill">✨ Pill</span>
            <span className="fm-pill fm-pill--sun">Sun pill</span>
            <span className="fm-pill fm-pill--coral">Coral pill</span>
            <span className="fm-sticker-badge">Sticker badge</span>
            <span className="fm-sticker-badge fm-sticker-badge--sun">Sun sticker</span>
            <span className="fm-sticker-badge fm-sticker-badge--aqua">Aqua sticker</span>
          </div>
          <div className="fm-row">
            <span className="fm-badge">Default</span>
            <span className="fm-badge fm-badge--sea">Sea</span>
            <span className="fm-badge fm-badge--berry">Most loved</span>
            <span className="fm-badge fm-badge--leaf">Found!</span>
            <span className="fm-badge fm-badge--grape">Sandbox</span>
            <span className="fm-badge fm-badge--ink">Ink</span>
            <span className="fm-badge fm-badge--outline">Coming soon</span>
          </div>
          <Notice kind="info">Info notice.</Notice>
          <Notice kind="success">Success.</Notice>
          <Notice kind="warn">Gentle warning.</Notice>
          <Notice kind="danger">Error (adults only — the child never sees a failure screen).</Notice>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>Cards & steps</h2>
          <Stepper steps={["Who's hiding?", "Photo", "How many worlds?", "Which worlds?", "Summary"]} current={2} />
          <div className="fm-grid">
            <div className="fm-card">Card</div>
            <div className="fm-card fm-card--selectable">Selectable</div>
            <div className="fm-card fm-card--selected">Selected</div>
            <div className="fm-paper">Paper</div>
          </div>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>The composed child</h2>
          <p className="fm-small">Face sticker + procedural body per template. The same component renders in the scene, on the mission card and in admin.</p>
          <div className="fm-row">
            {["beach_float", "beach_sandcastle", "beach_umbrella_peek", "jungle_binoculars", "jungle_boat", "space_astronaut", "space_rover", "ship_captain"].map((id) => (
              <div key={id} style={{ width: 96, height: 134 }}>
                <ComposedSprite faceUrl="/demo/noa-face.png" bodyTemplate={id} />
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
