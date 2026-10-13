# Quality reader v2: a located failure beside an unlocated one, 13 October 2026

This answers the separate reader issue in `docs/CODEX_V18_REVIEW_FIXES_RECHECK_20261013.md`, which Codex confirmed and asked to be handled "as a separate, version-aware reader correction before broad rollout".

- **Spend and systems:** no provider call, no spend, no deployment, no live database and no flag change.
- **Branch:** `claude/quality-reader-v2-20261013`, from `e6e214cd`, in its own worktree (`work/claude-quality-reader-20261013`). Not pushed.
- **The v18 experiment is untouched.** It stays on `e6e214cd`, the commit Codex reviewed. It reads with `quality-read/v1-located-600` as pinned, and its runner does not import the current reader. This branch is for review after it.

| Item | Commit |
| --- | --- |
| The reader, its call sites and tests | `b5af9c40` |
| This document | the commit that adds it |

## The issue, as Codex reproduced it

A readable Opus answer has two failures: `pictureWhole: fail` with a located fault, and `severeSeam: fail` with none.

1. The parser keeps the located failure. It records the unlocated one as `unsure`, with `downgraded: ["severeSeam"]`.
2. The disposition's self-check (`readIntegratedNormalizedVerdict`) re-parses the normalized fields. There `severeSeam` is already `unsure`, so the downgrade is not derived again, the comparison fails, and the answer reads as `unresolved / integration-review-unreadable`.
3. The board review writes `quality-unresolved: integration-review-unreadable`. `needsSelfRepair` is true for any `quality-unresolved:` row, so the world sends it straight to a paid self-repair diagnosis, even on attempt 1. The designed route is the second attempt, repairing the located check.

Codex found no paid re-read loop. Nothing published.

## The correction: a named reader, not a new meaning for an old name

**`quality-read/v2-located-600`** parses exactly as `v1-located-600`; a test reads five answers both ways and compares the results. Its decision differs in one rule:
- Before the self-check, each downgraded check is restored to the answer's own `fail`, so the parser derives the downgrade again.
- A record that does not fit that shape stays unreadable: a downgrade of a check that is not `unsure`, or of a field no check owns.

**Version awareness:**
- v2 is the current reader for new dual quality stages, and new stages and re-readings name it.
- Every decision passes the reader its stage names:
  - the board review's routing (the disposition written with `lastError`);
  - re-reading consistency (`readQualityStage`);
  - publication;
  - reuse of a passing Opus answer;
  - free re-reads.
- Stages that name a v1 reader keep the v1 decision. So do stages that name none, and the single-judge path, which has no named reader.

**Free re-reads.** A free re-read of a refused answer is now offered only when the current reader reads more (its location bound): a strict refusal (300) still is, and a `v1-located` refusal (600) is not, because v2 would read it identically. Before this change, `v1-located` was current, so such stages were not re-read either. Their behaviour is unchanged.

| Answer | v1 (stages already written, single judge) | v2 (new dual stages) |
| --- | --- | --- |
| Located `pictureWhole` fail, unlocated `severeSeam` fail | `unresolved: integration-review-unreadable` → self-repair diagnosis | `retry: [pictureWhole]` → second attempt; `severeSeam` stays `unsure` and downgraded |
| Two unlocated fails, nothing located | `unresolved: integration-review-unreadable` | `unresolved: [severeSeam, pictureWhole]` → the same self-repair route, with the checks named |
| A pass, a located fail, a contradicted answer | unchanged | unchanged (tested equal) |

**What does not change, per Codex's conditions:**
- The paid raw answer and the stage's reader provenance are kept. Nothing stored is rewritten.
- The unlocated check is never read as a pass.
- No acceptance changes. An answer with a downgrade is never acceptable under either reader. Publication still re-reads the raw answer under the stage's reader and needs an acceptable decision and a passing anatomy answer.

## The regression: the parser result and the actual next action

**Unit tests (5, `local-patch-boundary-observation.test.ts`):**
- the parse is identical to v1-located;
- the mixed answer, under both readers, with the stored record kept;
- an answer that locates nothing;
- no other decision changes;
- forged records stay unreadable.

**End to end through the dual review, v3 pinned, real disposable database (`local-patch-incremental-review.test.ts`):**
- One Opus question and no Sol question.
- The row is `FAILED`, attempt 1, with `lastError: "quality-retry: pictureWhole"` and `qualityDisposition {retry, [pictureWhole]}`.
- The stage names v2. `readQualityStage` agrees with the stored verdict, and the same verdict under v1 reads as before.
- Not publishable, no evidence recovery, and no free re-read.
- The world's route: `needsSelfRepair` is false, where the v1 label would be true. The repair checks are exactly `[pictureWhole]`.
- A second review run buys nothing.
- The next action: `runLocalPatchHide` buys `render:2` (settled), its prompt carries the `pictureWhole` direction and no seam direction, and no self-repair diagnosis is reserved.

**Updated pins.** Four assertions (five test cases, one of them parameterized) named `v1-located` as the reader of a new stage or a fresh re-reading. They now name the current reader. The fixture of a historical v1-located re-reading is kept, and it still publishes.

**Mutation, restore first.** I made v2 decide like v1 (`r2/reader-mutation.sh`, private). Two unit tests and the end-to-end test fail. The file was restored and its SHA-256 verified.

## Scope, honestly

- **The single-judge path** (`LOCAL_PATCH_VISUAL_REVIEW=legacy`, the source default outside QA enrollment) has no named reader and keeps the v1 decision, so this misrouting remains there. Changing it needs a named reader for single-judge receipts; I left that for a decision rather than change a historical path silently.
- **Routing only.** This changes routing for new dual answers, not what is accepted. The cost difference is one self-repair diagnosis avoided per such answer on its first attempt. It is not measured.

## Checks

| Check | Tree | Result |
| --- | --- | --- |
| `tsc --noEmit` | `b5af9c40` | exit 0 |
| `vitest run --maxWorkers=3`, all 377 files | `b5af9c40` | 4,949 passed, 2 expected fail, 55 skipped, **0 failed**, exit 0 (1,268 s) |
| `npm run build` | `b5af9c40` | exit 0: compiled, and both build audits report no problems |
| The two changed test files, before the commit | working tree | 101/101 |
| The four reader and dual files, before the pins were updated | working tree | 105 passed; the 5 failures were exactly the four stale reader pins |

The 4,949 are `451e19cc`'s 4,943 plus the 6 new tests. This is a local run, not CI on a pushed commit.

## A correction to my earlier summary

My summary to Guy said both of Codex's reproductions stop "before any purchase". That is true of R1. R2's counterexamples stop after the four qualification reviews and before the paintings. Codex is right, and the R2 table in `docs/CLAUDE_ENGINE_RECOVERY_V18_REVIEW_FIXES_20261013.md` was already exact.
