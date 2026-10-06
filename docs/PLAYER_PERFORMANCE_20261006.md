# Player performance audit — 6 October 2026

The reported device is iPad Pro model A1584, the first 12.9-inch generation.
The changes reduce avoidable rendering, allocation and loading work while
preserving historical game versions, original artwork, hit geometry and progress.
This audit does not measure that physical iPad's FPS or Safari memory.

## Changes

- Camera events accumulate immediately in a live transform, but publish at most
  once per animation frame. Releases, resets and taps flush the latest position.
  Unchanged edge-clamped input does not render. Static artwork and legacy
  composed sprites remain stable while the containing camera moves.
- Invisible settled cloud banks pause their animation and release `will-change`.
  Coarse-pointer HUD controls use opaque white surfaces instead of multiple
  backdrop blurs over a moving board; their dimensions, shadows and press
  feedback remain intact. The board's uniform colour filter is unchanged.
  Board requests release preload references on retry/unmount; optional decoration
  has a bounded timeout. Essential and currently mounted child decode barriers
  remain in place before play opens or the next hide appears.
- Accepted tap cues schedule before storage/subscriber work. The first cue runs
  before ambience allocation; bounded noise buffers are reused per audio context.
  Audio allocation, scheduling and mute errors cannot prevent finds or earned
  completion from being saved. Ambience failure waits for explicit retry.
- The selected passport reader loads on demand. Owner-book prefetch remains a
  small independent module. A failed reader import offers retry and a map exit.
  Legacy album artwork only mounts near the viewport and releases offscreen
  backgrounds/patch nodes, with an eager fallback for unsupported observers.
- Public authored QA rasters revalidate through the access gate and reuse the
  static ETag body. Private child media retains its existing authorization and
  cache policy. Server encoded scene-art cache is a 32 MiB LRU with concurrent
  identical reads deduplicated.
- Removed only an unused `useWide` hook/test, unused destructive storage helpers
  and CSS selectors without live callers. Historical renderers and script callers
  remain supported. No runtime dependency was removed speculatively.

## Controlled before/after measurements

Baseline: `881423546b702aac3922cde9fc110d80d3c5795b`.
The camera harness uses that exact hook source, byte-equivalent viewport math,
a synthetic 4096×2731 stage at twice fit scale and controlled RAF delivery.
Each sample gets a separate React `act`; StrictMode is disabled.

| Work measured | Baseline | Current |
| --- | ---: | ---: |
| 120 pointer samples before one display frame: React renders | 112 | 2 |
| Same burst: transform publications | 112 | 1 |
| 120 samples already against a clamped edge: renders/publications | 120/120 | 0/0 |
| Initial `/layout` + `/play/[token]/page` JS, per-file gzip sum | 239,975 B | 232,451 B |
| Initial route CSS, per-file gzip sum | 45,448 B | 42,712 B |

The three viewport profiles (1366×1024, 1024×1366 and 390×650) produced the same
work counts. Final transforms, live normalized hit coordinates, release behavior
and unmount cleanup matched. These are workload counts and build inventory,
not measured device frame rate, network transfer or audible latency.

## Image findings and budgets

The current nine-board journey is 114,188,118 encoded bytes; the nine-board
kingdom is 111,193,608 bytes. These are inventory totals, not simultaneous player
downloads. A 3840×2160 raster represents 33,177,600 bytes in one decoded RGBA
buffer, before GPU copies and patches. Existing frozen boards are lossless WebP;
lossy conversion risks seams between original boards and generated patches.
No published board or identity image was re-encoded or changed.

`npm run build` now runs `scripts/audit-player-performance.mjs` after the private
asset audit. It checks route chunks, frozen board hashes/dimensions and limits:
300,000 B initial JS gzip, 60,000 B CSS gzip, 16 MiB per encoded board,
128 MiB per world and one 4K RGBA buffer per base. `npm run perf:audit` reruns it
against a completed build. Unsafe chunk paths, changed frozen images and exceeded
budgets fail the build. Eight script tests exercise the actual audit with
synthetic image/build fixtures; no environment, database or provider is read.

## Verification

- TypeScript and 354 test files passed in the full four-worker local run:
  4,550 passing tests, two expected failures and 55 existing skips. One unchanged
  production-bootstrap test timed out during the concurrent build. Its full
  17-test file passed separately in 3.05 seconds. Exact pushed-commit CI remains
  mandatory before QA promotion.
- The production-equivalent local build passed the private-asset audit
  (`privateLeaks: []`) and the new performance audit (`problems: []`).
- Actual HTTP probe: authenticated static board 200 / 12,235,432 B; conditional
  repeat 304 / 0 B, both private and must-revalidate. An unauthenticated conditional
  request was redirected 307 with private/no-store. Authorization still runs.
- Browser on local mock data: three public demo hides found, current child
  decoded before display, accurate tap after drag, completion and return to
  discovery collection; phone has no horizontal overflow. Tablet portrait
  passport image enlarged successfully. No browser errors after the corrected
  local test configuration. Tested viewport sizes are not device emulation.
- Independent read-only review found no actionable cross-component regression.

Ignored local evidence is in `output/performance-20261006/`; it includes the
camera harness results, build inventories, HTTP probe, test logs and screenshots.
It contains public/synthetic fixtures only and is not release source.

For physical acceptance, reload the same QA game after the iPadOS update and the
QA release, then compare drag/zoom, three successive hides, sounds and passport
opening. Existing games can use the improvements without new paid generation.
This release does not change production resources, game generation policy,
the $5/world budget, customer assets, payments or delivery.
