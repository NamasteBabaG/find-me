# Real v12 dragon sample — 2026-09-27

## Decision

**F-A remains OPEN for visual quality / bulk rendering.** The missing real-provider
evidence now exists, but the released recipe does not consistently reproduce the
approved face finish or preserve the authored scene. No existing game was updated,
no QA deployment was made, and no bulk job was started.

Owner approved three dragon-cave appearances, one attempt each. Executed exactly
three image purchases and one grouped product-judge purchase. No retries, manual
retouching, extra identity generation, new credentials, or alternative transport.

## Exact boundary tested

Production `renderLocalPatchHide` → `purchaseOnce` → existing `buyLocalPatch`
transport → bounded composition, using the released v12 prompt unchanged.
This is **NOT a full `runLocalPatchHide` / checkout / scheduler test**: the dragon
board is authored pilot content, not the paid scene catalog. The approved pilot
identity was checked against its local source/review hashes, not passed off as a
new production identity receipt. This limitation must remain explicit.

- Code base: released `6b38de99d2681c30f01958a5aa3b1c5a81f63600`; working HEAD
  `585255a2` only added the earlier release receipt. Engine source diff from that
  release was empty before and after these purchases.
- Prompt: `local-patch-prompt/v12-board-paint-identity`, recipe `board-paint-v1`;
  `expectedPromptVersion` supplied at the renderer boundary.
- Content version 10, production **LOW** image quality, 768×1152 request,
  native returned shipping crop 512×768. We did not silently increase quality.
- Production `prepareLocalPatchIdentityReferences(sheet, 10)`: complete canonical
  portrait quadrant, not the historical pilot silhouette-normalized reference.
- Exactly the three authored base-board masks / placements, without repair overrides.
- The approved two-stage reference was opened and compared, **not sent as input**.
- Isolated local SQLite purchase ledger and private artifacts under
  `storage/bar-dragon-board-paint-v12-sample-20260927/`.

`inputs.json` pins identity, art, policy and engine-file hashes. Each
`*-request.json` records the actual prompt and reference/mask hashes before the
existing transport runs. Each technical record binds the shipping bytes to those
inputs. The paid response and charge evidence are retained in `purchases.sqlite`.

## Visual findings — native crop AND individual full-board context inspected

| Hide | Useful result | Why it is not approved for broad use |
| --- | --- | --- |
| 1 — brushing | Recognisable canonical child, coherent kneeling, locally lit purple clothes | A new curled green baby dragon appears beneath the hands; source floor/brush interaction is replaced. Face has some volume but is smoother than the approved painterly example. |
| 2 — blocks | Recognisable face, supported knees, blue scene palette | Builds a new arch within the crop while the original arch remains to the left in full-board context. Pose/props changed; face remains comparatively smooth and looks toward the viewer. |
| 3 — scales/stool | Both feet are on the floor beside the stool; no obvious foot/stool intersection in this sample | Source orange shirt/apron becomes a yellow tunic. The face is still smoother than the approved reference and the surrounding painted faces. Grounding improvement is not proof of style consistency. |

These are visual observations, not a claim that a texture metric or biometric test
was run. Identity was compared to the approved illustrated portrait, not rejudged
against the original photograph. Three samples from one board cannot establish
two-world reliability.

## Judge disagreement

The actual grouped product judge (`gpt-5.6-luna`) returned **acceptable for 3/3**,
including `styleMatch: pass`, `faceLikeness: pass`, `scaleRight: pass` and
`groundContact: pass`. Its raw response is retained unchanged.

The current review contract focuses on identity, age, visible integrity and severe
seams; style is advisory and complete bystander replacement is permitted. There
is no dedicated strict preservation-of-props/outfit check. Consequently its pass
is not evidence that the owner's art-direction target or exact prop preservation
was achieved. Do not relabel these stored machine verdicts as failures; retain a
separate human/art-direction rejection.

## Costs / scope

| Purchase | Ledger estimate, USD |
| --- | ---: |
| Hide 1 | 0.024104 |
| Hide 2 | 0.024114 |
| Hide 3 | 0.024084 |
| One grouped judge | 0.003227 |
| **Total** | **0.075529** |

These are usage/rate-card **conservative estimates, not provider invoice totals**.
Canonical identity and board art were reused and their earlier cost is excluded.
There are no held, pending, unknown, overrun or conflicting requests.

The sample has an additional $0.60 reservation ceiling enforced by its repository
wrapper. The generic `budget.json` audit still reports the product's default $5
world ceiling; it is NOT the sample authorization. `inputs.json` and
`evidence.json` record the stricter effective sample ceiling. The fixed board and
attempt-1-only CLI guard is a separate scope restriction.

## Artifacts / reproduction without more spending

Private local directory: `storage/bar-dragon-board-paint-v12-sample-20260927/`.

- `approved-and-three-native-crops.png`: left to right approved reference reduced
  to shipping resolution, then v12 hides 1, 2, 3 at native resolution.
- `magic-dragoncave-refresh-v3-N-attempt-1-before-after.png`: source left, exact
  delivered crop right, each 512×768; N = 1, 2, 3.
- `*-full-board.png`: three **separate serial** 3840×2160 boards, never a collage
  of simultaneous targets. `*-board-preview.webp` is a viewing derivative.
- `*-raw.png`, `*.png`, `*-request.json`, technical JSON, grouped-review JSON,
  `inputs.json`, `evidence.json`, `budget.json`, `purchases.sqlite`.
- Offline export only: `npx tsx scripts/board-paint-sample-evidence.ts`.

Do not publish these private child artifacts into `public/`, Git, or static QA
assets. No identity/photo/key bytes belong in this report.

## Next bounded change proposal / brief for Claude

1. Independently inspect the actual evidence above, especially the duplicated
   arch in hide 2's full board, and challenge the visual assessment.
2. Keep v12 immutable for all retained purchases. A corrected recipe must use a
   **new version**, not silently change a purchased prompt or reuse a paid key.
3. Tighten replacement to the existing person's silhouette / pose, preserve the
   original outfit and props, and separate facial identity geometry from painted
   material treatment. Consider a separately fingerprinted finishing pass because
   the approved example required two steps. This is a proposal, not implemented.
4. Treat the smooth canonical portrait dominating the finish and the LOW policy
   as **hypotheses**, not proven causes. Compare one controlled variable at a time;
   do not buy a large rerender or assume higher quality alone fixes it.
5. Add evidence-bound scene/prop preservation and board-face finish review before
   declaring the sample visually accepted. Keep customer creation UX separate from
   this development gate; do not add a parent-approval interruption.
6. Any further paid comparison requires a new bounded approval. Existing 54 hides,
   QA games, catalog activation, and released UI remain untouched.

## Verification

- New sample-scope guard: 10/10 tests passed; retries, other boards, unknown hides,
  missing render target and publish mode refused.
- TypeScript passed before purchases.
- `npm run check`: TypeScript passed, 268 suites passed; 3,468 passed,
  2 expected failures, 35 skipped. Full local log in the private evidence folder.
- `git diff --check` passed. Released engine source diff remained empty.
