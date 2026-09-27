# Dragon hide 3 — bounded A/B/C comparison, 27 September 2026

## Decision

**B (experimental v13, LOW) is the useful preservation candidate, not a bulk-release approval.**
It retains the orange shirt, brown apron, blue trousers, boots and one original
scale dial. Its face is still smoother and more portrait-like than the approved
paint reference. A changes outfit/removes boots; C changes head angle/hair despite
being a surface-only request. **F-A remains open.** No QA/game assets were replaced.

Executed the owner's approved **three image purchases + one QA purchase**, exactly
once per fixed key. No retry, new identity, alternate image service, deployment,
catalog activation or changes to the original evidence. No work on hide 2 was
included in these purchases; its cut-arch authoring defect remains open.

## Experiment definition and limitations

| Arm | Input | Change | Boundary |
| --- | --- | --- | --- |
| A `a-medium` | Original hide-3 crop + same canonical portrait + same rectangular mask | Exact recorded v12 prompt and policy except quality LOW → MEDIUM | Existing provider and bounded compositor |
| B `b-v13-low` | Same original crop, portrait, mask and LOW policy | Frozen v12 prefix plus versioned experimental preservation/face-paint clauses | Existing provider and bounded compositor |
| C `c-finish-low` | Delivered v12 LOW hide-3 crop | Head-only finishing pass, LOW; original scene crop as style-only second image | Existing provider; experimental head-mask composition restores all outside pixels from its input |

This is a **harness experiment**, not a new recipe enabled in `runLocalPatchHide`.
`buyLocalPatch` and `purchaseOnce` are reused unchanged; no SDK/HTTP image transport
was reimplemented. A's prompt is recomputed from the released engine and compared
character-for-character with the prior paid request before dispatch. Frozen v12
runtime files are unchanged. B is named `experimental/v13-source-preservation-1`,
not falsely recorded as a shipped v13 engine result.

C adapts the exact approved edit wording preserved in
`docs/passport/BAR_STYLE_AND_COMPLETION_20260924.md`: its actual target is yellow,
not orange; its second image is the original local crop, not the old wide board;
and the editable region is the existing head only. These adaptations are explicit.
C receives no separate canonical portrait: its existing target defines identity,
and Image 2 is labeled style-only. Whether that role separation is sufficient is
what the failed output calls into question; it does not prove a universal cause.

The three arms are alternative procedures, not a factorial statistical study.
There is one unseeded sample per arm. B changes a group of wording constraints;
C changes input, reference roles, mask, prompt and composition as part of a second
stage. Do not claim that this proves LOW quality or single-pass generation is the
root cause. No result authorizes all 18 boards.

## Visual inspection

Inspected each native 512×768 crop, approved 1024×1536 reference, previous LOW
baseline, and each separate full-board viewing derivative. No simultaneous-target
collage was substituted for serial board context.

### A — MEDIUM alone is not the solution

The child remains recognisable. Some facial mottling appears, but this is not a
reliable match for the approved directional warm/cool painted marks. Orange apron
clothing becomes a green vest/yellow shirt/brown trousers and the boots disappear:
the child is barefoot. One original left scale dial remains, without the previous
extra right dial. Outfit and working-pose fidelity are not preserved.

### B — better scene preservation, face finish still unresolved

Orange shirt, brown apron, blue trousers and boots remain. No extra scale dial or
new animal is visible. Ground contact is coherent. However the original two-hand
working pose changes: one hand touches the dragon while the other hangs down.
The face looks toward the viewer and retains comparatively smooth orange areas
and rounded highlights rather than the approved broken warm/cool paint handling.
Do not label exact pose/silhouette preservation as proven merely because clothing
and props improved. The automated judge is more positive about the finish than
this visual assessment; art-direction approval remains with the owner.

### C — reject as a finishing recipe

The formerly three-quarter, two-eyes-visible face turns to a side profile. Hair
changes from large grouped brown curls to a smaller, shorter-looking pattern.
That violates the explicit geometry/expression/hair lock. The wrong yellow outfit
and extra right dial are inherited from its v12 input, not repaired by this pass.

The deterministic composition check finds **0 changed pixels outside the head
mask** (16,337 changed pixels inside/antialiased boundary). This proves only
geographic edit containment, not identity, expression or pose preservation.
The original provider response is retained alongside the composed output so this
guard cannot conceal provider behavior from subsequent review.

