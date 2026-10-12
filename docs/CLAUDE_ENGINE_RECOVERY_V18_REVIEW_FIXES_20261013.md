# Codex's v18 review: R1 and R2 corrected, 13 October 2026

This answers `docs/CODEX_V18_FOREGROUND_JOINS_REVIEW_20261012.md` (decision HOLD). It covers both P1 findings, the reruns of Codex's own reproductions, and the checks.

- **Spend and systems:** no provider call, no spend, no deployment, no live database and no flag change.
- **The paid v18 run was not started.** Its $1.50 cap is not authorized. `run-v18.ps1`, `--spend`, the original ledgers, run locks and provider credentials were not touched.
- **Codex's evidence was only read.** Its reproductions were copied into my private folder and run there; the originals are unchanged.
- **Branch:** `claude/engine-recovery-20261012`, not pushed.

| Item | Where |
| --- | --- |
| R1, product code and tests | `451e19cc` |
| R2, private runner (git-ignored) | `work/private-v16-controlled-render-20261012/v18-run.ts`, `selftest-v18.ts` |
| This document, the manifest's gate wording, a correction note in the v18 handoff | the commit that adds this file |

## R1: the outline and a recovery plan's protected child

### The defect, as Codex found it

The outline was checked against the authored envelope only. A recovery plan replaces that envelope with its own `protectedCore` and `faceRect`, and nothing checked those. On Codex's schema-valid plan:
- the restored sign covered 710 of the face's 1,225 pixels;
- the painter was still bought;
- the repair join reported `protectedChangedPixels: 0`, which was a literal, not a count.

### The rule

One pure rule in the domain, `localPatchForegroundPlanConflict` (`src/domain/scene/local-patch-foreground.ts`):
- no coverage at all inside `faceRect`;
- no coverage inside `protectedCore` grown by 12 px. That is the join's own guard (`LOCAL_PATCH_FOREGROUND_CLEARANCE_PX`, tested equal to the audit's `protectedGuardPx`).

Otherwise it returns a reason that names the object, the two counts and the object's bounds. For Codex's plan it is 430 characters (450 with its prefix), inside the 1,200 kept for the next diagnosis.

**Natural hiding, criterion 3.** The outline may still cover any paid pixel *outside* the protected child and its guard. That is where the feet and lower body stand behind the sign. That overlap is recorded, as before, in the `foreground` record (`restoredPixels`, bound to the image).

I did not add a "permitted protected overlap". A protected pixel is the paid painting's or the plan is refused. So a plan for this hide ends its protected child at least 12 px above the sign. The strip of painting between them is still shipped; it is only unprotected.

