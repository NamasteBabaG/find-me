"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useHomeQaRecovery } from "@/ui/qa/HomeQaRecovery";

/**
 * Crop the portrait quadrant in the UI; the identity sheet is unchanged.
 *
 * No caption plate: the card already says "an illustrated character" under it,
 * and a picture of a drawn child labelled "the illustrated character" tells the
 * reader what they can see (Guy).
 */
export function TransformationPortrait({ src, alt, unavailable }: { src: string; alt: string; unavailable: string }) {
  const [failed, setFailed] = useState(false);
  useHomeQaRecovery(true, failed, () => setFailed(false));
  return (
    <div className="tf-card__media tf-card__media--portrait">
      {failed ? <p className="tf-media__status">{unavailable}</p> : (
        <div className="tf-portrait">
          <Image src={src} alt={alt} width={1024} height={1024} sizes="(max-width: 720px) 200vw, 70vw" onError={() => setFailed(true)} />
        </div>
      )}
    </div>
  );
}

type PreparedPreview = { src: string; width: number; height: number; bubble: { x: number; y: number } };

/** A prepared crop of the exact public demo, including its child. The full game
 * masters are never downloaded to render this below-the-fold marketing card.
 */
export function TransformationScene({ preview, alt, line, unavailable, loading }: { preview: PreparedPreview; alt: string; line: string; unavailable: string; loading: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useHomeQaRecovery(true, failed, () => {
    if (!failed) return;
    setLoaded(false); setFailed(false); setRetry(n => n + 1);
  });
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "240px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const ready = loaded && !failed;
  useEffect(() => {
    if (!near || ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 15_000);
    return () => clearTimeout(timer);
  }, [near, ready, failed, retry]);
  return (
    <div ref={root} className="tf-card__media tf-card__media--world" role={ready ? "img" : undefined} aria-label={ready ? alt : undefined}>
      {!ready ? <p className="tf-media__status" role="status">{failed ? unavailable : loading}</p> : null}
      {near ? <div key={retry} className="tf-world__composition" style={{ visibility: ready ? "visible" : "hidden" }}>
        <Image src={preview.src} alt="" width={preview.width} height={preview.height} unoptimized loading="lazy" decoding="async"
          className="tf-world__prepared" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        {ready ? <span className="tf-world__bubble tf-world__bubble--free" style={{ left: `${preview.bubble.x * 100}%`, top: `${preview.bubble.y * 100}%` }}>{line}</span> : null}
      </div> : null}
    </div>
  );
}
