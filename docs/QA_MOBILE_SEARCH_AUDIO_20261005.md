# Mobile search and sound: review and implementation

Scope: give the painting more room on a phone, retain the map exit and
discoveries, and investigate silent client audio. This release changes no
generated artwork, catalog, payment or generation-budget rules.

## Captured flow

1. **Searching — improved.** The original 390x844 view had five 64px tools in
   a 340px side rail. Compact frames now omit the three camera buttons. Map
   stays at the top; sound sits at the bottom. The portrait cue, stars and
   hint remain when still. Actual pan/pinch hides them and the collection,
   makes those controls inert, and restores them 600ms after the gesture ends.
   Another gesture cancels that return timer. Map and the board remain usable.
2. **Discoveries — improved.** In the captured Hebrew fixture the open tray
   changed from 358x400 to 320x280; all six pictures and names remain visible.
   Mobile rarity badges and the repeated footer are omitted. Sticker hit
   targets measured 96x84; the smaller guide's thumbnail, hint and close
   controls retain a 64px floor. Long authored names wrap rather than clip.
   Panning collapses the tray without clearing the selected discovery/hint.
3. **Picture inspection — improved.** The guide thumbnail opens a native
   modal showing the same crop enlarged, with an accessible title and close
   control. At 390px the crop measured 320px wide; at 320x640 the dialog fit
   without horizontal overflow. Close and Escape return focus to the
   thumbnail and preserve the selected hint.
4. **Sound preference — fixed reproducible causes; physical output unverified.**
   A new game could show sound enabled while the shared manager remained
   muted. Also, unmounting one demo/game could suspend another mounted widget.
   Hydration now restores/synchronizes the actual mute choice, including
   previews/demos; a strict versioned boolean persists it across reloads.
   Explicit unmute unlocks audio and requests an existing short confirmation
   cue. Only the last mounted audio owner suspends the shared kit. Boot scene
   theme/ambient changes occur after mount, not during rendering.

## Verification

- Local browser checks used an existing isolated SQLite fixture, public demo
  art and synthetic figures, with mock providers and generation disabled.
  No customer photos, private QA game reads, purchases or image-provider calls.
- Phone views 320x640 and 390x844, a short 844x390 frame, tablet view 768x1024
  and desktop view 1400x900 were checked. Compact means measured width <=720px
  or height <=500px, including narrow embedded previews. Wider/taller frames
  retain camera tools and do not hide the HUD while panning.
- Actual pan hid HUD/collection while preserving the map and zero-find
  progress. The map exit worked. Native crop close/Escape and focus return
  worked. Mute survived browser reload and explicitly enabling it updated
  the visible speaker/read-aloud state.
- Keyboard users retain + / - / 0 zoom/reset, without intercepting Ctrl/Meta
  browser shortcuts. Gesture tests cover pan, pinch, remaining finger,
  cancellation, lost pointer capture and resize. Reduced motion removes the
  new fades; existing quiet collection guidance remains supported.
- Focused review: audio/compatibility 93 tests; gesture hook 16 tests;
  collection 17 tests. The final UI/parent-dialog review passed 56 tests;
  sound-preference/preview isolation passed 46. TypeScript passed separately.
- Full `npm run check -- --maxWorkers=4` passed: 345 files, 4,373 tests,
  two expected failures and 55 skips. Preview tests explicitly allow only
  reading the mute preference after mount; protected progress, album and
  round remain untouched, with no writes or telemetry. A parent-dialog test
  now waits for the native close effect rather than racing the prompt render.
- The local production build and private-asset tracing audit passed with no
  private leaks or audit problems, using mock providers and a disposable DB.
- Captures under ignored `output/mobile-search-audit/` are layout evidence.
  Synthetic discovery names/locations are not evidence of generated-art or
  discovery-mapping quality. Browser sizes are not physical-device tests.
- The user's last silent session cannot be diagnosed retrospectively from
  source. Device volume, silent switch, output route and actual audible
  output were not observed. No new image-generation run was performed.

Full check/build results and exact CI/deployment/alias evidence are recorded
in ignored `output/friends-world-release/` before QA publication. Publishing
requires a clean pushed commit, completed quality gate, dedicated QA READY
deployment and successful remote private-asset audit.
