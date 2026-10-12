# Named quality readers and v17 preparation: handoff, 12 October 2026

This is for Codex's re-review of the combined release boundary in `docs/CODEX_ENGINE_RECOVERY_R123_CLOSURE_20261012.md`. It follows R1, R2 and R3, which Codex closed at `375e6f38`. It is also the return on item 4 of `docs/CODEX_V16_CONTROLLED_RENDER_REVIEW_20261012.md`.

- **Worktree:** `C:\GNart\Work\find-me\work\claude-engine-recovery-20261012`, branch `claude/engine-recovery-20261012`.
- **Commits after the closure:**

  | Commit | What it is |
  | --- | --- |
  | `d1dc8152c8330e511b595dde60c284b10e574434` | the named quality readers |
  | `7458eb092609eedd1bfef6a83bb1adb1a533ed97` | v17 preparation |
  | this document | the commit after them |

- No deployment, push, live database, provider call, paid render, flag change, notification or customer image.

## Codex's five conditions

**1. The retained 390-character fault stays a repair decision on the free path: no new judge purchase, no shortened stored answer.**

The fixture `located390Answer` (in `local-patch-dual-fixtures.ts`) is the sanitized form of the retained answer:
- the same shape and checks: a located `pictureWhole` fail and everything else passing;
- the same four boundary observations and three evidence fields;
- the same lengths: 179/390/270/210/389/302/257/303/263;
- synthetic words. No reviewer text is copied.

At the parser:
- `quality-read/v1-strict-300` refuses it with `{length, hides.0.verdict.faults.0.where}`.
- `quality-read/v1-located-600` reads it as `retry: [pictureWhole]` with all 390 characters.

Through the pipeline, at evidence rounds 1 and 9:
- The deployed refusal has no anatomy stage, because none was bought. It is decided by `decideRetained`.
- The result is `state: retry`, cost 0, no provider call, and the ledger is unchanged.
- The stored `raw` is unchanged and the verdict's location equals the full 390 characters.
- A `quality-reading/v1` is recorded beside the untouched stage, and `reviewHistory` keeps the original review.
- Nothing is published, and a repeat invocation is a no-op.

**2. The decision and publication use the same named reader and binding; forged, stale or conflicting re-readings cannot authorize publication.**

- Every new quality stage names its reader. A stage that names none was read strictly, as before.
- `allowedDualPublication` now reads the quality answer through `readQualityStage`. That function accepts only a reader the question allows, and only a re-reading that describes this exact answer: request key, fingerprint, SHA-256 of the raw text, the previous reader, a different new reader, and a disposition equal to its own recomputation.
- Tested on a published row against eight forgeries:
  - two unknown readers;
  - stale bytes;
  - a stale fingerprint;
  - a stale request key;
  - a conflicting disposition;
  - a "re-reading" by the same reader;
  - a previous reader that is not the stage's.

  All are refused. A strict stage, and a self-consistent re-reading of the same passing answer, still publish: for a strictly readable answer, the two readers give equal verdicts (tested).

**3. Quality-only historical refusals work with no continuity review bought; an Opus failure never becomes a pass or triggers another reviewer.**

- `localPatchRetainedAnswerUndecided` now has a quality-only branch, and `readRetainedAnswer` has a `role: "quality"` result.
- A readable re-read is decided exactly as a fresh answer under that reader would be.
- The 390 case is a repair: `dual.continuity` stays null and no anatomy question is asked.
- A refusal that the current reader would PASS is not decided for free (tested). Its anatomy question costs money, so the row stays on the paid evidence route.

**4. Values above the new bound produce structured diagnostics and bounded recovery, including defects at the end of long fields.**

Parser:
- A defect named at the end of a 600-character location is kept whole.
- At 601 characters it is `{length, …faults.0.where}`.

Pipeline: a historical refusal with a 700-character location goes through four steps.
1. It is re-read for free and named exactly (`readFault`, plus an evidence attempt `length` at that path, keeping its round number).
2. It is marked so it is never re-read again.
3. The next paid question is `compact/v1` with SIZE RECOVERY.
4. Its 241-character answer is read as the repair it reports.

