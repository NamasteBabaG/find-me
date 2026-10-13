# QA release v19: integration, checks, configuration, and a $5 rehearsal (13 October 2026)

For Codex, following "Next brief for Claude" in `docs/CODEX_REAL_PHOTO_RESULTS_REVIEW_20261013.md` (main checkout). Nothing was pushed or deployed, nothing changed on QA, and no paid call was made.

**Read this first.** The configuration v19 was qualified with is `LOCAL_PATCH_PROMPT_RELEASE=v19` with `LOCAL_PATCH_VISUAL_REVIEW=dual-high-v3`. The rehearsal (section 5) ran the product's planner and budget at the prices observed in the real runs. Under that configuration, **a 27-hide world cannot finish under the $5 ceiling even when every picture is accepted first time.** The world parks with 23 of 27 hides published.

With the cheaper `dual-high-v1` question, a perfect world finishes at $4.61, but a single repaint already parks it. **There is no repair margin under $5 in either configuration.**

The code itself is safe to release, and nothing in it changes the ceiling. What the full-game test needs first is a decision about the ceiling or the review contract (section 6). Buying the full game before that would pay about $4.75 for a predicted park.

## 1. The QA baseline, verified today

- `qa.findmeworlds.com` → `dpl_5ti7EyV8uHdypC9PuTTQuB6DeUEc` (alias read through the Vercel connector, last updated 2026-10-09). It is still the newest production deployment of `find-me-qa`.
- **The source.** The deployment carries no git metadata (`source: cli`, `meta: {}`), but its uploaded file tree identifies each file by the SHA-1 of its content.
  - The connector returned 455 entries (210 more were truncated). Every one of the 454 that exist in git equals `ee74b6c3` byte for byte; the 455th is the build cache `tsconfig.tsbuildinfo`.
  - Against the previous release `8e730ee3`, 18 of the listed files differ, and every one is a search-level change.
  - Codex's brief of 12 October recorded the same commit and deployment.
- **Baseline: `ee74b6c379b7ae475d4707a1f58f15127f0c06cc`.** It is also the base of `claude/engine-recovery-20261012`.

## 2. The integration

- **Branch and range.** Branch `claude/qa-release-v19-20261013`; its tip is the commit that adds this document. The range `ee74b6c3..tip` is a fast-forward: the 29 reviewed commits up to `e6441317` (one of them the merge of reader v2), plus this commit (this document and two `.env.example` comments).
- **Every product commit in the range has been reviewed and closed by Codex.** That covers batch 1 and R1–R3, the named readers, the v16–v18 opt-ins, reader v2, v19 and the runner contracts.
- **What changed: 77 files.** `src/services` 46, `src/domain` 5, `src/infra` 3, `src/app` 3, `src/lib` 2, `scripts` 1, plus documents.
- **What did not change.** No change to:
  - `prisma/`, `content/` or `public/`;
  - `package*.json`, `vercel.json` or `next.config.*`;
  - middleware.

  So no QA database migration, no art and no dependency change.
- **The Explorers/Detectives boundary is untouched.** `SEARCH_LEVEL_CHOICE`, `content/worlds/detective-releases.ts` and the search-level code are exactly as deployed.
- **Why nothing smaller.** v19 is built on v18's fixed foreground and v17's wording, and dual review v3 on the readers. The earlier releases stay opt-in behind `LOCAL_PATCH_PROMPT_RELEASE`, whose default is v15.

## 3. Release checks

**On `e6441317`, the integration's code**, with the CI gate's own steps and environment (`.github/workflows/quality.yml`):

