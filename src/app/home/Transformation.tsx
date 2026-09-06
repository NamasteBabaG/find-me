import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import Image from "next/image";
import { transformationExample as example } from "../../../content/demo/transformation";
import { getI18n } from "@/i18n/server";
import { buildDemoConfig } from "@/services/demo";
import { TransformationPortrait, TransformationScene } from "./TransformationMedia";
import { Reveal } from "./Reveal";

/** A prepared example, using the same placement contract as the playable game. */
export async function Transformation() {
  const { t, locale } = await getI18n();
  const tr = t.home.transform;
  const demo = buildDemoConfig(locale, example.scene);
  const child = demo.child;
  const scene = demo.scenes[0]!;
  const foundLine = scene.targets.find(target => target.id === example.target)?.success[0] ?? t.home.hero.found;
  const hasPhoto = existsSync(path.join(process.cwd(), "public", example.photo));
  const tag = `${child.name} · ${tr.characterTag}`;

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
                <Image src={example.photo} alt={tr.photoAlt} width={800} height={1000} sizes="(max-width: 720px) 100vw, 33vw" />
              ) : (
                <div className="tf-placeholder" role="img" aria-label={tr.photoAlt}>
                  <span>{tr.placeholder}</span>
                </div>
              )}
            </div>
            <span className="tf-card__label">{tr.photo.label}</span>
            <p className="tf-card__text">{tr.photo.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={160}>
            <TransformationPortrait src={example.identitySheet} alt={tr.characterAlt} tag={tag} unavailable={tr.previewUnavailable} />
            <span className="tf-card__label">{tr.character.label}</span>
            <p className="tf-card__text">{tr.character.text}</p>
          </Reveal>

          <Reveal as="li" className="tf-card" delay={320}>
            <TransformationScene scene={scene} targetId={example.target} alt={tr.worldAlt} line={foundLine} unavailable={tr.previewUnavailable} loading={tr.previewLoading} />
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
