import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { Reveal } from "./Reveal";

/** Drop a real photo (shoulders and up) here and the placeholder card disappears. */
const EXAMPLE_PHOTO_URL = "/demo/example-photo.jpg";
const EXAMPLE_PHOTO_FILE = path.join(process.cwd(), "public", "demo", "example-photo.jpg");
/** The illustrated character made from that photo (Noa's sticker until the real pair exists). */
const EXAMPLE_STICKER_URL = "/demo/noa-face.png";

/**
 * "From photo to character": the one thing a parent has to believe before
 * paying — the illustration really looks like their child, and that is who
 * gets hidden in the worlds. Photo → character → hidden in the world.
 */
export async function Transformation() {
  const { t } = await getI18n();
  const tr = t.home.transform;
  const hasPhoto = existsSync(EXAMPLE_PHOTO_FILE);

  return (
    <section id="transform" className="tf" aria-labelledby="tf-title">
      <div className="fm-container">
        <Reveal className="sec-head">
          <span className="fm-pill">{tr.pill}</span>
          <h2 id="tf-title">{tr.title}</h2>
          <p className="fm-lead">{tr.lead}</p>
        </Reveal>

        <ol className="tf-flow">
          <Reveal as="li" className="tf-card">
            <div className="tf-card__media tf-card__media--photo">
              {hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={EXAMPLE_PHOTO_URL} alt={tr.photoAlt} loading="lazy" />
              ) : (
                <div className="tf-placeholder" role="img" aria-label={tr.photoAlt}>
                  <span className="tf-placeholder__icon" aria-hidden>
                    📷
                  </span>
                  <span>{tr.placeholder}</span>
                </div>
              )}
            </div>
            <span className="tf-card__label">{tr.photo.label}</span>
            <p className="tf-card__text">{tr.photo.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={90}>
            <div className="tf-card__media tf-card__media--sticker">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={EXAMPLE_STICKER_URL} alt={tr.characterAlt} className="fm-sticker tf-sticker" width={168} height={168} loading="lazy" />
              <span className="tf-tag">{tr.characterTag}</span>
            </div>
            <span className="tf-card__label">{tr.character.label}</span>
            <p className="tf-card__text">{tr.character.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={180}>
            <div className="tf-card__media tf-card__media--world" style={{ backgroundImage: "url(/scenes/beach/base.webp)" }} role="img" aria-label={tr.world.label}>
              <span className="tf-world__ring" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={EXAMPLE_STICKER_URL} alt="" className="fm-sticker tf-world__noa" width={64} height={64} loading="lazy" />
            </div>
            <span className="tf-card__label">{tr.world.label}</span>
            <p className="tf-card__text">{tr.world.text}</p>
          </Reveal>
        </ol>

        <Reveal>
          <ul className="tf-points">
            {tr.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="tf-cta">
            <Link href="/create" className="fm-btn fm-btn--lg">
              {t.common.createGame}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