| Step | Result |
| --- | --- |
| `npm run check` (`--maxWorkers=3`) | TypeScript clean; **377 of 377 files, 4,962 passed**, 2 expected failures, 55 skipped |
| `scenes:validate` and `adventures:validate` | exit 0 |
| Production build (CI's synthetic env, throwaway SQLite) | exit 0 |
| Private-asset audit | `privateAssetBytesRead: 0`, `privateLeaks: []` |
| Player-performance audit | `problems: []` |
| `git diff --exit-code` after the build | no drift |

**On this commit**, which changes only this document and two `.env.example` comments (no test reads either), the check was re-run: TypeScript clean; **377 of 377 files, 4,962 passed**, 2 expected failures, 55 skipped (`--maxWorkers=3`, 880 s).

Codex's release procedure still needs CI on the exact pushed commit.

## 4. What a new game persists, and when

| Choice | Pinned where | When | Value comes from |
| --- | --- | --- | --- |
| Review release, with both judges' policies (model, endpoint, max tokens, timeout, pricing) | AuditLog `aud_visual_policy_<gameId>` | in the transaction that creates the DRAFT (`create-flow.service.ts:58`, `world-purchase.service.ts:125-127`) | `LOCAL_PATCH_VISUAL_REVIEW` at draft time |
| Questions and readers | derived from the pinned release name; each answer records its reader and the question's wire hashes | per answer | code |
| Painter prompt release | `TargetVariantAsset.promptVersion` | when the hide's row is created: lazily, one hide per slice (`local-patch-hide.ts:262`) | `LOCAL_PATCH_PROMPT_RELEASE` at that moment |
| Identity style (v5 for v16–v19) | `sheet:painted` provenance, the identity reservation's fingerprint, the review receipt | at the avatar step after payment (`pipeline.ts:206-218`) | `LOCAL_PATCH_PROMPT_RELEASE` at that moment; a saved sheet keeps its own |
| Board art | not per game: pinned in code per scene version and checked on every use; each paid attempt's fingerprint binds the art crop's hash | per attempt | code |
| Player review | not pinned; dual-pinned games always review in player mode | read live | `LOCAL_PATCH_PLAYER_REVIEW` |

Consequences:
- **Only a draft created after the redeploy is a clean v19/v3 game.**
  - The env is read once per process (`env.ts`) and the container is cached, so a change takes effect with a new deployment, not with the variable alone.
  - A draft made before the change and paid after it gets v19 rows and a v5 identity, but is reviewed by its pinned release: v1, or none if it was legacy. Its v19 paintings are never asked about object joins. **Do not use such a draft for the full-game test.**
- **A game mid-generation at the change.**
  - Rows that exist keep their version; rows created later take v19. A mixed world is intended and tested (`local-patch-dual-world.test.ts:244-273`).
  - Its identity was approved before any row existed, so it stays v4.
  - Its review release stays as pinned.
- **Existing v1 pins stay valid.** The pin is checked byte for byte against known releases (`visual-review-release.ts`). `visualReviewPolicy` has no diff in the range, and `policy("local-patch-dual-high/v1")` builds the same keys in the same order as the deployed `policy()`.
- **Rehearsed through the real `createDraft`:**
  - a new draft under the v3 setting gets the v3 pin and the local-patch engine;
  - a draft made under v1 keeps v1 (`rehearsal-draft-pin.json`).

## 5. Rehearsal: a full 27-hide journey world, provider-free, at observed prices

### Method

What is real:
- the product's world planner (`runLocalPatchWorldSlice`, tick by tick) and its dual review and publication gate;
- the budget admission: the $4 ceiling, its automatic $5 extension, the $0.30 review reservations;
- the product's own rate card.

Built on `local-patch-dual-world.test.ts`. The game is the nine journey v12 boards with all 27 hides, a child aged 6, `LOCAL_PATCH_PROMPT_RELEASE=v19`, player review on, and the identity sheet and its Luna review charged to the same world ledger as in the product.

What is fake: every provider. `fetch` throws, and the run made 0 calls.

The money is not invented. Every charge is one observed in a real run:

| Charge | Source | Observed | Mean |
| --- | --- | --- | ---: |
| Paintings | settled amounts from pv19 and the real-photo test | $0.0472–0.0477 | $0.0473 |
| Opus, v3 question (12 images) | usage tokens from pv19 and the real-photo test | $0.093–0.116 | $0.1007 |
| Opus, v1 question (8 images) | usage tokens from the v17 run's ledger | $0.080–0.102 | $0.0876 |
| Sol (the same question under v1 and v3) | usage tokens from all three runs | $0.027–0.041 | $0.0338 |
| Identity sheet + Luna | the observed sheet price | $0.0736 | |

Review usage is priced by the product's rate card. For example, Opus with 16,350 tokens in and 1,872 out settles at exactly pv19's recorded 102,840 micro-USD.

### Results

Purchases are listed as paintings / Opus / Sol.

| Case | Purchases | Committed | Outcome |
| --- | --- | ---: | --- |
| **A. v19 + dual v3** (as qualified); every picture accepted first time | 27 / 26 / 23 | $4.754 | **parks at `recovery-exhausted`; 23 of 27 published** |
| B. v19 + dual v1; every picture accepted first time | 27 / 27 / 27 | $4.614 | delivered, 27 of 27 |
| C. v19 + dual v1; one picture needs a repaint | 28 / 28 / 26 | $4.722 | **parks; 26 of 27 published** |

What held in every case:
- the automatic $4 → $5 extension fired exactly once;
- the ceiling never exceeded $5;
- nothing was skipped silently;
- every row was `local-patch-prompt/v19-fixed-scenery`;
- every review ran under its pin, with readers `quality-read/v2-located-600` and `continuity-read/v1-output-bounded`.

The parking message names the cause: "the next required purchase does not fit: 245838 of 5000000 micro-USD remain with nothing in flight. A service decision is required."

### Reading

- **The cost of a world.** Under dual review every question covers one hide, so a world buys 27 paintings, 27 Opus questions and 27 Sol questions (`local-patch-dual-review.ts:231-232`).
  - At observed prices a clean v3 world would settle at about $4.98.
  - Each question reserves $0.30 first and is admitted only while committed ≤ $4.70 (`world-budget.ts:445-464`), so the last questions cannot be bought.
- **Per hide, the money is gone.** After the identity, $5 leaves $0.1825 per hide. A clean v3 hide costs $0.1819, and a clean v1 hide $0.1687. Any repaint or evidence re-ask comes out of nothing.
- **A secondary finding, the planner's order near the ceiling.** In A, three hides passed Opus but never got their Sol (`greatwall-v12-3`, `sydney-v12-3`, `antarctica-v12-2`), and `antarctica-v12-3` got no review. The slice opens new hides' Opus questions before finishing Sol on hides whose Opus passed. A completion-first order would publish 25 of 27 in A: better, still a park.
- **The prices are this week's observed means.** The Opus answer's length varies (1,300–2,600 output tokens), so a world can come in a little cheaper or dearer, but no plausible spread brings v3 under the ceiling with a repair margin.

## 6. Configuration for QA, and the decision before the full game

**The code can be deployed without any flag change.** With QA's current settings (`dual-high-v1`, player review on, `LOCAL_PATCH_PROMPT_RELEASE` unset so v15):
- in-flight and new games get batch 1's bounded evidence recovery and parking, the named readers and reader v2;
- new games still paint with v15 and are reviewed with v1, as today.

Stage the deployment as before, set `APP_COMMIT` to the deployed commit, check `/api/health`, then promote.

**The tested contract, once the decision below is made:**

| Variable | Today on QA (Codex's brief of 12 October) | For v19 |
| --- | --- | --- |
| `LOCAL_PATCH_PROMPT_RELEASE` | unset (v15; the variable did not exist at `ee74b6c3`) | `v19` |
| `LOCAL_PATCH_VISUAL_REVIEW` | `dual-high-v1` | `dual-high-v3` |
| `LOCAL_PATCH_PLAYER_REVIEW` | `on` | `on` (unchanged) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | present (dual review runs) | present; health fails on QA without both |
| `APP_COMMIT` | `ee74b6c3` | the deployed commit |
| `GENERATION_DAILY_CENTS` | (not read here) | must leave room for a whole world (up to $5) plus that UTC day's other spend; a tripped ceiling stalls a game silently (job QUEUED, no error) |

Then redeploy. `/api/health` must show:
- `promptRelease: "v19"`;
- `visualReview.newGames: "dual-high-v3"` with `configured: true`;
- the commit.

The test game must be drafted after that deployment.

**The decision (not taken here):**

1. **The ceiling (Guy's decision).**
   - Keeping two HIGH reviews of all 27 hides at today's prices needs more than $5 for any repair margin.
   - With v3, a clean world is about $4.98. Each repair cycle adds roughly a painting, a diagnosis (up to $0.25 reserved), and an Opus and a Sol question.
   - The ceiling is the constant in `src/domain/generation/world-budget.ts:10` together with the $4/$5 extension in `board-wizard-budget.ts` and `local-patch-budget-recovery.ts`. Changing it is a reviewed code change with the owner's explicit authorization, never a QA flag.
2. **A cheaper review contract (Codex's decision; needs qualification).** Each option changes a judge contract and needs its controls run:
   - ask v3 only where a join crosses authored scenery or a high-risk object, and v1 elsewhere. In this world the high-risk hides are New York now and the survey's `paris-v12-3`, `tokyo-v12-2` and `antarctica-v12-1`;
   - use fewer or smaller context images;
   - ask for a compact answer: Opus output is 1,300–2,600 tokens, about a third of its price.
3. **Evidence-sized reservations (Codex's decision).** The $0.30 per question is a fixed bound; the observed maxima are $0.116 (Opus v3) and $0.041 (Sol). Smaller bounds would admit more questions near the ceiling, but they do not change what a world costs, so on their own they create no repair margin.
4. **v19 with dual v1.** It finishes only a perfect world (B and C). This pairing was never qualified: pv19 and the real-photo test used v3, and v1's question passed a broken sign in the v17 run.

## 7. Known limitations

- **The budget**, as above. It is the one that blocks the full-game test.
- **v19's fixed scenery covers only `newyork-v12-1`.** Of the eight other high-risk joins in the 54-hide survey, three are in this world: `paris-v12-3`, `tokyo-v12-2` and `antarctica-v12-1`. There the object-joins question is the guard.
- **The identity gate passed a visible hair drift** in the real-photo test. The owner accepted the likeness, and the gate stays as it is (Codex's review); a feature comparison is backlog.
- **Luna's full answer is not retained,** only its receipt. This is product behaviour.
- **Parking.** A world that parks at `recovery-exhausted` stays in `TARGETS_GENERATING` with its job FAILED and is shown as needing attention. Resuming needs a service decision.
- **The identity stage at $5 re-queues every tick** instead of parking (asserted by `board-wizard-identity-lifecycle.test.ts`).
- **An interrupted call keeps its reservation for good** (at most two automatic recoveries of each kind per world). This narrows the margin further in practice.

## 8. How to re-run the rehearsal, and where it is

Private folder `work/qa-release-20261013/` in this worktree, git-ignored:
- the rehearsal is `v19-world.rehearsal.ts` with `vitest.rehearsal.config.ts`;
- the reports are `rehearsal-draft-pin.json`, `rehearsal-v3-clean.json`, `rehearsal-v1-clean.json` and `rehearsal-v1-one-repair.json`;
- `usage-v17.ts` read a copy of the v17 ledger (the copy is beside it).

```
npx vitest run --config work/qa-release-20261013/vitest.rehearsal.config.ts
```

It takes about six minutes, is provider-free (`fetch` throws), and is never part of `npm run check`.

The code paths behind sections 4 and 5 were mapped with file and line references, which are cited inline above.
