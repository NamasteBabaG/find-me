# Placement recovery — report for Codex QA (2026-09-07)

Claude implemented; Codex reviews. Scope: the first world (newyork, amazon, paris, marrakech, giza,
tokyo, greatwall, sydney, antarctica — 27 hiding spots). This report covers the method and its proof on
four spots. The 27-spot run and the QA game are **not started** (see "Not verified").

## 1. Diagnosis

The regression had two parts.

1. **The sprite-paste pivot** (`grounded-sprite.ts`, removed). A child rendered in isolation and pasted
   at the slot has no context: no bench to peek over, no water to sit in, no light of the board. The
   "giant head on the bench" is that. In-context inpainting (`editSlotCrop`, one crop + mask + sheet) is
   the right architecture and was never the problem: the four proof renders below are all good.
2. **The colour difference stopped isolating the child.** The re-planned slots ask for a mask the size of
   the whole child on dense refreshed art, and gpt-image-2 re-synthesises the whole masked window.
   "What changed" is the window. Measured on the four paid renders with `scripts/threshold-sweep.ts`
   (free, no calls):

   | threshold | amazon/canoe | marrakech/carpets | newyork/bench | newyork/taxi |
   |---|---|---|---|---|
   | 28 (default) | 331×449 blob (child 192 wide) | 341×497 | 206×293 | 512×523 |
   | 56 | 227×232 | 310×466 | 187×251 | 356×441 |
   | 72 | in pieces (81%) | 295×333 | in pieces (88%) | 347×375 |
   | 96–160 | scattered / nothing | scattered / strip | scattered / nothing | scattered |

   No threshold separates the child from the window; above 72 the child breaks before the ground lets go.
   Raising the threshold is not a fix (the brief was right about that).

## 2. The method now

`extractChild` (`src/services/generation/extract.ts`) is the one place that cuts the child out, and both
the pipeline (`slot-patches.ts`) and the harness (`v4-sample.ts`) call it:

