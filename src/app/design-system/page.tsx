import { SiteFooter, SiteHeader, Stepper, Notice } from "@/ui/Shell";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { ComposedSprite } from "@/game/components/ComposedSprite";

export const metadata = { title: "מערכת העיצוב", robots: { index: false } };

const COLORS: Array<[string, string]> = [
  ["--paper", "נייר"],
  ["--paper-2", "נייר 2"],
  ["--ink", "דיו"],
  ["--ink-2", "דיו 2"],
  ["--ink-3", "דיו 3"],
  ["--sun", "שמש (CTA)"],
  ["--sun-deep", "שמש עמוק"],
  ["--sea", "ים"],
  ["--sea-deep", "ים עמוק"],
  ["--berry", "פטל"],
  ["--leaf", "עלה"],
  ["--grape", "ענב"],
  ["--sand", "חול"],
  ["--night", "לילה"],
];
const SPACES = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8", "--space-12"];

/** Living style guide. Everything here is rendered from tokens — if it looks wrong here, it is wrong everywhere. */
export default async function DesignSystemPage() {
  const user = await currentUser();
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-section ds">
        <div>
          <p className="fm-eyebrow">Storybook Collage</p>
          <h1>מערכת העיצוב</h1>
          <p className="fm-lead fm-measure">גריד של 8 פיקסלים, גזירי נייר, גואש. שני קהלים: הורה שקונה (נקי, אמין) וילד שמשחק (גדול, צבעוני, מיידי).</p>
        </div>

        <section className="fm-stack fm-stack--2">
          <h2>צבעים</h2>
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
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>ריווח — חוק ה־8</h2>
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
          <p className="fm-small">4px קיים רק לכוונון אייקונים וטקסט. כל שאר הריווחים כפולות של 8. גובה שורה תמיד כפולה של 8.</p>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>טיפוגרפיה</h2>
          <div className="type-sample fm-card">
            <span className="fm-hero">איפה נועה? (Hero 72/80)</span>
            <span className="fm-display">מצאתם אותי! (Display 56/64)</span>
            <h1>כותרת ראשית (40/48)</h1>
            <h2>כותרת שנייה (32/40)</h2>
            <h3>כותרת שלישית (24/32)</h3>
            <p className="fm-lead">פסקת פתיחה (20/32) — Rubik לגוף, Fredoka לכותרות.</p>
            <p>גוף טקסט (16/24). מצאו את נועה עם גלגל הים הצהוב.</p>
            <p className="fm-small">טקסט קטן (14/24) להערות ומידע משני.</p>
          </div>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>כפתורים</h2>
          <div className="fm-row">
            <button className="fm-btn">ראשי</button>
            <button className="fm-btn fm-btn--secondary">משני</button>
            <button className="fm-btn fm-btn--sea">ים</button>
            <button className="fm-btn fm-btn--berry">פטל</button>
            <button className="fm-btn fm-btn--ghost">רפאים</button>
            <button className="fm-btn fm-btn--danger">מחיקה</button>
          </div>
          <div className="fm-row">
            <button className="fm-btn fm-btn--sm">קטן 40</button>
            <button className="fm-btn">רגיל 56</button>
            <button className="fm-btn fm-btn--lg">גדול 64</button>
            <button className="fm-btn fm-btn--secondary fm-btn--kid" aria-label="ילד">
              💡
            </button>
          </div>
          <p className="fm-small">מינימום 48px למבוגר, 64px לכל מה שילד לוחץ עליו. צל של 4px = ״נייר מורם״; בלחיצה הכפתור יורד.</p>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>תגיות והודעות</h2>
          <div className="fm-row">
            <span className="fm-badge">ברירת מחדל</span>
            <span className="fm-badge fm-badge--sea">ים</span>
            <span className="fm-badge fm-badge--berry">הכי אהובה</span>
            <span className="fm-badge fm-badge--leaf">מצאתי!</span>
            <span className="fm-badge fm-badge--grape">סנדבוקס</span>
            <span className="fm-badge fm-badge--ink">כהה</span>
            <span className="fm-badge fm-badge--outline">בקרוב</span>
          </div>
          <Notice kind="info">הודעת מידע.</Notice>
          <Notice kind="success">הצלחה.</Notice>
          <Notice kind="warn">אזהרה עדינה.</Notice>
          <Notice kind="danger">שגיאה (רק למבוגרים — לילד אין מסכי כישלון).</Notice>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>כרטיסים ושלבים</h2>
          <Stepper steps={["מי מתחבא?", "תמונה", "כמה עולמות?", "אילו עולמות?", "סיכום"]} current={2} />
          <div className="fm-grid">
            <div className="fm-card">כרטיס רגיל</div>
            <div className="fm-card fm-card--selectable">כרטיס לבחירה</div>
            <div className="fm-card fm-card--selected">כרטיס נבחר</div>
            <div className="fm-paper">נייר</div>
          </div>
        </section>

        <section className="fm-stack fm-stack--2">
          <h2>הדמות המורכבת</h2>
          <p className="fm-small">סטיקר פנים + גוף מצויר לפי תבנית. אותו רכיב משמש בסצנה, בכרטיס המשימה ובאדמין.</p>
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
