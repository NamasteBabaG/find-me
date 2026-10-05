/**
 * The tools a child presses, drawn as one family.
 *
 * They were thin grey strokes in dark grey discs — a video player's furniture
 * sitting on a painting (Guy). Now they are chunky rounded shapes on a white
 * button that lights up gold under a finger: a magnifier with a real handle, a
 * frame that means "show me all of it", a speaker with two arcs, and a folded
 * map instead of the emoji that was the odd one out.
 */
export function ToolIcon({ name }: { name: "map" | "zoom-in" | "zoom-out" | "fit" | "sound-on" | "sound-off" | "replay" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="scene__icon" viewBox="0 0 24 24" aria-hidden focusable="false">
      {name === "map" ? (
        <g {...common}>
          <path d="M3 6.4 9 4l6 2.4L21 4v13.6L15 20l-6-2.4L3 20z" />
          <path d="M9 4v13.6M15 6.4V20" />
        </g>
      ) : null}
      {name === "zoom-in" || name === "zoom-out" ? (
        <g {...common}>
          <circle cx="10.2" cy="10.2" r="6.2" />
          <path d="M15 15 20.5 20.5" />
          <path d="M7.4 10.2h5.6" />
          {name === "zoom-in" ? <path d="M10.2 7.4v5.6" /> : null}
        </g>
      ) : null}
      {name === "fit" ? (
        <g {...common}>
          <path d="M4 9.5V5.6A1.6 1.6 0 0 1 5.6 4H9.5" />
          <path d="M20 9.5V5.6A1.6 1.6 0 0 0 18.4 4H14.5" />
          <path d="M4 14.5v3.9A1.6 1.6 0 0 0 5.6 20H9.5" />
          <path d="M20 14.5v3.9A1.6 1.6 0 0 1 18.4 20H14.5" />
        </g>
      ) : null}
      {name === "replay" ? (
        <g {...common}>
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M19.8 3.8v4.6h-4.6" />
        </g>
      ) : null}
      {name === "sound-on" || name === "sound-off" ? (
        <g {...common}>
          <path d="M4.5 9.2h3L11.8 5.4v13.2L7.5 14.8h-3z" />
          {name === "sound-on" ? <path d="M15.4 9.4a3.7 3.7 0 0 1 0 5.2M18.2 6.6a7.6 7.6 0 0 1 0 10.8" /> : <path d="m16.2 9.6 5.2 4.8m0-4.8-5.2 4.8" />}
        </g>
      ) : null}
    </svg>
  );
}