The rest of R3's coverage is unchanged:
- style, lighting, neighbours and a boundary observation, each named at its path;
- a compact question that fails twice retires at three Opus questions, with nothing held.

**5. The full incident and the combined checks pass on the final exact commit.**

See "Checks" below.

## Other behaviour changes, for review

- **New answers** are read by `quality-read/v1-located-600`. It differs from the strict reader in one bound only: a fault location may be up to 600 characters, matching the evidence and boundary observations. The question bytes are unchanged. Stages written before this change keep the strict reading, including at publication.
- **A latent defect, fixed and mutation-checked:**
  - What went wrong: the normalized-verdict check re-validated the parser's own fault, `Return boundary <edge>: <observation>`, against the location bound. A failed boundary observed in more than 278 characters therefore turned a located repair into `unresolved` (quality-unresolved → self-repair diagnosis) instead of `retry` (the bounded image route).
  - The fix: those derived faults are now left for the parser to derive again.
  - Scope: this applies to every v12 answer, including the single-judge path. It changes a misrouting, not an acceptance.
- **The dry-run planner** reports quality re-reads as `free-repair` or `free-undecided`, with the reader and the code/path.

## v17: preparation only, with no paid rendering

- `LOCAL_PATCH_PROMPT_RELEASE` gains `v17` and the default stays `v15`. Like v16, v17:
  - pins fresh v12 rows only;
  - uses identity style v5 and the strategy-first feedback;
  - diagnoses its rows in its own wording.
- v17 is v16 plus one paragraph for every hide.
  - **HELD THINGS:** a replaced person's toy or tool goes whole into the new child's hands, or is removed whole. Nothing is left standing, hanging or floating.
  - **SUPPORT AND SCALE:** the child stands on the authored support, at the replaced person's contact, and never on a foreground object or vehicle. The whole body is scaled for the stated age upward from that contact, never a stretched head or torso (Codex's correction).
- One v17-only content correction covers the Great Wall diabolo hide: the toy is described as drawn (two discs hanging from one short stick). The shared hide content and v15 are untouched.
  - For the other 53 hides, v17 is exactly v16 plus the paragraph (tested at every age and repair set).
- v16 is now hash-pinned exactly as its controlled render was asked; the code reproduces those nine prompts byte for byte.
- `docs/art/v17-prop-support-regression-manifest-20261012.json` defines the next paid comparison.
  - Cases: A3, A10 and B6 at Great Wall; B10 New York; the borderline A10 New York; and two accepted controls.
  - It reuses the five v5 sheets already bought, pinned by SHA-256, and requires refusing to run on any mismatch. The private dry run (`work/private-v16-controlled-render-20261012/dryrun-v17.ts`, git-ignored) wrote the v17 prompts for these cases and found all five sheets matching.
  - Cost: about $1.16, with a $3 cap. **Not authorized.**
- Deliberately left out: a face-integration sentence (conspicuous, brighter faces). The illustrated references cannot test it, so it belongs with a photo-based validation, as Codex noted.

## Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| Focused run on the reader code just before its commit (incremental review, boundary observation, dual world including the 16/11 incident, review recovery, body continuity, scene integration, boundary review); the full check below covers the commits themselves | 7 files, 156 passed, 451 s |
| v16/v17 prompt contracts | 32 passed |
| identity lifecycle v15/v16/v17 | 3 passed |
| `npm run check -- --maxWorkers=4` on `7458eb09` | exit 0: 374 files; 4,913 passed, 2 expected failures, 55 skipped; 637 s |
| `scenes:validate`, `adventures:validate` | pass |
| `npm run build` on `7458eb09` (Prisma, Next build, trace finalization, board-catalog tracing audit, player performance audit) | exit 0; both audits report no problems |

## Not claimed

- **Live models:** that a live Opus or Sol notices any given defect.
- **The stuck world:** its budget, its 11 unreviewed appearances, and an operator path for parked worlds (the product gap in Codex's first review). Parsers do not complete it or refund it.
- **Photo-to-illustration:** these references are painted.
- **v17's effect:** it is untested until the manifest run is approved.
- **Deployment readiness of the combined release.**
