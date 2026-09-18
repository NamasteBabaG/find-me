# QA picture and completion incident — 2026-09-18

## Verified cause

The Sydney first appearance's delivered PNG does not contain the personalized
child. This is not a loading/viewport fault. Stored blob SHA-256 matched the
judge's `judgedSha256` (`470479e5d0f06e5d9fc3ffcde60b69d1d3df9b0ce29d22a99dbc8748f44c4d47`).
Both the individual and grouped visual reviews falsely passed child presence.
Pixel-difference geometry measured changed background, not proof of a child.

The parent also rejected likeness in two Antarctica appearances. Inspected all
three against the original consented photo; selected earlier, previously reviewed
renders for appearances 1 and 2. Appearance 3 is unchanged. Assistant visual
review is NOT parental likeness approval.

## Bounded repair

`scripts/repair-bar-qa-pictures.ts` prepares an incident-specific offline manifest
and SQL for the dedicated QA project and one exact delivered game. It checks
original art/input/receipt/image hashes, native image size and reviewed geometry.
No paid provider call, regeneration, catalogue change or production write.

- Three immutable new assets: Sydney 1, Antarctica 1 and 2.
- The historical Antarctica first crop starts at x=863, not the newer crop's 895.
  Image, footprint, anchor, both variants, slots and hints use the matching crop.
- Published game and scene configs and adventure image bindings move together.
- Album rows are locked and their current finds/discoveries retained exactly.
  Only the image-bearing book and revision change. Preferences stay untouched.
- Full prior config/progress and original judge evidence are retained privately.
- Variant records explicitly record manual assistant review of reused bytes.
  They do NOT inherit the false automated pass. Automatic regeneration/publication
  still fails closed without a new review satisfying the normal source binding.
- Game/config/scene/variant compare-and-set guards reject concurrent changes.
  An active generation job prevents publication.

Deploy code compatibility **before** executing the final repair transaction.
Staging blobs alone does not publish them. Never print private snapshots/bytes in
reports or commit them. Local backups and manifest live in ignored storage.

## Progress compatibility

`readAdventureProgress` accepts a corrected personal-image binding from the
trusted game config only when all reward/content identity is unchanged: game,
avatar, release, art, scene version, route, ordered targets, discoveries and
postcards. It replaces stale image references with the trusted config's bindings,
validates earned event IDs and duplicates, and does not reset or award anything.
Changed child/content releases remain explicit errors. This also covers guests'
old browser caches, not only the owner's server album.

## Completion behaviour

The earned local album starts celebration immediately. Account persistence and
passport preference fetches are not animation gates. The photo and paper are
full-colour/opacity immediately; stamp impact is ~220ms into the animation,
choreography settles after 850ms. One short synthesized paper/rubber impact
respects audio unlock, mute and reduced motion. No sound file/provider required.

Owner saved/saving/offline/refused/unsaved statuses remain truthful. Seen-event
account writes wait for confirmed progress, while a local journal permits retry.
Mute changes and late preference responses never restart the animation.

## Verification

- Original regression tests failed on the old waiting gate, then passed.
- Full gate: 253 files, 3371 passed, 2 expected failures, 35 skipped (770.57s,
  two workers). Then three extra offline/refused/unsaved cases were added.
- Final focused gate: 7 files, 102 passed (album service/store/sync, adventure
  domain, passport service, completion and audio).
- TypeScript checked; production build is also a deployment gate.
- Real local browser: physically found all three demo hides. Photo/page opacity
  stayed 1 with filter none in sampled frames; stamp fully visible within ~407ms
  under the concurrent full-suite load, choreography settled ~1.1s after opening.
- Private visual receipts/screenshots in ignored `storage/sydney-bug-20260918`.

## Still open

The systemic visual-review false positive is NOT fixed by replacing three assets.
Do not claim the automatic judge guarantees likeness or child presence. Treat
this exact failed image as evidence when improving/evaluating that gate separately.
New-board work stays secondary to validating this incident repair in QA.

## Deployment and database receipt

- App commit `288b3b3f7b3402890e55b6fa9fe27c1c0ac1c5b5`, clean checkout, pushed.
- Dedicated QA deployment `dpl_51WZqoABnH9n2b7xfWBr7BPbE8Fd`, READY,
  promoted to `https://qa.findmeworlds.com` and alias resolution inspected.
- Remote build/type check passed; privacy audit: zero private asset leaks;
  function bundle 177.64MB. Post-deploy error-log query returned no entries.
- Three uploaded blob hashes match the pinned source hashes. New Asset rows are
  GAME/READY, carry zero new generation cost and preserve the old judge evidence.
- Atomic repair succeeded: album revision 79 -> 80, 27 finds and 52 discoveries.
  PostgreSQL JSON comparisons prove the entire find/discovery arrays unchanged
  and the repaired album book identical to the published game's adventure book.
- Game remains DELIVERED; generation job was DONE. No payment/status/ownership
  or passport preference changes. No paid calls were made for this repair.
- Owner-route live play is **not yet verified after repair**: the browser remains
  signed into the separate magic-pilot owner, so this other owner's family route
  correctly returns not found. Asked for normal owner sign-in and supplied the
  original link again. No authentication bypass or new sharing capability used.
- The local browser choreography and exact source images were inspected; do not
  substitute that evidence for the remaining real-owner live play check.

Rollback, if necessary, must restore the prior config AND album book together
from the private audit receipt, while preserving any newer earned events. Do not
replace the entire progress snapshot with the older audit snapshot.
