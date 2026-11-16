/**
 * The product's icons: one rounded stroke family on a 24px grid, drawn in the text's colour.
 *
 * They replace the emoji the site used to wear (Guy, 2026-11-16: emoji read childish and cheap, and look different
 * on every phone). The board's own tools keep their chunkier `ToolIcon`; these are the same shapes at a calmer weight
 * for chips, notes and buttons.
 */
export type IconName =
  | "camera" | "map" | "gift" | "search" | "bulb" | "heart" | "replay" | "bag" | "family" | "cake" | "plane"
  | "link" | "book" | "lock" | "key" | "pencil" | "sparkle" | "speaker" | "letter" | "globe" | "crown" | "hourglass"
  | "brush" | "star" | "cloud" | "card" | "home" | "candle" | "chevron" | "check" | "plus" | "arrow";

const P: Record<IconName, string[]> = {
  camera: ["M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2.2h5.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z", "M12 16.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z"],
  map: ["M3.5 6.6 9 4.5l6 2.1 5.5-2.1v12.9L15 19.5l-6-2.1-5.5 2.1z", "M9 4.5v12.9M15 6.6v12.9"],
  gift: ["M4.5 10h15v9.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z", "M3.5 7h17v3h-17z", "M12 7v13.5", "M12 7C10.6 4 7.4 4 7.4 5.6S10 7 12 7zm0 0c1.4-3 4.6-3 4.6-1.4S14 7 12 7z"],
  search: ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "m15.3 15.3 4.7 4.7"],
  bulb: ["M9 17.5h6", "M10 20.5h4", "M8.6 14.6A6 6 0 1 1 15.4 14.6c-.6.5-.9 1.2-.9 1.9v1H9.5v-1c0-.7-.3-1.4-.9-1.9z"],
  heart: ["M12 19.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z"],
  replay: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3", "M19.8 3.8v4.6h-4.6"],
  bag: ["M5 8.5h14l-1 11a1 1 0 0 1-1 .9H7a1 1 0 0 1-1-.9z", "M9 10.5V7a3 3 0 0 1 6 0v3.5"],
  family: ["M8.5 10.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z", "M3.5 19.5a5 5 0 0 1 10 0", "M16.5 12a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z", "M14.6 15a3.9 3.9 0 0 1 5.9 3.4v1.1"],
  cake: ["M4.5 13h15v6.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z", "M6 9.5h12V13H6z", "M12 9.5V7", "M12 4.2c.9 1 .9 1.8 0 2.4-.9-.6-.9-1.4 0-2.4z", "M4.5 16.2c1.3 1 2.5 1 3.8 0s2.5-1 3.7 0 2.5 1 3.7 0 2.5-1 3.8 0"],
  plane: ["M10.5 20.5 12 15l-5-1-2 2-1.5-.5 1.5-4-1.5-4L5 7l2 2 5-1-1.5-5.5h2l4 6.5h3.5a1.5 1.5 0 0 1 0 3H16.5l-4 6.5z"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"],
  book: ["M4.5 5.5A1.5 1.5 0 0 1 6 4h12.5v14H6a1.5 1.5 0 0 0-1.5 1.5z", "M4.5 19.5A1.5 1.5 0 0 0 6 21h12.5v-3", "M8.5 8h6"],
  lock: ["M6 11h12v8.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3", "M12 14.8v2"],
  key: ["M8.5 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z", "M13 12h8", "M18.5 12v3", "M16 12v2"],
  pencil: ["M4.5 19.5 5.6 15 15.8 4.8a2 2 0 0 1 2.9 0l.5.5a2 2 0 0 1 0 2.9L9 18.4z", "m14.2 6.4 3.4 3.4"],
  sparkle: ["M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z", "M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"],
  speaker: ["M4.5 9.2h3L11.8 5.4v13.2L7.5 14.8h-3z", "M15.4 9.4a3.7 3.7 0 0 1 0 5.2M18.2 6.6a7.6 7.6 0 0 1 0 10.8"],
  letter: ["M3.5 6.5h17v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z", "m3.8 7 8.2 6.2L20.2 7"],
  globe: ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z", "M3.5 12h17", "M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5z"],
  crown: ["M4 17.5 3 8l5 3.8L12 5l4 6.8L21 8l-1 9.5z", "M4.5 20.5h15"],
  hourglass: ["M6.5 3.5h11", "M6.5 20.5h11", "M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5", "M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5"],
  brush: ["M14.5 4.5 19.5 9.5 12 17l-5-5z", "M7 12c-2.5 0-3.5 2-3.5 4.5 0 1.5-.5 2.5-1 3 3.5.5 7.5-.5 7.5-4.5"],
  star: ["M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"],
  cloud: ["M7 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.3A4.7 4.7 0 0 1 17 18.5z"],
  card: ["M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z", "M12 8.5c.5 2.4 1.2 3.1 3.5 3.5-2.3.4-3 1.1-3.5 3.5-.5-2.4-1.2-3.1-3.5-3.5 2.3-.4 3-1.1 3.5-3.5z"],
  home: ["M3.8 11.2 12 4.2l8.2 7", "M6.2 9.4V19.2A.8.8 0 0 0 7 20h3.6v-5.2h2.8V20H17a.8.8 0 0 0 .8-.8V9.4"],
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  chevron: ["m6.5 9.5 5.5 5.5 5.5-5.5"],
  plus: ["M12 5v14", "M5 12h14"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  candle: ["M9.5 10.5h5v9.5h-5z", "M12 10.5V8.6", "M12 3.6c1.3 1.4 1.3 2.7 0 3.6-1.3-.9-1.3-2.2 0-3.6z", "M6.5 20.5h11"],
};

/** A world's emblem, by its slug: the world JSON still carries an emoji for older saved games, but it is never drawn. */
export function worldIconName(slug?: string | null): IconName {
  return slug === "kingdom" ? "crown" : slug === "timetravel" ? "hourglass" : "globe";
}

export function Icon({ name, className = "fm-icon", strokeWidth = 2 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} data-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/**
 * The brand mark: two round eyes peeking out of the sun tile. It used to be the 👀 emoji, which every phone draws
 * differently and which read as a placeholder. The tile itself stays the CSS `.fm-logo__mark`.
 */
export function LogoEyes({ className = "fm-logo__eyes" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <ellipse className="fm-eyes__white" cx="10.5" cy="16" rx="6" ry="7.5" stroke="currentColor" strokeWidth="2" />
      <ellipse className="fm-eyes__white" cx="21.5" cy="16" rx="6" ry="7.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12.4" cy="17.4" r="2.9" fill="currentColor" />
      <circle cx="23.4" cy="17.4" r="2.9" fill="currentColor" />
      <circle className="fm-eyes__white" cx="13.4" cy="16.3" r="0.9" />
      <circle className="fm-eyes__white" cx="24.4" cy="16.3" r="0.9" />
    </svg>
  );
}
