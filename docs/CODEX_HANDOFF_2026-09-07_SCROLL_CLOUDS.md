# Demo entrance follows the reader — 7 September 2026

## Change

The demo still preloads its real board and sprites below the fold. Its cloud curtain and intro now wait until at least 12% of the stage is visible, with a 32px bottom inset and a 160ms attention beat. Both image and viewport readiness remain mandatory. Normal games retain their existing readiness behavior.

The reveal is latched for that scene mount: scrolling away and back does not hide the board, reset progress, or replay the intro. A quick pass before the 160ms beat cancels the pending entrance. Reduced motion skips the added beat and uses the existing opacity-only curtain transition. Missing IntersectionObserver fails open once assets are ready. The demo heading uses the site's existing scroll reveal.

## Verification

- `npm run check -- --maxWorkers=2`: 57 files, 412 tests passed; TypeScript clean. Six new tests cover visibility/readiness, timing, scroll-away cancellation, one-shot behavior, normal games, reduced motion, missing API and cleanup.
- Local real-browser measurement, loaded assets while offscreen: curtain remained closed.
- Desktop: open class 180ms after scrolling into the stage.
- Portrait 390×844: 176ms; stage height 626px within the 658px demo frame.
- Landscape 844×390: 185ms; stage height 330px. Scroll away/back preserved `is-open`.
- Existing 900ms cloud-parting transition preserved. No extra long loading delay introduced.
- Local screenshots: `output/slot-review-20260907/cloud-scroll-{portrait,landscape}.png` (not committed).

## Independent QA for Claude

1. Load the homepage at the top, wait several seconds, then scroll normally to the demo. The clouds must still perform their entrance, without a click.
2. Repeat with an anchor link to the demo, portrait/landscape phones, fast scrolling, and a slow image load.
3. Play, scroll away/back, and verify no progress reset. Repeat the demo deliberately: the new scene mount may reveal again.
4. Check reduced-motion settings and ensure real full-game scene changes still use the existing page-turn behavior.

No model, pricing, payment, authentication, database, or slot placement changed in this commit.
