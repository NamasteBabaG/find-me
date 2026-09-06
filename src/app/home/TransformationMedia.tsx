"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SceneConfig } from "@/domain/game/config";
import { scenePreview } from "@/game/engine/scene-preview";

/** Crop the portrait quadrant in the UI; the identity sheet is unchanged. */
export function TransformationPortrait({ src, alt, tag, unavailable }: { src: string; alt: string; tag: string; unavailable: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="tf-card__media tf-card__media--portrait">
      {failed ? <p className="tf-media__status">{unavailable}</p> : (
        <div className="tf-portrait">
          <Image src={src} alt={alt} width={1024} height={1024} sizes="(max-width: 720px) 200vw, 70vw" onError={() => setFailed(true)} />
        </div>
      )}
      <span className="tf-tag">{tag}</span>
    </div>
  );
}

export function TransformationScene({ scene, targetId, alt, line, unavailable, loading }: { scene: SceneConfig; targetId: string; alt: string; line: string; unavailable: string; loading: string }) {
  const target = scene.targets.find(t => t.id === targetId);
  const preview = target ? scenePreview(scene, target) : null;
  const [loaded, setLoaded] = useState({ base: false, patch: false });
  const [failed, setFailed] = useState(false);
  const ready = loaded.base && loaded.patch && !failed && preview !== null;
  useEffect(() => {
    if (ready || failed || !preview) return;
    const timer = setTimeout(() => setFailed(true), 15_000);
    return () => clearTimeout(timer);
  }, [ready, failed, preview !== null]);
  return (
    <div className="tf-card__media tf-card__media--world" role={ready ? "img" : undefined} aria-label={ready ? alt : undefined}>
      {!ready ? <p className="tf-media__status" role="status">{failed || !preview ? unavailable : loading}</p> : null}
      {preview ? <div className="tf-world__composition" style={{ visibility: ready ? "visible" : "hidden" }}>
        <Image src={scene.art.base} alt="" width={scene.art.width} height={scene.art.height} unoptimized loading="eager"
          className="tf-world__base" style={preview.baseStyle} onLoad={() => setLoaded(s => ({ ...s, base: true }))} onError={() => setFailed(true)} />
        <Image src={preview.sprite.url} alt="" width={preview.sprite.width} height={preview.sprite.height} unoptimized loading="eager"
          className="tf-world__patch" style={preview.patchStyle} onLoad={() => setLoaded(s => ({ ...s, patch: true }))} onError={() => setFailed(true)} />
        {ready ? <span className="tf-world__bubble tf-world__bubble--free" style={preview.bubbleStyle}>{line}</span> : null}
      </div> : null}
    </div>
  );
}
