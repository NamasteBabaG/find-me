# Bar: density-v3 local nine-board pilot

The parent approved the six density-v3 base boards and explicitly resumed three
Bar hides per board. The old family-tested three-board game is preserved. This
is local-only content and assembly, not a production/QA deployment or paid-catalog
registration. Bar's supplied photo and all personal images remain in ignored storage.

## Content and art

The separate `density-boards.ts` catalog contains Giza, Amazon, New York, Paris,
Marrakech, Tokyo, Great Wall, Sydney and Antarctica. Each has three sequential
child finds and six optional discoveries: three common, two rare and one epic.
Rarity is metadata, not a guarantee of perceptual difficulty. Children see one
personal sprite at a time. Existing hints, album, postcard and sync code is reused.
All nine master boards are verified 3840×2160. Three finds advance; six optional
items can be collected before or after completing the child finds.

All 36 new item crops and personal crop intersections were inspected. Two missing
or ambiguous objects were repaired using native image generation: Marrakech's
violet gecko and Tokyo's origami frog. Only 92×92 and 79×66 pixel regions were
composited into separate lossless WebP derivatives. The repair receipt verifies
identical decoded pixels everywhere else. Approved originals remain unchanged.
The image prompts and source/output hashes are retained in `item-repairs.json`.

## Personal rendering and feedback

The existing parent-requested v9 local patch API engine, approved canonical Bar
portrait and existing key were reused. No engine model/quality/seam policy was
changed. The local wrapper imposes a $3 ceiling and retains purchased responses
before settling. Its underlying ledger reports a separate $5 default; that is
not the wrapper's spending permission. No reset or discarded paid purchase.

Each shipping crop was reviewed at native size for face/hair, age-five proportions,
whole body/occluders, support, neighboring people and joins. Parent feedback
rejected Paris 1's likeness, Paris 2's orphaned dress and Antarctica 1's black hair
and generic facial features. Those exact sources are blocked from publication.
The Paris 2 edit envelope originally covered only the upper body: it was enlarged
to remove the entire original bystander's clothing. Additional visually broken
neighbor joins were rejected even when the technical boundary check passed.
Marrakech 3 received one explicitly scoped fourth attempt within the unchanged
local ceiling; no automatic continuation beyond that attempt is enabled.

Paris 3's initially retained purchase hit a local composition-margin exception.
Its raw response was inspected and recomposed with the existing bounded compositor,
without another API call; raw diagnosis and revised local envelope are recorded.
Antarctica's analogous first result remained rejected and was replaced by a new
paid attempt. No technical refusal is relabeled as a passing image.

Eight family-tested patches are reused byte-for-byte. Amazon's middle crouching
patch is the separately reviewed larger attempt retained before the expansion
pause. Eighteen new density patches complete the 27-image set. The private final
review pins images, technical receipts, original input files, avatar and measured
child click/face geometry. It is assistant visual acceptance, **not parent
confirmation of unmistakable likeness**. Parent likeness confirmation is pending.

## Assembly and safety

`scripts/adventure-density-game.ts --verify-reviewed` creates only
`game_adventure_bar_density_verify_v3`. After verification, `--reviewed` creates
the separate fresh `game_adventure_bar_density_nine_v3`. Repeated runs return the
existing game and never reset it. All personal assets use GAME visibility and
signed asset URLs. No child images are copied into public scenes or source control.

Set DATABASE_URL to the absolute file URL for `storage/adventure-three-local.sqlite`,
APP_URL to `http://localhost:3017`, STORAGE_PROVIDER to `local`, GENERATION_PROVIDER
to `mock`, and ANALYTICS_PROVIDER to `none`. Assembly must use the running local
server's signing environment, **not** the root API-key env file. A read-only check
against the existing family link now rejects a signing mismatch before writes.
The initial new verification link was created with the wrong signing environment;
only that newly created verification link's signature was corrected. The existing
family link/server secret was not rotated. No API key is needed for assembly.

The old expansion pause file intentionally remains to block stale v1 rendering.
Current permission is source-hash-pinned in `density-v3/approval.json`.

## Verification

Type-check passed. Full suite: 220 files, 3183 passed, 2 expected failures,
35 skipped, Vitest 4.1.11. Subsequently the nine focused density tests passed,
including rejection of parent-refused imagery despite technical acceptance,
unknown charges, wrong click geometry and technical seam refusals. Both content
validators passed; existing catalog scale warnings remain unchanged.

Live headless browser verification completed all nine boards through actual UI
clicks with the built-in hints: 27 child finds and 54 discoveries. Every board
finished with exactly 3 finds and 6 discoveries, and no remaining visible child
sprite. Amazon was played at 390×844; the remaining boards were played at desktop
size. This checks interaction and progression, not children's unaided difficulty.
After refreshing, the guest album retained 27 finds and 54 unique discoveries.
The bag rendered all nine personal postcards and 54 collected cards, with no
broken image elements. Mobile album crops were visually inspected.

This mobile check caught an existing invisible celebration-ring overflow: its
2.6× final animation frame was retained after fading out. The ring now uses
backwards fill only, releasing the final transform. The phone's document width
then equaled its 375px client width (390px viewport minus desktop scroll bar).
No board, hit region or saved progress was changed by this CSS fix. A style
regression test locks the behavior. Final type-check and five targeted files
(33 tests: density gates, stars and album) passed, as did `git diff --check`.

The separate fresh handoff game is `game_adventure_bar_density_nine_v3`.
Its local player link is in ignored `storage/adventure-density-preflight/bar-game.json`.
Verification progress belongs only to `game_adventure_bar_density_verify_v3`.
The personal-render ledger settled 29 new purchases at $0.640486, with no reserved
or unknown charges. This excludes earlier family/Amazon renders and base/item art.

No production build or deployment is claimed; the active family-play dev server
was not stopped for a build. Parent confirmation of the repaired likeness remains
pending. The three repaired crops are shown together in ignored
`storage/adventure-density-preflight/parent-corrections.png`.
