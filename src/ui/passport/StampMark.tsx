/**
 * The FindMe eyes, drawn as stamp ink.
 *
 * The mark on every other surface is the 👀 emoji on a sun-gradient tile, and a
 * stamp cannot use it: a stamp is ONE colour pressed into paper, and a colour
 * emoji sitting inside a ring reads as a sticker. These are the same two eyes
 * as strokes and two solid pupils in `currentColor`, so they take the stamp's
 * ink and blend into the page with it.
 *
 * Every place uses the same mark. The visited meaning is announced by the
 * stamp wrapper, not repeated as visible text inside the ring.
 */
function StampEyes() {
  return (
    <svg viewBox="0 0 40 24" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="10.5" cy="12" rx="9" ry="10" stroke="currentColor" strokeWidth="2.2" />
      <ellipse cx="29.5" cy="12" rx="9" ry="10" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="13" cy="13" r="3.6" fill="currentColor" />
      <circle cx="32" cy="13" r="3.6" fill="currentColor" />
    </svg>
  );
}

/** One accessible die for the book and the completion ceremony. Only placement differs. */
export function PassportStamp({ label, className, isNew }: { label: string; className: string; isNew?: boolean }) {
  return <div className={`passport-stamp ${className}`} role="img" aria-label={label} data-new={isNew}>
    <span className="passport-stamp__mark" aria-hidden="true"><StampEyes /></span>
  </div>;
}
