# QA generation failure — 28 September 2026

## Read-only live observation

Following the wizard incident, the owner submitted a screenshot showing a
creation failure. Their already authenticated admin tab displayed a terminal
`GENERATION_FAILED` game and a completed job at `local-patch:quality-failed`.
During the initial browser inspection no retry, payment, mutation, download or
provider request was initiated. The subsequent investigation below read two
retained paid replies into private local diagnostic files, without a new
provider request or database write. This record deliberately omits customer identifiers,
original photos, signed asset URLs and contact details.

- 25 appearances have output; two of the expected 27 do not have a usable
  asset. No board-source availability failure was reported.
- `antarctica/hide-3`: three attempts, final reason
  `quality-retry: faceLikeness`. This is the automated judge's verdict,
  not an independent human judgment of the retained images.
- `giza/hide-2`: three attempts, final `quality-seam` refusal. The seam
  diagnostic reports best border alignment at shift `(-2,0)` and warns that
  blending the moved edge doubles it. This is not proof that a free two-pixel
  translation of the whole patch would safely repair the scene.
- No assembled game configuration or playable link was present.
- Payment record is `PAID` using **mock**, not evidence of a real card charge.
- Displayed creation ledger total was approximately USD 1.068549, explicitly
  including tariff estimates rather than a provider invoice.
- Some of the 25 output badges show conflicting or absent review summaries.
  Output count must not be presented as 25 visually accepted appearances.

## Code correspondence / safe next step

`local-patch-world.ts` refuses to assemble a nine-board game when required
appearances lack generated/approved rows. This explains the terminal result;
it does not diagnose whether the image judge or compositor refusal is correct.

Existing `local-patch-recompose.ts` is not a harmless read-only diagnostic:
it verifies retained purchases but then writes derived assets, variant state
and audit records. It requires an active `TARGETS_GENERATING` unpublished
game and an outdated composition version. The observed game is terminal;
do not force its state or invoke this as a generic free retry. The historic
paid-repair publication policy is explicitly scoped to scene version 8 and
cannot be assumed compatible with this new QA order.

Next: inspect the retained attempts in board context, identify exact scene,
recipe and composition versions, and bind any proposed repair to the original
purchase/evidence. Preserve the other 25 outputs and their ledger history.
No relaxing similarity/seam checks, partial forced release, new order or
unbounded re-render. Any additional paid image operation needs a separately
bounded authorized scope. The existing F-A gate remains open.

## Claude handoff

Treat this as a separate generation-quality incident from the wizard/RSC
failure. Challenge both final refusals against retained visual evidence, not
only the status text. Distinguish a false rejection from a genuinely invalid
candidate, and specify which recovery is supported by the actual scene version.
Do not modify the owner's game or purchase retries during the review.

## Retained-byte investigation and rejected free repair

Read-only QA metadata confirms both failed rows use scene version 10, recipe
`local-patch-prompt/v12-board-paint-identity`, and composition
`bounded-return/v3-head-safe-axis`. Inspected the first retained raw provider
reply for each failed hide through the existing private purchase envelope.
No credentials, original photograph, customer ID or private bytes belong in
this report or a commit. Private derivatives are under ignored `tmp/incident-*`.

### Antarctica: wrong placement followed by a real head truncation

The source crop is `(2531,806,512,768)`. Its authored target box is local
`(163,368,171,377)`, identifying the LOWER standing purple-coated child beside
a blue-coated child holding a tray. Another kneeling purple-coated child is
above it. The source box is not simply an accidental missing-head annotation.

The first raw provider reply relocates the supplied child upward, with her head
around local y=160, and removes the upper kneeling neighbour as well as the
intended target. It also alters nearby hands/props. The existing compositor
returns `(2574,1054,411,520)` in board coordinates, beginning at local y=248.
Thus it cuts the newly drawn head off and leaves old scene pixels above the
new torso. This was reproduced from retained bytes, not inferred from CSS.
Admin thumbnails additionally use `object-fit: cover`, but the missing head
is present in the full stored image too; fixing thumbnail fit does not fix it.

An offline widened-window hypothesis restores the head, but retains the
provider's deletion of the upper neighbour and the altered props. It was
**visually rejected**, even though the seam classifier returns usable=true
(mean 14.66, shift -1,0). No mask, recipe, asset, game state or gate was changed.
Do not raise the global guard or call this a free successful recovery.

Reproduction scripts: private `tmp/incident-preview.ts` and retained encoded
input. SHA256 of the normalized 512x768 diagnostic derivatives:

| File | SHA256 |
|---|---|
| incident-source.png | a413fbbd711bbe2ef9ceaf4633bfc614345f97119b04486e6528efad4a4d4ba5 |
| incident-raw.png | 33044bf8d54d682368b8feb2bad96479d4398e46640ee704693e1946345d954f |
| incident-current.png | 7a72ef8a7e9dbf526b6ca844a3ae0eba61150ae5b29050a1e7a219bb11b97032 |
| incident-preview.png (REJECTED) | d185f4f94665479fdb6a2c3bf839cabd8da3ec9980ac888c8ebf2facf7a5127d |

These are derived PNG hashes, not the original purchase-envelope fingerprint.
The replay used the public scene source, not a claim of byte-exact reconstruction
of every preceding hide on the live composed board.

### Giza: attractive portrait is not evidence of a safe join

First retained reply independently reproduces refusal: crop
`(1050,990,512,768)`, target `(180,210,180,300)`, return
`(1110,1080,420,540)`, mean 18.3817 and shift `(-2,0)`.
The person is complete in the raw reply, but its shoe reaches past the returned
window's bottom and meets old foliage at a straight edge in the refused
composite. Surrounding containers/foliage also change. This supports keeping
the refusal; it is not a reason to force-approve the portrait or just relax
the two-pixel threshold. No translation/asset replacement was performed.
Private reproduction: `tmp/incident-giza-preview.ts`.

| File | SHA256 |
|---|---|
| incident-giza-source.png | f1312f1fa6991cd3ccd5d3ca30434075b0894b1784a275a6a3d019a2478327bc |
| incident-giza-raw.png | dacf99c86e6dabac81f59dcc7562f9a0b305b40e30a284b67c58554fb61d6aea |
| incident-giza-current.png | 56831d1cc6026036c414d755f7b1ae43ed3f9dfa83e31d7531a3415180e79c30 |

### Recovery status / next acceptance

The failed game remains unchanged and unplayable. All existing outputs and
purchase records are preserved. No paid render/review, retry, forced approval,
status reset or publication was performed. The safe free widening hypothesis
did not succeed. The remaining repair must preserve the intended target position,
full head/feet, neighbouring figures and props in BOTH raw and shipping images;
the numeric seam score alone cannot certify this. A new bounded provider trial
and explicit versioned terminal-game repair path need review before purchase.
Do not reuse the old v8-only repair command on this v10 order.