**Why this choice.** It keeps every existing meaning literal:
- protected pixels equal paid pixels;
- the tap target (`hitRect` = the plan's core) never includes the sign;
- publication's `protectedChangedPixels === 0` means what it says;
- it matches the normal path, where the outline never touches the authored envelope.

A permitted lower-body overlap would have needed a second audit field and a new publication rule. The cost of my choice: a plan whose protected child reaches the sign is refused.

### Where it is enforced

| Place | Before | Now |
| --- | --- | --- |
| Diagnosis question, v18 rows with an outline only | nothing about the sign | a `Fixed foreground DATA` paragraph: the object, its bounds and the 12 px clearance. Older rows ask byte for byte what they asked |
| Diagnosis answer | accepted | refused after the (already paid) diagnosis; the cycle is `rejected` with the reason, and the next cycle reads it as `Prior refusal DATA` |
| Applying phase: redraw, restyle and recompose-retained | painted or joined | refused before the inventory, the spend check, the painter and the join. Recorded in history so it is never repeated. The next slice opens a new cycle at diagnosis, with no exception loop |
| Painter purchase (`renderLocalPatchHide` with `selfRepair`) | reserved and dispatched | throws `LOCAL_PATCH_FOREGROUND` before any reservation (defensive) |
| Repair join (`recomputePaidPatchJoin`) | wrote the sign over the face; audit literal 0 | refuses the plan up front (defensive). The audit is now measured, and any nonzero count refuses the join: protected pixels against the retained painting before the outline, outside pixels against the board |
| Publication (`localPatchForegroundPublishable`) | checked the record only | also refuses a receipt whose recovery plan the outline would cut. This goes beyond the criteria: the join never makes one, so this only guards older receipts |

**Residual cost.** A plan refused at diagnosis has already cost its diagnosis. Repeated refusals have no cycle limit of their own: like every refused plan, they are bounded by the world's cap, after which the job parks as `local-patch:recovery-exhausted`. The question now names the object, so the first plan can avoid it.

**Retained recomposition** (`local-patch-recompose.ts`) recomposes normal attempts only, with the authored envelope, which the outline already clears. It is unchanged. Codex's integration test for it passes on the fixed tree with the same result: 10,925 restored, all 10,615 opaque pixels the board's, ledger unchanged, no extra painter call.

**v15–v17.** No outline applies, so no new check runs. Their diagnosis questions are unchanged, because the paragraph is added only where an outline applies. The historical diagnosis hashes for ages 3–10 pass, and the new v17 cycle test asserts the paragraph's absence. For every existing caller the measured counts are 0 by construction: at weight 255 the result is the paid pixel exactly, at weight 0 the board pixel exactly.

### Evidence

- **Codex's reproduction, rerun.** Copied to `work/private-v16-controlled-render-20261012/r1/repro-core-overlap-after.ts`, inputs unchanged. Result in `r1/core-overlap-after.json`:

  | | Before | After |
  | --- | ---: | ---: |
  | Repair join with the outline | face 710/1,225 overwritten, reported 0 | refused: "710 pixels of faceRect and 4467 pixels of protectedCore with its 12px guard" |
  | Painter purchase | 1 reservation, 1 dispatch | refused; 0 reservations, 0 dispatches |
  | The same join without the outline (v15–v17) | composes | composes, measured 0/0 |

- **Mutation, restore first.** With the join's up-front refusal disabled, the measured audit alone refuses Codex's plan: "the join changed 2478 protected pixels and 0 pixels outside returnWindow". That is Codex's 2,478. The file was restored and its SHA-256 verified (`r1/audit-mutation.sh`).

- **New tests: 10.**
  - Domain, 1 test: the pinned bounds; Codex's plan with its exact counts and reason; the guard (a protected child ending 12 px above the sign's top row passes, one row lower is refused); the authored envelope is clear; the sign covers where the feet stand.
  - Services, 6 tests:
    - Codex's plan is refused before any reservation or painting, while v17 buys and composes the same plan as before;
    - a clear plan paints once: face and protected child are the painter's, the sign hides the feet;
    - the join refuses the plan only with the outline, and the guard is the join's own 12 px;
    - the audit is recounted independently against the retained painting;
    - the diagnosis data;
    - publication refuses a crossing plan even with a bound record, and v17 has no such rule.
  - Real database, full self-repair cycles, 3 tests:
    - a crossing diagnosis returns to diagnosis with the reason and nothing is reserved; the next, clear plan paints once and ships the sign bound to its image;
    - a crossing plan already frozen in the applying phase is refused before any purchase, recorded, and followed by a new cycle;
    - a v17 row accepts, paints and joins the same crossing plan as before.

## R2: the qualification gate counts only a decided, self-consistent answer

### The rule

`qualifies` in the private `v18-run.ts` reads each retained answer with the located reader, never by matching words.

| Expectation | Counts only when |
| --- | --- |
| `reject` (B-a10) | All of these hold: the product's disposition is `retry`; the normalized `pictureWhole` or `severeSeam` is `fail` with its own nonempty located fault; the derived and the claimed verdict are both `fail`; and none of the reader's softenings is present (downgraded, contradicted, unclassified). A failed boundary that the reader turns into a located `pictureWhole` failure qualifies. A retry for uncertainty alone never does. |
| `pass` (the two controls) | `acceptable`, with the claimed verdict `pass` and nothing softened |
| `observe` (A-a10) | a readable answer the product decided (`acceptable` or `retry`), nothing softened. Its verdict still never gates. |

An unreadable or missing answer fails every expectation, the observed one included.

Each gate row now carries `why` and `joinFailures`, and the report is built from the same gate. A failed gate ends the run `gate-failed` with every answer and charge kept. A second launch replays the retained answers and buys nothing.

**Production is unchanged.** `localPatchQualityDisposition` still sends uncertainty to repair. The stronger condition lives only in the experiment.

### Evidence

- **Codex's three counterexamples, rerun.** Copied to `work/private-v16-controlled-render-20261012/codex-gate-repro-after.ts`, inputs unchanged; only the output folder and the final expectation differ. Result in `r2/gate-reproductions-after.json`:

  | Counterexample | Before | After |
  | --- | --- | --- |
  | B-a10 `pictureWhole: unsure`, no faults | gate passed; 3 paintings, 10 reviews, 1,016,000 µ$ synthetic | `gate-failed`; 0 paintings, 4 reviews, 440,000 µ$ kept. Why: "retry without a located pictureWhole or severeSeam fail (pictureWhole)" |
  | B-a10 `severeSeam: unsure`, no faults | same | same, for severeSeam |
  | A-a10 unreadable (observed) | gate passed | `gate-failed`; 0 paintings. Why: "unreadable" |

