import { cloudlet } from "./cloudlet";

const BODY = cloudlet(100);

/**
 * Three small picture-book clouds drifting across a section's sky: the hero's,
 * and the sun sheets'. They are the game's own cloudlets (the ones that trail
 * off its cloud curtain), so the page feels like the same bright world the
 * child plays in. Decoration only: behind the content, never in its way.
 *
 * Each cloud drifts sideways very slowly and bobs on its own beat. Only
 * transforms move, each cloud is rastered once, and the clouds stand still for
 * reduced motion. Positions and paces live in CSS (`.sky--hero`, `.sky--sun`).
 */
export function SkyClouds({ variant }: { variant: "hero" | "sun" }) {
  return (
    <div className={`sky sky--${variant}`} aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`sky__cloud sky__cloud--${n}`}>
          <svg className="sky__shape" viewBox="0 0 100 60" focusable="false">
            <path d={BODY} transform="translate(-3 4)" className="sky__shade" />
            <path d={BODY} className="sky__body" />
          </svg>
        </span>
      ))}
    </div>
  );
}
