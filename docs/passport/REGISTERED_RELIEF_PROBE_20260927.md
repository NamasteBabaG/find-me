# Registered luminance relief — bounded offline follow-up

## Decision

**F-A remains open. No candidate is accepted or connected to the engine.**
Claude's hypothesis about misregistration has quantitative support in this one
case, but the result is not the approved painterly finish. Do not extrapolate
from this hand-authored mask to other children or 54 appearances. A failed
single sample also does not scientifically disprove every residual-transfer
method or establish that a different provider is necessary.

## Executed

`npx tsx scripts/probe-registered-skin-relief.ts`, a fixed offline dragon-3
experiment. Zero provider calls, zero dollars, no ledger/DB access. Inputs are
the original and already-paid whole-head candidate from the previous round;
the old inputs, receipts and private evidence are unchanged.

New private evidence:
`storage/bar-paint-refinement-20260927/engine-pilot/registered-relief-v1/`.
The script verifies original/candidate/head-alpha hashes against existing
receipts, records source-code and mask hashes, and refuses to overwrite
different evidence. No private images are committed or published.

One connected authored skin mask, with protected feature holes; inward
five-pixel feather. Both arms use sigma 3 luminance residual clamped to ±18.
The only A/B difference is candidate registration. Original chroma is retained
using a single gamut-bounded RGB offset, not independent channel clipping.
This preserves YCbCr chroma, **not a claim that HSV hue or the low-frequency
illumination field is byte-exact**. The latter is measured below.

| Metric | Without alignment | With alignment |
|---|---:|---:|
| Boundary delta-gradient energy | 4.500 | 2.905 |
| Original-face gradient in same band | 6.577 | 6.577 |
| Mean low-frequency luminance change | 2.380 | 1.117 |
| Max RGB chroma-difference change | 0 | 0 |
| Protected pixels changed | 0 | 0 |
| Pixels changed | 3,462 | 3,179 |

Alignment: candidate warped onto original, dx −2.5 px, dy +5 px, scale 1.035,
gradient correlation 0.374. Sign convention is the inverse sampling transform
in the source code; do not compare signs directly to Claude's separate probe.
No landmark detector is involved, and the modest correlation is not a
certificate of anatomical registration.

The boundary metric improves by 35.4%. Both arms, however, fall below the
original-face energy, so that threshold alone cannot be an acceptance gate.
The comparison was viewed at 3×: original / unregistered / registered / paid
candidate. Registration reduces streaking, but the resulting face remains too
smooth with local residual artifacts rather than coherent painted planes.
The original B candidate's pose/scale changes and the hide-2 arch defect are
untouched. No new paid follow-up was triggered from a numeric threshold.

## Verification and handoff

Two synthetic tests pass: recover a known translation; compare actual output
RGB outside the mask; preserve chroma; reject dimensions/window errors; retain
`requiresVisualReview`. TypeScript passes. These are algorithm checks, not art
acceptance. The implementation lives in `scripts/lib`, with no runtime import.

Claude: recompute the evidence, independently compare the same four columns,
challenge the mask holes and the registration confidence. Determine whether
there is any genuine improvement toward the approved paint at native board
scale, not merely a smaller metric. Do not purchase, activate or substitute
these artifacts. This experiment does not repair the original placement mask.
