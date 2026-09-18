# Fairy forest v6 — fresh environment attempt

Status: review candidate only, NOT approved or deployed.

User authorized a fresh attempt after close inspection confirmed softened environmental forms in v5. One reference-based Images CLI call produced a new master; no subsequent generative retouch was performed.

## Source and output

- Prompt: `art/magic-fairyforest-v6-fresh-environment.prompt.txt`.
- References: early forest v3 for world/composition, user castle close-up for painted character volume. Softened v5 was not an input.
- Output: `output/imagegen/magic-fairyforest-v6-fresh-environment.png`.
- Verified size: 3840 × 2160, RGB PNG.
- SHA-256: `2608aa3bef3d6b1da646fd79064f714f3488210d81573a314636442373ebba02`.
- Native unscaled inspection crops: `output/imagegen/forest-inspect-v6-{ground,house,tree,faces}.png`.

## Visual review

**Later status:** replacement set subsequently authorized, authored and packaged, with local component browser verification complete. See `MAGIC_FAIRYFOREST_V6_HANDOFF_20260916.md`. Unmapped/unvalidated statements in this visual-review history are superseded only to that scope; no QA or personal-game acceptance is implied.

Whole frame and native ground, house and face crops inspected; v5 ground/house crops also reviewed for comparison. The new image has more discrete plant edges, stone/wood surface marks and architectural boundaries. It does not exhibit the same broad melted environmental patches as v5. However, fine texture is more prominent, the overall forest is darker/more muted than the desired bright direction, and several faces remain large-eyed/cartoon-like rather than fully matching the castle's natural facial volume. This is a candidate for user comparison, not an unconditional quality pass.

## Search items remain unvalidated

Prompt coordinates were not obeyed consistently. In particular, the spotted mug is near the left edge and the red spiral shell near the lower-right edge; they should not be accepted as runtime targets behind HUD merely because they exist. The blue brush is prominent/large. Six unique fair-difficulty targets and actual safe-area mappings have NOT been approved. No mapping from v5 may be reused against this changed master.

No paid retry, child placement, runtime catalog registration, QA deployment or changes to Claude's app work in this pass. Existing versions retained.

## Follow-up: six-item visual audit

User requested checking the candidate. Inspected full master and six native, unscaled target crops (`forest-v6-target-review-{mug,brush,sock,flute,shell,brooch}.png`). All six requested object categories are visibly present. No second matching instance of the exact target motifs was noticed in the full-frame visual scan; this is a visual observation, not an exhaustive automated uniqueness proof.

Original set assessment (approximate centers, not authored hitboxes):

| Object | Center x/y | Assessment |
| --- | --- | --- |
| White-dotted terracotta cup | 7% / 55% | Clear, but very far left; also has two handles. Reject for conservative interior target selection. |
| Blue paintbrush | 33% / 39% | Clear, prominent, interior. Suitable easy/Common candidate. |
| Striped sock | 83% / 47% | Clear but beyond requested interior zone. Reject from this set. |
| Squirrel's pan flute | 38% / 52% | Readable tubes/instrument despite partial hand occlusion. Good medium/Rare candidate. |
| Red spiral shell | 84% / 92% | Clear but lower-right corner risk, also conspicuously glossy. Reject from this set. |
| Basket dragonfly ornament | 44% / 63% | Readable and interior; too large/high contrast to justify Epic. Candidate Rare, subject to playtest. |

Inspected three additional native crops: `forest-v6-target-review-{berries,sail,buckle}.png`. Proposed replacement set WITHOUT changing the art:

- Common: blue paintbrush; bowl of red/purple berries held between troll and girl (~61%,55%); purple sail (~55%,68%, explicitly purple to distinguish orange sail).
- Rare: squirrel's pan flute; golden dragonfly on turtle basket.
- Epic: small silver buckle on purple fairy's brown shoulder bag (~56%,35%). The clasp is visible and distinct at native zoom, but its small size requires a generous accessible hitbox, a clear card crop and age-appropriate hint; never make difficulty depend on a tiny touch target.

Read `src/game/components/Collection.tsx` and collection/game CSS in the art worktree: toolbar occupies upper-left, mission upper-right, collection lower edge; selected discovery can cause docking/seek-card movement. Therefore edge position indicates risk, NOT proof of occlusion in every viewport. No live rendered HUD/touch test was performed. Candidate is not integrated, this art checkout may lag current app, and no runtime acceptance is claimed. All proposed alternatives are meaningfully interior; exact visible rectangles, hitboxes, overlap checks, card crops and current-app mobile/desktop verification remain for implementation after approval.

No rerender, application/source-art mutation, release or discovery mapping activation during this audit.