1. The colour difference runs first, free: a render that changed nothing is rejected without pass two.
2. **Pass two — the model mattes its own render.** `AvatarProvider.matteSlotCrop()` sends the render and
   the crop it was made from (two images, no mask) and asks for the render back *with the same framing*
   and everything that is not the child painted flat magenta, occluders included ("an object between the
   viewer and the child is not the child"). `keyMagenta` turns the magenta into alpha: the key colour is
   measured from the frame's border (the model painted (248,10,223) on one render and (245,8,240) on
   another; a fixed tolerance around #FF00FF read the first as "no key"), opacity is the pixel's distance
   from that key along the magenta axis, a pixel two or more inside the half-opaque silhouette is the body
   whatever its colour (a pink shirt stays pink), the rim takes the nearest body colour at the measured
   opacity, and a speck of key the model left between hair strands is rim, not body.
3. `matteToPatch` only guards the answer (pixels outside the search area around the slot, specks, far
   pieces) and hands it to the same `finishPatch` as the difference, so the tap contract (`rect`,
   `hitRect`, `anchor`) is measured identically whichever made the alpha.
4. The shape rules read the alpha's basis. A matte is a silhouette, not a blob: a standing child with
   her arms at her sides is 0.35 wide/tall (taxi: 78×226 px) — the blob floor (0.38 of the asked width)
   called that "a strip". Height is held to what the prompt asked for: a swimmer from the waterline up
   (≈0.5), a peek at most two thirds of the 1.5× mask it is asked at (amazon: 101 of 256 px; bench: 69 of
   166 px). Nothing else in `childProblem` changed.
5. The contextual judge is unchanged (gpt-4o-2024-11-20, then gpt-5.6-sol HIGH on a pass).

## 3. What was tried and discarded, with evidence

| Approach | Result | Evidence |
|---|---|---|
| Sprite paste (Codex) | no context; rejected by Guy | `work/…/chroma-pilot` |
| Higher / adaptive difference threshold | no threshold isolates the child | table above, `proof-1/sweep/` |
| API `background: "transparent"` for pass two | the request becomes a sticker: the child comes back re-composed, ~3× larger, centred — 4/4 | `proof-1/noa/*/matte-transparent/`, `compare/*-matte-transparent.png` (9.3¢) |
| `input_fidelity: high` | refused by gpt-image-2 ("does not support the parameter"); no charge | first run log |
| Magenta key, fixed #FF00FF tolerance | one render's key (248,10,223) read as "no key"; rims kept a pink cast | `matte/` vs `matte-1/` |
| Magenta key with measured key + distance ramp | fringes on dark hair (a half blend of key and dark hair is far from the key) | `matte-1/`, judge: "neon-magenta cutout fringes" |
| Magenta key, axis + nearest body rim + speck rule (shipped) | clean rims on 4/4; a few 1–3 px specks remain in flyaway hair (marrakech) | `final/`, `compare/zoom-*-matte-6.png` |
| Occluder wording | without it the model kept the bench back with the child | `bench/matte/` vs `bench/matte-2/` |

## 4. Results on the four proof spots (identity "noa", age 6, quality low)

Extraction: 0/4 usable before (every alpha was the window), **4/4 clean silhouettes after**, all passing the
shape rules, tap boxes on the child. Judged in context on the shipped code (`final/`):

| spot | pose | extraction | judge (fast → Sol) | why |
|---|---|---|---|---|
| marrakech/carpets | seated | ok | **ok → ok** (6/6) | — |
| newyork/bench | peeking | ok | ok → bad | style: the insert is smoother/glossier than the board's coarse texture (pass-one render, small head) |
| newyork/taxi | standing | ok | bad | age: reads older than 6 (pass-one render) |
| amazon/canoe | swimming | ok | bad | identity: short straight hair, different face (pass-one render) |

All three rejections are about the **render** (pass one), not the cut: they are what the retry loop with
repair instructions exists for. First-roll acceptance 1/4 is the number to watch — at that rate a spot
costs ~4 rolls. See §6.

Images (same crop and zoom): `work/placement/proof-1/compare/` — `*-final.png` (render | difference
alpha before | matte alpha after | patch on the original crop) and `zoom-*-matte-6.png` (render vs matte
at 3–4×). `work/` is git-ignored: real children.

## 5. Every paid call of the round (request ids in the manifests)

Model gpt-image-2, quality low, 1024². Prices: text in $5/M, image in $8/M, image out $30/M.

| call | tokens (text in / image in / out) | cents |
|---|---|---|
| pass one (roll), per spot | ~800 / 2048 / 196 | 2.61–2.64 |
| pass two (matte), per spot | ~230 / 2048 / 196 | 2.34 |
| judge fast (gpt-4o) | — | 0.67–0.70 |
| judge Sol HIGH (only after a fast pass) | — | 2.0–2.4 |

Round total on `work/placement/proof-1`: renders 10.5¢ (4), transparent mode 9.3¢, magenta pass two
15.3¢ (4 mattes + 2 judges), bench pass two again 2.4¢, re-keys 0¢, judges over the iterations ≈ 22¢,
second opinions 4.5¢ → **≈ 64¢**, 0 unknown charges. Every manifest carries the request ids
(`manifest.json`, `matte-manifest*.json`, `*/result.json`).

Per spot in production at low: roll 2.6 + matte 2.3 + judge 0.7 (+2.3 on a pass) ≈ 5.6–7.9¢ per attempt.

## 6. Is this the best we have? Honest assessment

- **Architecture.** In-context inpainting + the model's own matte is the right shape: the child is
  painted where she is, with the board's light, behind the board's objects, and the cut is the model's
  own reading of what it painted. It costs one extra image call per attempt (+2.3¢ at low).
- **Cheaper cuts were looked at and are not ready.** A local segmentation model (SAM with a point
  prompt) would cost nothing per call but needs an ONNX runtime and a 100–400 MB model where the jobs
  run (Vercel functions); a hosted segmentation API is a new provider and credentials. Both are viable
  later behind the same `matteSlotCrop` interface; neither was worth blocking on.
- **The painter.** gpt-image-2 is the only model we have with in-context editing from a reference sheet
  at this quality. The proof used `low`; the judged rejections (age, identity, gloss) are render
  quality, and `medium` (≈5.3¢ out + inputs ≈ 7¢/call) may raise first-roll acceptance — **not tested
  in this round** and the single most useful next experiment (27 spots × 2 qualities × 1 identity).
- **The judge.** The fast tier's "bad" is final (never escalated). On bench the two tiers disagreed
  on *why* (fast: placement/anatomy; Sol: style) while agreeing on "bad"; on amazon Sol confirmed the
  identity failure. No false negative was demonstrated, but the reasons are not stable across tiers.
  Cost of Sol-only judging: +1.7¢ per verdict.
- **Residual defects.** 1–3 px magenta specks can remain in flyaway hair strands (marrakech); sub-pixel
  at board scale, passed both judges. A purple garment would key partly at its rim (the prompt forbids
  purple on the child).

## 7. Changes (uncommitted at the time of writing; see the final message for the commit)

- `src/infra/generation/types.ts` — `SlotMatteRequest/Response`, `matteSlotCrop?`.
- `src/infra/generation/openai.ts` — `matteSlotCrop`, `prepareSlotMatte`, `mattePrompt`, `keyMagenta`,
  `fitMatte`, `MATTE_WIRE_VERSION`; `call()` takes `background/output_format/input_fidelity`; a refused
  `input_fidelity` is retried without it and does not count as a try.
- `src/services/generation/patch.ts` — `matteToPatch`, `finishPatch` (shared tail), `MATTE_VERSION`,
  `matteHint`, `visibleFraction`, `PatchResult.basis`, `shape.visible`; basis-aware strip rule,
  pose-aware height rule.
- `src/services/generation/extract.ts` — `extractChild` (new, the one truth).
- `src/services/generation/slot-patches.ts` — uses `extractChild`; matte charged, checkpointed, kept as
  `PATCH_EVIDENCE`; ledger fields `extraction`, `matteCents`, `matteRequestId`, `matteEvidenceAssetId`.
- `scripts/v4-sample.ts` — uses `extractChild`; reserves two image calls per cell; writes `matte.png`,
  `matte-1024.png`, `cell.matte`.
- `scripts/matte-proof.ts` (new) — pass two on paid renders; `--rekey`/`--from` re-key for free;
  `--into` buys again beside an earlier answer. `scripts/threshold-sweep.ts` (new).
- `scripts/install-fixed-plans.ts` (new) + `content/scenes/*/scene.json` ×9 (v3: 27 placements) +
  `content/scenes/releases/pre-placement-20260907.json` (v2 archived; `sceneBySlug(slug, 2)` still works).
- Tests: `matte.test.ts` (7), `matte-wire.test.ts` (7), `alpha-dust.test.ts` (2); `scene-versions`,
  `hero-art` (manifest regenerated), `slot-wire-inputs` updated; `vitest.config.ts` testTimeout 20 s
  (the pipeline tests take 3–7 s each and crossed 5 s under load).
- Docs: `docs/SPRITE_PATCHES.md` (pass two section). Removed: `grounded-sprite.ts` + test.

## 8. Not verified

- The other 23 world-1 spots (renders exist for none of them under the new placements).
- B variants (untouched).
- The pipeline path end to end with a matte (unit-tested with fakes; no QA game yet; not deployed).
- `medium` quality; a second identity; the retry loop's repair instructions against these rejection reasons.
- Boards with pink/purple palettes (tokyo blossom) under the magenta key.
- `game-status.ts` still re-extracts rejected renders with the difference for its scale report.
