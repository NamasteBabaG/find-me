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
 * Two optional files turn this section into the real thing:
 *  - public/demo/example-photo.jpg      the "uploaded" photo (a generic child, shoulders and up)
 *  - public/demo/example-character.png  the same child illustrated in our style, full or half body,
 *                                        transparent background, roughly 500×700
 * Until they exist: a dashed placeholder for the photo, and the system's own composed
 * character (face sticker + body template) — which is also exactly what the game hides.
 */
const PHOTO = { url: "/demo/example-photo.jpg", file: path.join(process.cwd(), "public", "demo", "example-photo.jpg") };
const CHARACTER = { url: "/demo/example-character.png", file: path.join(process.cwd(), "public", "demo", "example-character.png") };
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

  const figure = (className: string) =>
    hasCharacter ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={CHARACTER.url} alt="" className={className} loading="lazy" draggable={false} />
    ) : (
      <ComposedSprite faceUrl={child.avatarUrl} bodyTemplate={DEMO_TEMPLATE} className={className} title={`${child.name} · ${templateLabel}`} />
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
                <img src={PHOTO.url} alt={tr.photoAlt} loading="lazy" />
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
            <div className="tf-card__media tf-card__media--sticker" role="img" aria-label={tr.characterAlt}>
              {figure("tf-figure tf-figure--big")}
              <span className="tf-tag">
                {child.name} · {templateLabel}
              </span>
            </div>
            <span className="tf-card__label">{tr.character.label}</span>
            <p className="tf-card__text">{tr.character.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={180}>
            <div className="tf-card__media tf-card__media--world" style={{ backgroundImage: `url(${beach.art.base})` }} role="img" aria-label={tr.worldAlt}>
              <div className="tf-world__spot">
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
