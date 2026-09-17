# Passport turn polish: integration and QA

## Scope

Integrated Claude's `6fa9a43f9e9c84a988042f3b0893da70a7cda8a2` onto the QA
release branch after `05d798a8`. Only PassportBook, its tests and its stylesheet
change. Family ownership, sharing expiry/revocation and payment fixes from
`bea4b219` remain intact. No schema, provider configuration or wizard changes.

Accepted: world-divider buttons with `aria-current`, larger mounted print,
caption inside the print, ink stamp on paper, underlying-spread settle and
laptop-height accommodation. Preserved our existing flex-photo and short-phone
content-fit fixes during the stylesheet conflict resolution.

## Additional defect found and fixed

Claude's face-level backface fix alone still showed mirrored Hebrew in Chromium
at 430 ms of the 640 ms turn. Removing the rotating parent's opacity fade alone
was also insufficient. Keeping the **book** in the same `preserve-3d` context
resolved the observed reverse-face leak. The rotating leaf no longer fades its
3D parent; React removes the decorative leaf when the turn finishes. The reverse
contains paper and an ornament, not another copy of the old page's text.

This follows the [CSS 3D grouping rules](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style):
opacity below one flattens a preserve-3d subtree. The need for book-level
preservation was verified experimentally in the running app, not inferred from
a passing component test.

Also removed obsolete mobile photo padding and the stamp's negative mobile
margin, so the new caption and stamp remain separate on a short phone.

## Verification

- `npm run check -- --maxWorkers=4`: 247 files, 3333 passed, 2 expected failures,
  35 skipped, zero unexpected failures. The final CSS-only adjustment was then
  browser-checked; focused PassportBook tests were rerun: 11/11 passed.
- New regression test switches worlds during a turn, cancels its old leaf and
  timer, resets the page and persists the new world/page cursor. Keyboard,
  reduced-motion, read-only and photo-retry tests remain green.
- Real Chromium on the isolated fictional beach-demo fixture, localhost:3034.
  No personal child photograph or live user progress changed.
- Hebrew next/previous and English next reverse-face frames inspected at 430 ms.
  The CSS animation was paused and only its decorative cleanup delayed in the
  test browser; no test hooks were added to application code. Final frames show
  blank reverse paper without mirrored text. Normal turns settle and re-enable
  navigation.
- Image decoding verified for the souvenir and all six discovery thumbnails.
  Zoom dialog opens and Escape returns to the same page. Browser error list empty.
- Both Hebrew and English: no horizontal or vertical page overflow at 1440x900,
  1366x768, 1254x620, 390x844, 360x740 and 360x640. Measured the contents as well
  as the shell: action rows and both item rows remain inside their leaves.
- At 360x640 the six-item row still has 6px clearance at the foot. The short
  screen deliberately uses the compact photo rather than clipping controls.

Local visual evidence lives in ignored `output/passport/`: `turn-book-3d.png`,
`turn-previous-430.png`, `turn-next-en-430.png`, `turn-final-mobile.png`,
`turn-final-mobile-en-loaded.png`, `turn-final-desktop-en-loaded.png`.
These use a fictional public demo fixture. Login/session material is not tracked.

## Boundaries

This is not a new cover redesign or a fresh completion-ceremony design review.
Those were explicitly outside Claude's latest pass and remain separate polish
work. Existing opening/closing behaviour is preserved. Refund concurrency,
PayMe and general production-release gates are not changed by this UI release.
QA deployment receipt will be appended after the build and live smoke check.