- **Self-test: 43/43 (was 32/32), 0 network calls, on the final files and manifest.** The new checks:
  - Codex's three cases, each with zero paintings, four answers and charges kept, and the report `gate-failed` with its reason;
  - a relaunch after a failed gate buys no review and paints nothing;
  - a rejection that claims `pass` beside its located failures;
  - a located fault on a check the answer passes (contradicted);
  - an unlocated rejection;
  - a rejection with one located and one unlocated failure;
  - a failed boundary read as a located `pictureWhole`, which qualifies and paints;
  - no retained answers at all;
  - the positive run's reasons.

  The located broken join and both good controls remain positive tests.

- **Mutation, restore first.** The reviewed rule was put back into `gateOf` (`r2/gate-mutation.sh`). Then 7 of the 43 checks fail:
  - Codex's three cases;
  - the relaunch;
  - the rejection that claims `pass`;
  - the contradicted rejection;
  - the missing-answers check.

  The two unlocated cases and the boundary case pass under both rules, because the product's disposition already decides them. The file was restored and its SHA-256 verified.

### Found while writing the regressions: pre-existing, not changed

`localPatchQualityDisposition` returns `unresolved` with `integration-review-unreadable` for a *readable* v12 answer that has one located and one unlocated failure.

- `readIntegratedNormalizedVerdict` re-parses the normalized fields. The downgraded `unsure` no longer re-derives its downgrade, so the comparison fails.
- Such an answer never publishes.
- Its fault label decides its route (`quality-unresolved: integration-review-unreadable`), and I have not checked whether that route re-asks a readable answer at a cost.

Codex may want to look.

## Private runner hashes (SHA-256)

| File | Before (reviewed) | Now |
| --- | --- | --- |
| `run-guard.ts` | `de249a64…` | unchanged |
| `v18-guard.ts` | `8d44038a…` | unchanged |
| `v18-run.ts` | `ed31264d…` | `919768994ed8ecc665ced33eeb60f590ac4d7566910148df4d835016decd98d3` |
| `run-v18.ts` | `49d7b424…` | unchanged |
| `run-v18.ps1` | `d7dcf97c…` | unchanged |
| `selftest-v18.ts` | `c66875ee…` | `eb50743bf85d03176579506e0c386cfc25170b107553f0ce0f06d7369c8f5aff` |

The manifest's gate sentence and A-a10's note now state the corrected gate. The guard pins neither text, and no launch has bound the manifest. Manifest SHA-256: `450b0edfac9a2dd568a75eb4988cf0d5ecd49c172b5190274a2d7ffd7f81e9cc` (was `012f510d…`).

## Checks

| Check | Tree | Result |
| --- | --- | --- |
| `tsc --noEmit` | `451e19cc` | exit 0 |
| `vitest run --maxWorkers=3`, all 377 files | `451e19cc` | 4,943 passed, 2 expected fail, 55 skipped, **0 failed**, exit 0 (1,156 s) |
| `npm run build` | `451e19cc` | exit 0: compiled, and the build's tracing and player-performance audits report no problems |
| The 17 affected files, before the commit | working tree | 285 passed, 20 skipped |
| Codex's recomposition test (`codex-v18-qa.test.ts`), from a temporary copy that is not committed | `451e19cc` | 1/1, the same result as Codex's |
| The five runner files (`r2/tsconfig.runner.json`) | final | exit 0 |

The 4,943 are last round's 4,930, plus the 3 that failed under load then and pass now, plus the 10 new tests. This is one complete local run with no failure. It is not CI on a pushed commit, which remains a release requirement.

## Open, and for Codex

- **Review.** R1 (the rule, its five call sites, and the measured audit) and R2 (`qualifies` and the self-test).
- **Readiness.** Per Codex's sequence, nothing changes here. After Codex closes R1 and R2:
  1. a separately authorized qualification ($1.50 cap);
  2. a real-photo case;
  3. release checks, push/CI on the exact commit, and QA deployment;
  4. then a fresh 27-hide QA game.
- **The models were not retrained.** These are instructions, composition, evidence, parsing and guards; their benefit must be measured on real outputs.
