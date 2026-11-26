import { LogoEyes } from "@/ui/Icon";

/**
 * While ordering is closed: the brand peeks out from behind a bank of clouds, still looking for someone. It is the
 * product's own game (somebody is hiding), told in the site's pieces: the sun mark with its blinking eyes
 * (`.fm-logo__mark`), the game's white clouds, a spark and a paper plane on a dotted route. Decoration only.
 */
/** A whole cloud: bumps along the top, a flat underside with rounded ends, so it floats rather than ends in a box. */
const BANK = "M28 84Q4 84 8 66Q14 46 40 52Q50 30 80 36Q94 14 126 24Q142 2 170 16Q192 4 210 24Q234 14 248 34Q272 26 284 44Q308 42 314 64Q318 84 294 84Z";

export function PrelaunchArt() {
  return <div className="prelaunch-art" aria-hidden>
    <svg className="prelaunch-art__sky" viewBox="0 0 320 200" fill="none" focusable="false">
      <circle cx="160" cy="112" r="92" stroke="var(--ink)" opacity=".08" strokeDasharray="2 6" />
      <path d="M58 52l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="var(--sun)" />
      <path d="M262 34v10m-5-5h10" stroke="var(--sun-deep)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="36" cy="110" r="4" fill="var(--sun)" />
      <circle cx="286" cy="104" r="3" fill="var(--coral)" />
      {/* A paper plane setting off on a dotted route: somewhere to go, soon. */}
      <path d="M200 64q26-30 52-22" stroke="var(--ink-4)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
      <path d="M254 40l26-10-12 26-5-10z" fill="var(--white)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M263 46l17-16" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <span className="fm-logo__mark prelaunch-art__mark"><LogoEyes /></span>
    <svg className="prelaunch-art__bank" viewBox="0 0 320 90" preserveAspectRatio="none" focusable="false">
      <path d={BANK} transform="translate(0 6)" fill="var(--sea-soft)" />
      <path d={BANK} fill="var(--white)" />
    </svg>
  </div>;
}
