import type { CSSProperties } from "react";

const SPARKS = [
  { x: -0.55, y: -0.6, delay: 0 }, { x: 0.6, y: -0.5, delay: 60 },
  { x: -0.7, y: 0.1, delay: 120 }, { x: 0.7, y: 0.15, delay: 40 },
  { x: -0.35, y: 0.65, delay: 160 }, { x: 0.4, y: 0.7, delay: 100 },
  { x: 0, y: -0.8, delay: 200 }, { x: 0.05, y: 0.85, delay: 140 },
];

/** Screen-space only: never filter, outline, move or lift the painted patch. */
export function FoundParticles({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <div className="found-particles" style={{ left: x, top: y }} aria-hidden>
      {SPARKS.map((spark, i) => (
        <span key={i} className="found-particles__spark" style={{
          "--spark-x": `${spark.x * width}px`, "--spark-y": `${spark.y * height}px`, "--spark-delay": `${spark.delay}ms`,
        } as CSSProperties} />
      ))}
    </div>
  );
}
