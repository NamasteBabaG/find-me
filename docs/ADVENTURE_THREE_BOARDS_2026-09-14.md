# Three-board local pilot — Bar, age five

## Scope

Isolated branch `codex/adventure-three-boards-20260914`, based on `5e7f926`
(includes Claude's discovery/album persistence corrections). No production or
QA deployment; no existing game, shop, checkout, price, live catalog or renderer
policy replacement. Install used this branch's lockfile and Vitest 4.1.11.

Three opt-in boards: Giza, Amazon, New York. Each immutable base is 3840×2160;
lossless delivery images and hashes are in `content/adventures/three-art.json`.
This is pixel size, not a claim that every feature contains photographic detail.
The board composition is shallow, with distributed activities and similar-sized
people. Existing v9 personal patches retain their established 768×1152 low
provider policy and become 512×768 local composites; they are not native 4K
personal generations.

## Play contract

- Three sequential hides per board, one child visible at a time. The third find
  unlocks the next board and a postcard. Stay on the completed board to collect.
- Six optional discoveries on each board: three common, two rare, one epic.
  Rarity is authored metadata, not random rewards, monetary value or a lootbox.
  Difficulty is independently authored 1–3; it does not shrink tap padding.
- All six items can be found in any order, even without selecting their card.
  Item taps give a short non-blocking acknowledgment, never a child star.
- A compact discovery counter opens six pixel-crop cards. Choosing one gives a
  name, optional user-triggered speech, and progressive hints: words, broad area,
  precise area. The child's final hint can refocus after an item moved the camera.
- The bag shows missing/collected cards, rarity and short story, plus postcards
  composed from the board and the first personal patch. No second save system:
  guest browser state and authenticated owner account sync use the existing album.
  Existing offline, retry, idempotence and honest save-status behavior is retained.

The exact 18 item names, authored bounds, crop rectangles, rarity and hints are
in `content/adventures/three-boards.ts`. New collection UI is gated by the explicit
`collectionUi: guided-v1` flag. Legacy boards keep their prior behavior.

## Art and likeness review

Parent supplied `Bar.png`, age five. Canonical identity used the parent's photo
for face and curls and a healthy original Giza child only for illustration style.
The malformed original Giza boy was repaired with a constrained local composite;
all six collectible card regions were verified byte-identical. A suspected Amazon
fusion was a contact-sheet adjacency artifact, not a base defect; no repair was
purchased for it.

Private retained evidence is under `storage/adventure-bar-20260914/` and
`output/imagegen/adventure-three-repairs-v1/`, not committed. Nine selected patch
files were inspected for likeness, age, anatomy, support and seams. Four first
attempts were replaced: three technical seam refusals, one crouching ground-contact
issue. No refused output can be published by the seed script. The final review
pins input, avatar and patch SHA-256 values and actual visible child geometry,
rather than assuming the planning mask equals the resulting child position.

This is assistant visual acceptance for a local pilot, **not parent confirmation
of unmistakable likeness**. Parent review remains important before family use.
No automated identity-judge pass is claimed.

Retained personal ledger: one identity and thirteen patch purchases (nine initial,
four targeted replacements), $0.348292 settled, no unresolved/reserved calls.
The script imposes a $2 reservation ceiling inside the existing ledger, whose
underlying default world ceiling is $5. Original base generations and the separate
Giza repair CLI call are not included in that personal subtotal.

## Local setup and immutable games

Set `DATABASE_URL` to the absolute `file:` URL for
`storage/adventure-three-local.sqlite`, `APP_URL=http://localhost:3017`,
`STORAGE_PROVIDER=local`, `GENERATION_PROVIDER=mock`, `ANALYTICS_PROVIDER=none`.
Assembly refuses other database paths and production mode, and makes no provider
calls. Run via `npx tsx scripts/adventure-three-game.ts` with one flag:

- `--fixture`: clearly marked TEST targets, immutable fixture ID.
- `--verify-reviewed`: separate Bar verification game, safe to complete in QA.
- `--reviewed`: fresh Bar handoff game, separate immutable ID and zero progress.

The reviewed modes require `final-review.json` and retained accepted technical
receipts. `scripts/finalize-adventure-bar-review.ts` seals the explicit assistant
selection; it is not an automatic image judge or permission to skip visual review.
Repeated seed calls return the existing game, never replace/reset it. The local
owner address is `adventure-pilot@findme.local`; generated magic links stay local.
Do not commit the child's images, SQLite databases, authentication tokens or keys.

## Verification record

Clean-install full test run: 217 files passed; 3167 passed, 2 expected failures,
35 skipped (3204 total). Later changes were covered by a focused 4-file/33-test
passing run (including actual geometry requirements and child-hint refocus).
Type-check and both content validators passed. Full `npm run build` passed,
including Prisma generate, Next compilation/type checks, trace finalization and
catalog-tracing audit (`status: pass`, no private leaks). Build-only isolated
environment used a random session secret and reserved `.invalid` APP_URL; no
external deployment or network service was created. The handoff server runs in
local development mode with its original local signing configuration.

Live TEST fixture: all three boards, nine child finds and eighteen item finds;
one child at a time; stay-and-collect; three postcards; refresh preservation;
guest-to-owner sync; second clean owner browser adopted all nine finds. Mobile
390×844 album checked. No actual phone test or new live offline test is claimed.

Reviewed Bar verification game: all nine personal hides and all eighteen items
collected through actual viewport clicks; three postcards; zero remaining child
sprites after each completed board; refresh retained progress. Entire Amazon run
was at 390×844, including scrollable item selection and progressive hints.
Screenshots: `storage/adventure-three-preflight/bar-mobile-tray.png`,
`bar-album-all.png`, and per-board `*-complete.png`.

Fresh handoff `game_adventure_bar_three_v1` is DELIVERED with 3×3 targets and
3×6 discoveries. Read-only DB check confirmed no owner album exists yet, and
the verification game's progress is separate. Link and local owner sign-in are
in ignored `storage/adventure-three-preflight/bar-game.json`.

## Deployment boundary

Nothing was deployed. A future deployment must include the album schema on its
target database before code that deletes/reads that table, per the base pilot
document. Local Bar assets are GAME-scoped and local; publishing this branch alone
does not transfer the private game, database or assets to a remote environment.