## Automated review: useful checks and an explicit false claim

One custom, evidence-labeled review through the existing `requestJudgeWire`
transport (`gpt-5.6-luna`, LOW effort) compared SOURCE, BASELINE, APPROVED, PORTRAIT
and each candidate's native/full context. This was an **experimental review
contract**, not the unchanged production acceptance policy.

- It recommended B and marked its checks pass.
- It correctly rejected A's source outfit and C's inherited outfit/prop defects.
- It marked C's identity/input preservation pass and claimed that its side profile
  was inherited from BASELINE. **The supplied baseline visibly faces three-quarter
  toward the viewer. This claim is false.** Its identity and preservation pass are
  not reliable evidence for this arm. Raw response is retained unchanged.
- It marked all three facial finishes pass. Human/art-direction inspection does
  not confirm that all three meet the user's approved finish.

Review prompts, evidence labels and image hashes are recorded in
`review-request.json`; raw response and usage remain in `review-raw.json` and in
the retained purchase store. No silent correction of machine verdicts.

## Accounting

| Purchase | Conservative usage/rate-card estimate, USD |
| --- | ---: |
| A | 0.053514 |
| B | 0.025464 |
| C, finishing pass only | 0.017184 |
| One comparative QA | 0.003534 |
| **This turn total** | **0.099696** |

Four settled purchases, no pending/unknown/conflicting requests. C's incremental
price excludes its previously paid v12 base ($0.024084): base + finish image cost
is $0.041268, excluding identity, original board art and QA. These are **estimates,
not provider invoices**. The repository wrapper enforces the additional $0.60
sample reservation ceiling and permits only the four named purchase keys; the
generic world audit also reports the unrelated default $5 world ceiling.

## Private artifacts and commands

All child imagery and the local ledger remain ignored, outside public assets:
`storage/bar-dragon-paint-comparison-20260927/`.

- `comparison.png`: left → right approved reference, v12 LOW baseline, A, B, C.
- `<arm>.png`: exact composed crop; `<arm>-raw.png`: normalized provider output;
  `<arm>-provider.png`: original provider-resolution response.
- `<arm>-full-board.png`: full serial board; `<arm>-board-preview.webp`: preview.
- `<arm>-input.png`, `-reference.png`, `-mask.png`; `inputs.json` records exact
  prompts, reference roles/hashes and policies. Each result JSON binds fingerprints
  and output hashes. `purchases.sqlite` retains billed responses.
- `finish-scope-check.json`, `budget.json`, review evidence/response, `check.log`.

Safe offline regeneration of the comparison and scope check:
`npx tsx scripts/board-paint-comparison.ts --export`.

CLI rejects unknown arms, extra attempt arguments, publishing and bulk mode.
No command to reset the keys/ledger or request another image is provided.

## Brief for independent Claude review / next decision

1. Verify four settled receipts, exact A prompt parity, B prefix/delta and C's
   declared reference/mask/composition differences. Confirm no runtime activation.
2. Inspect B against the approved finish at equal native scale, including pose
   and body size; do not conclude that matching clothes implies full preservation.
3. Challenge C's machine verdict against the actual baseline. Confirm the turned
   head/changed hair, and independently recompute outside-mask preservation.
4. Keep B as the preservation baseline for further work, **not as approved art**.
   A future finish experiment must keep an explicit canonical identity reference
   separate from a paint-only reference and lock head geometry. That experiment
   needs a new bounded approval; no extra calls were made in this turn.
5. Separately fix the hide-2 structure-crossing mask/crop before testing that hide.
   Expanding the rectangle alone is not proof of prop protection. Neither this
   defect nor the automatic judge's blind spots have been fixed here.

## Verification

- TypeScript passed before paid work; eight comparison-scope/recipe tests passed.
- Post-export TypeScript check passed.
- Full `npm run check` passed: 269 test files, 3,476 passing tests,
  2 expected failures and 35 skipped tests (3,513 total). Log retained privately
  as `storage/bar-dragon-paint-comparison-20260927/check.log`.
- `git diff --check` passed; the four runtime engine files remain unchanged
  against released commit `6b38de99`.
