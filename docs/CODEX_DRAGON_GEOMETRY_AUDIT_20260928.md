# Dragon hide 2: offline preservation preflight — 2026-09-28

## Decision

**F-A remains OPEN. No render, purchase, game mutation, catalogue change or QA
deployment.** The existing hide has two distinct problems: incomplete context
for the block arch, and composition permission overlapping a prop that the
placement prose promises to preserve. Merely moving/widening the mask is not a
complete correction. No corrected placement is approved by this report.

This is a follow-up to Claude's completed `CLAUDE_V12_SAMPLE_REVIEW_20260927.md`,
not a new Claude approval. No completed independent review of `0202f897` or
`76d2609d` was present at inspection. CI **36354354582** on `76d2609d` is green.
QA remains on **0202f897**, not this diagnostic work.

## Reproduction and evidence

Viewed the public source board and retained hide-2 native before/after panel.
The source has one large arch, mostly left of the crop, and a small loose block
under the child's hand. The delivered crop replaces the child's activity with
a new complete arch. The old structure to the left cannot be reconciled by a
fade. The face finish is still not an accepted board-style match.

Run, without credentials or a provider:

```powershell
npx tsx scripts/dragon-scene-preservation-audit.ts
```

The script accepts no overrides, writes no files and makes no network calls.
It checks the retained input/technical/output bindings before reporting. A zero
exit means the diagnostic ran against bound evidence, **not** that geometry is
clear: read `current.geometryClear` and the issues. It is not a deployment gate.

| Evidence | SHA-256 |
|---|---|
| Public source board | `aedb4f928db9c89d85fa84b13c50f4b67388901c8abd78e626496d1c0bdbadcd` |
| Retained sample inputs | `4fb6ebef510b822c01c465753259a11c53f577521bdb7d7dd09a30ca265a35a1` |
| Retained shipping crop | `70cfa50483401bacb7204571c2166671518bf3d18b1cf275b3a097239cf47823` |

Private source/evidence stays in its existing ignored storage directory. No
child image or identity record is added to Git or public assets.

## Important refinement to Claude's boundary explanation

All coordinates below are native board pixels, half-open rectangles:

| Region | Left, top | Width × height |
|---|---|---|
| Input/returned crop | 1262, 1300 | 512 × 768 |
| Provider edit mask | 1280, 1488 | 476 × 390 |
| Actual compositor return region | 1262, 1368 | 512 × 630 |
| Conservative manual arch + loose-block annotation | 990, 1510 | 420 × 400 |

`composeBoundedLocalPatch` adds a **120 px guard**, clipped to the crop, around
the declared mask before the bounded fade. The source is unchanged from
`6b38de99`. The hard left limit of the returned region is therefore **1262**,
not the mask's **1280**. Claude's observed severed/duplicated structure is real;
attributing the hard composition boundary to the provider mask alone is not
precise. Pixels outside the provider mask can change inside this guard.

The annotation is human-authored and conservative, including surrounding
scenery. It is **not a segmentation mask, automatic object detector or a
proposed editing permission**. In its intersection with the shipping crop,
59,141 of 59,200 pixels differ, max channel delta 245. These counts bind the
comparison; they do not measure semantic correctness or painting quality.

Keeping the present compositor extent AND this complete context annotation
needs a bounding width of **784 px**, larger than the current **512 px**.
Relocation alone cannot contain both. A hypothetical 820 px context window
passes context containment, but still fails prop protection because the return
region overlaps the arch. This is a geometry counterexample, **not a new
provider-size contract or a render-ready candidate**.

**Independent recheck correction (T-1, 28 September):** that hypothetical crop
must recompute mask + 120 px guard before clipping. Reusing the old clipped
box understated permission. `guardedEditBounds` now derives each candidate:
the 820 px crop permits `1160,1368,630,630`, and its required context is
`990,1368,800,630`. It still overlaps the protected arch and is NOT approved.
The current crop and all retained pixels are unchanged.

## Tooling added (opt-in only)

`scripts/lib/scene-preservation-preflight.ts` checks manually annotated regions
in board pixels. It distinguishes clipped context, missing context and editable
overlap with protected regions; reports whether relocation alone could fit the
required context; refuses invalid/out-of-bounds/duplicate annotations.

No production code imports it. It neither detects semantic objects from pixels
nor modifies images. A geometry pass always reports visual acceptance as
`not-assessed`. Rectangular annotations are conservative: overlapping a child's
hand may require a carefully reviewed polygon, not shrinking an annotation just
to obtain a pass.

## Next art-engine work, in order

1. Choose between retaining this interaction with wider CONTEXT and separately
   authored protected prop pixels, or moving the hide to a less entangled child.
   Do not expand edit permission over the whole arch merely to hide a seam.
2. If retaining it, define context size, child/hand silhouette, protected arch and
   toy regions, return guard and tap geometry as one new experimental contract.
   The second child interacting with the other end of the arch must stay intact.
3. Verify the proposed contract without purchasing first. Re-run geometry and
   inspect the full board. No bounding-box pass can prove hand/prop occlusion.
4. Only a separately bounded, authorized real-runner sample with native/context
   review can establish scene preservation. Face-style F-A remains a separate
   acceptance gate; this work does not solve smooth faces.

## Verification / handoff to Claude

- Offline bound-evidence audit reproduced both failure classes with no writes.
- Targeted preflight suite: **16/16 passed**. `git diff --check` passed.
- Full `npm run check -- --maxWorkers=2` passed: **276 files, 3,523 tests**,
  two expected failures, 35 skipped, exit 0, 661.17 seconds.
  Log: `tmp/scene-preservation-check-20260928.log`. The first invocation caught
  strict indexed-access typing errors in the new tooling/tests; those were
  corrected before this full rerun. No failed tests were relaxed.
- No build/deploy needed: only offline tooling, tests and documentation changed.

Claude: independently check the 120 px return guard against the stored shipping
crop, challenge the manual annotation on the public source, and demonstrate why
wider context without protected composition still fails. Run the new tests and
confirm no runtime import or public/private asset mutation. Do not render, alter
the old verdicts, approve the art or infer that this activates either world.
