import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import { getI18n } from "@/i18n/server";
import { pick } from "@/i18n";
import { buildDemoConfig } from "@/services/demo";
import { sceneBySlug } from "@/services/scene-catalog.service";
import { ComposedSprite } from "@/game/components/ComposedSprite";
import { Reveal } from "./Reveal";

/**
 * Example pair for the landing page (generated from assets/random-girl*.png by
 * scripts/build-demo-assets.ts):
 *  - public/demo/example-photo.jpg       the "uploaded" photo, shoulders and up, 4:5
 *  - public/demo/example-character.webp  the same girl illustrated in our style, half body, transparent
 * If either file is missing the card falls back to a placeholder / the system's own
 * composed character (face sticker + body template), so the page never breaks.
 */
const PHOTO = { url: "/demo/example-photo.jpg", file: path.join(process.cwd(), "public", "demo", "example-photo.jpg") };
const CHARACTER = { url: "/demo/example-character.webp", file: path.join(process.cwd(), "public", "demo", "example-character.webp") };
const DEMO_TEMPLATE = "beach_float";

/**
 * "From photo to character": photo → the illustrated character → that character
 * hidden in a world, glowing with a speech bubble the way it does when found.
 */
export async function Transformation() {
  const { t, locale } = await getI18n();
  const tr = t.home.transform;
  const demo = buildDemoConfig(locale, "beach");
  const child = demo.child;
  const beach = sceneBySlug("beach");
  const floatTarget = beach.targets.find((x) => x.bodyTemplate === DEMO_TEMPLATE) ?? beach.targets[0];
  const foundLine = floatTarget?.success[0] ? pick(floatTarget.success[0], locale) : t.home.hero.found;
  const templateLabel = pick(BODY_TEMPLATES[DEMO_TEMPLATE]!.label, locale);
  const hasPhoto = existsSync(PHOTO.file);
  const hasCharacter = existsSync(CHARACTER.file);
  const tag = hasCharacter ? `${child.name} · ${tr.characterTag}` : `${child.name} · ${templateLabel}`;

  const figure = (className: string) =>
    hasCharacter ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={CHARACTER.url} alt="" className={`${className} tf-figure--art`} width={730} height={900} draggable={false} />
    ) : (
      <ComposedSprite faceUrl={child.avatarUrl} bodyTemplate={DEMO_TEMPLATE} className={className} title={tag} />
    );

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
                <img src={PHOTO.url} alt={tr.photoAlt} width={800} height={1000} />
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

          <Reveal as="li" className="tf-card" delay={160}>
            <div className={`tf-card__media tf-card__media--sticker${hasCharacter ? " tf-card__media--art" : ""}`} role="img" aria-label={tr.characterAlt}>
              {figure("tf-figure tf-figure--big")}
              <span className="tf-tag">{tag}</span>
            </div>
            <span className="tf-card__label">{tr.character.label}</span>
            <p className="tf-card__text">{tr.character.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={320}>
            <div className="tf-card__media tf-card__media--world" style={{ backgroundImage: `url(${beach.art.base})` }} role="img" aria-label={tr.worldAlt}>
              <div className={`tf-world__spot${hasCharacter ? " tf-world__spot--art" : ""}`}>
                <span className="tf-world__bubble">{foundLine}</span>
                {figure("tf-figure tf-figure--found")}
              </div>
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
