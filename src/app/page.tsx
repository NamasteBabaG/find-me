import Link from "next/link";
import { PACKAGES, PACKAGE_ORDER, formatPriceILS, searchesFor } from "@/domain/package";
import { SCENE_CATALOG } from "../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { getContainer } from "@/services/container";
import { activeSceneSlugs } from "@/services/scene-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LandingDemo } from "./LandingDemo";

export default async function HomePage() {
  const c = getContainer();
  const [user, active] = await Promise.all([currentUser(), activeSceneSlugs(c)]);
  const demo = buildDemoConfig("beach", "מאיה");

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main>
        <section className="fm-container hero">
          <div className="hero__copy">
            <p className="fm-eyebrow">משחק חיפוש אישי לילדים 4–8</p>
            <h1 className="hero__title">
              מצליחים למצוא את <span className="fm-highlight">הילד שלכם</span>?
            </h1>
            <p className="fm-lead fm-measure">תמונה אחת. בוחרים עולמות. הילד שלכם מתחבא בתוך עולמות מלאים בפרטים, אנימציות והפתעות — ומחכה שימצאו אותו.</p>
            <div className="fm-row">
              <LinkButton href="/create" size="lg">
                יוצרים משחק אישי
              </LinkButton>
              <span className="fm-small">מעלים תמונה, בוחרים עולמות, מקבלים לינק. פחות מדקה.</span>
            </div>
          </div>
          <div className="hero__demo" aria-label="הדגמה חיה">
            <span className="fm-badge fm-badge--berry hero__demo-label">נסו! מצליחים למצוא את מאיה?</span>
            <LandingDemo config={demo} />
          </div>
        </section>

        <section className="fm-container fm-section--tight">
          <p className="fm-center fm-lead">עכשיו דמיינו שהילד שלכם מתחבא כאן.</p>
        </section>

        <section className="fm-container fm-section">
          <div className="fm-stack fm-stack--4">
            <h2 className="fm-center">איך זה עובד?</h2>
            <ol className="steps" aria-label="שלבים">
              {[
                ["מעלים תמונה", "פנים ברורות, תאורה טובה. זהו. בלי סיפור, בלי טפסים."],
                ["בוחרים עולמות", "חוף, ג׳ונגל, חלל ועוד. כל עולם מסתיר את הילד שלוש פעמים."],
                ["מקבלים לינק פרטי", "המשחק נשלח למייל ונשמר בספרייה. בלי אפליקציה, בלי סיסמה."],
                ["משחקים שוב ושוב", "בכל משחק חוזר המחבואים משתנים, ואוספים פריטים לתיק ההרפתקאות."],
              ].map(([title, text], i) => (
                <li key={title} className="step">
                  <span className="step__num" aria-hidden>
                    {i + 1}
                  </span>
                  <h3>{title}</h3>
                  <p className="fm-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="fm-container fm-section" id="packages">
          <div className="fm-stack fm-stack--4">
            <div className="fm-center fm-stack fm-stack--1">
              <h2>כמה עולמות?</h2>
              <p className="fm-lead">ההבדל היחיד בין החבילות הוא כמות העולמות. כל עולם = שלושה חיפושים.</p>
            </div>
            <div className="packages">
              {PACKAGE_ORDER.map((tier) => {
                const p = PACKAGES[tier];
                const available = p.sceneCount <= active.length;
                return (
                  <div key={tier} className={`fm-card fm-card--pad-4 package${available ? "" : " package--soon"}`}>
                    {p.popular ? <span className="fm-badge fm-badge--berry package__ribbon">הכי אהובה</span> : null}
                    <h3>{p.name}</h3>
                    <span className="package__worlds">{p.sceneCount} עולמות</span>
                    <span className="fm-muted">{searchesFor(tier)} חיפושים · {p.playtime}</span>
                    <span className="package__price">{formatPriceILS(p.priceAgorot)}</span>
                    {available ? (
                      <LinkButton href="/create" variant={p.popular ? "primary" : "secondary"}>
                        בוחרים
                      </LinkButton>
                    ) : (
                      <span className="fm-badge fm-badge--outline">בקרוב — עוד עולמות בדרך</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="fm-container fm-section">
          <div className="fm-stack fm-stack--4">
            <h2 className="fm-center">העולמות</h2>
            <div className="worlds">
              {SCENE_CATALOG.map(({ scene }) => {
                const isActive = active.includes(scene.slug);
                return (
                  <div key={scene.slug} className={`world${isActive ? "" : " world--soon"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={scene.art.thumbnail} alt="" loading="lazy" />
                    <span className="world__name">{scene.name}</span>
                    <span className="fm-small" style={{ paddingInline: "var(--space-1)", paddingBottom: "var(--space-1)" }}>
                      {isActive ? scene.tagline : "בקרוב"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="fm-container fm-container--narrow fm-section">
          <div className="fm-stack fm-stack--3">
            <h2 className="fm-center">שאלות של הורים</h2>
            <div className="faq">
              <details>
                <summary>מה קורה עם התמונה של הילד?</summary>
                <p>התמונה משמשת רק ליצירת הדמות המאוירת, ונמחקת אחרי שהמשחק מאושר. אין גלריה ציבורית, אין פרסומות, ולא משתמשים בתמונות לאימון מודלים.</p>
              </details>
              <details>
                <summary>איך משחקים?</summary>
                <p>בדפדפן, בטלפון, בטאבלט או במחשב. גוררים, מגדילים ולוחצים על הילד כשמוצאים אותו. יש רמזים עדינים, ואין כישלונות.</p>
              </details>
              <details>
                <summary>כמה זמן זה לוקח?</summary>
                <p>יצירת המשחק לוקחת כמה דקות. תקבלו מייל עם לינק פרטי כשהכול מוכן.</p>
              </details>
              <details>
                <summary>אפשר לשלוח כמתנה?</summary>
                <p>כן. אחרי התשלום אפשר להוסיף ״ממי המתנה״ ומשפט קצר, והלינק נפתח עם עטיפה דיגיטלית.</p>
              </details>
            </div>
            <p className="fm-center">
              <Link href="/create" className="fm-btn fm-btn--lg">
                יוצרים משחק אישי
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
