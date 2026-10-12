# v18 New York foreground and the object-joins question: provider-free preparation, 12 October 2026

> **Corrected after Codex's review** (`docs/CODEX_V18_FOREGROUND_JOINS_REVIEW_20261012.md`, HOLD). Three statements below were wrong; the fixes and their evidence are in `docs/CLAUDE_ENGINE_RECOVERY_V18_REVIEW_FIXES_20261013.md`.
> - §2, "it can never hide a face": true only of the authored envelope. A recovery plan brings its own face and protected child, and the outline could cover them (710 of a face's 1,225 pixels, with a purchase). R1.
> - §2 tests, "an unchanged audit": the repair join's zero counts were literals, not measurements. R1.
> - §4, the gate: it counted a retry for uncertainty alone as a located rejection, and passed an unreadable observed answer. R2. The runner hashes and the 32/32 self-test in §4 are superseded.

This answers Codex's paid-review brief, `docs/CODEX_V17_PAID_RENDER_REVIEW_20261012.md`, items 1–5.

- **Spend and systems:** no provider call, no spend, no deployment, no live database and no flag change.
- **v17 is unchanged.** v17 stays opt-in, and its prompt bytes, paintings and ledger are untouched.
- **Branch:** `claude/engine-recovery-20261012` (not pushed).

| Item | Commit |
| --- | --- |
| 1. Report corrected | `a253f01c` |
| 2–3. Geometry: an authored fixed foreground (release v18) | `5b7e0466` |
| 4. Quality question: object joins (dual release v3) | `9657af12` |
| 5. Next paid manifest, and this document | the commit that adds this file |

## 1. The report is corrected (`a253f01c`)

- **Acceptance policy.** `B-a10` fails for a seam: a new sign is joined to the original's lower half. The sign having changed is not the failure. `A-a10`'s shortened sign is a coherent change and is not ground truth for a fail. The blanket rule that every object keeps its shape, size, position and lettering is withdrawn.
- **The reviewers.** Opus saw the symptom and passed it, which is a false acceptance. Sol was asked about head and body continuity only.
- **The cause.** That the return window ships the sign is verified. The envelope, support and age-height conflict is a hypothesis, not separated from the wording. The straight `y=704` cut is recorded as disproven.
- **Accounting.** The settled total is $1.185629, and the reconstructed reservation peak is $1.449989. The R3 closure is referenced.

## 2. Geometry: restore the sign along its outline, not a return cut

### What was tried, free, on 15 retained New York paintings

These are the v15, v16 and v17 paintings of this hide, including the v16 render's 3- and 6-year-olds. Each was re-composed through the real `composeBoundedLocalPatch`, once as shipped and once with the taxi sign and visible roof restored from the board inside the painting first (`work/private-v16-controlled-render-20261012/occlude-trial.ts`). The figures are in `occluder/trial/group-0…4.jpg`, and the seam reports in `occluder/trial/occlude-trial.json`.

| Painting | As shipped | Sign and roof restored |
| --- | --- | --- |
| v17 B-a10 (the seam) | New sign cut at the crop edge | Original sign; the legs continue behind it. Aligned both ways, border difference 14.7 → 7.7 |
| v17 A-a10 (shortened sign) | Shoe on the sidewalk where the sign's end was | Original sign; the shoe goes behind its right end |
| v17 B-a6 | Coherent | Unchanged; one-pixel tolerance → aligned |
| v16 B-a10, A-a10 (shoes on the sign) | On the sign | **Still on the sign.** The outline protects the object; it does not move feet. The v17 wording moved them, in its three samples. |
| v15 B-a3 (seam-refused either way) | The painter drew its own sign about 6 px higher | **A doubled sign:** the painted top survives above the restored original. Refused by the seam check in both compositions. |
| The other nine | — | Unchanged or visibly identical; in v16 B-a6 the shoes, which touched the sign's top, now sit partly behind it |

Codex's straight cut at `y=704` (its preview images, which I viewed) ends the legs in the stair tread, because the sign's top slants.

### The contract

- **The domain module.** `src/domain/scene/local-patch-foreground.ts` (`local-patch-foreground/v1`) holds one authored outline: `newyork-v12-1`, the sign and the visible yellow roof, traced on the shipped board at 4–8×.
- **Validation.** `assertLocalPatchForeground` refuses before anything is bought (render tested: no reservation, no dispatch). Every point must lie inside the crop, every polygon must cover at least 64 px², and the outline must:
  - never cover the authored envelope, so it can never hide a face or a body inside it;
  - enter from the crop's edge, so it can never cut an island of board into a painting.
- **Coverage.** Deterministic 4×4 supersampling. Pinned: polygon `4be0c68a…`, coverage `7f2e115b…`, 10,925 pixels.
- **The release.** `LOCAL_PATCH_PROMPT_RELEASE=v18`, recipe `scene-integration-v7`, prompt `local-patch-prompt/v18-fixed-foreground`. It is v17 plus one sentence for a hide with an outline (`foregroundContract`, pinned `ffeb8a3fccc88a5c`):

  > "…the original picture of them is drawn back over your result exactly as it is now… never move, resize, shorten, copy or redraw them. The child stands on the support behind them… they may hide the shoes and lower legs… Never put the feet on top of them."

  For a hide without an outline, v18 asks v17's words. It applies to fresh rows only; the v15, v16 and v17 pins pass unchanged.
- **One composition rule for every path that writes a v12 picture.** The paid painting is occluded with the board's own pixels before the join, so the seam analysis and the join both see the published pixels. The paths:
  - `renderLocalPatchHide`: normal attempts, adaptive recovery, recovery directives, self-repair renders and restyle (`local-patch-render.ts`);
  - retained recomposition (`local-patch-recompose.ts`);
  - the self-repair join: `recomputePaidPatchJoin` takes the outline (`local-patch-repair-compose.ts`), chosen from the row's pinned recipe (`local-patch-self-repair.ts`).
- **No change to the repair refusal.** The outline is a layer, not a return window, so the refusal of authored return windows on repair attempts (`local-patch-render.ts:307-313`) stays as it is.
- **Provenance.** Every v18 receipt carries `foreground: { version, hideId, polygonSha256, alphaSha256, restoredPixels, imageSha256 }`, bound to the shipped crop. A self-repair receipt replaces it with the repaired candidate's record; an earlier picture's record never survives.
- **Publication.** `localPatchForegroundPublishable` runs first in `allowedForGame`, for single and dual review alike. A v18 row of a hide with an outline publishes only with that outline's record on that exact image, read against the row's pinned `promptVersion` in the database. Every other row must carry no record. A hide with no outline and no claim is never looked up.
- **What it does not do.** It does not remove a copy of the object that the painter drew outside the outline (the v15 B-a3 double). The v18 sentence and the visual review own that.

### Tests

**Domain: 4 tests.**
- the pins and sample pixels;
- the envelope is never covered and the outline reaches the crop edge;
- refusals: covering the envelope, a floating island, leaving the crop, a tiny or degenerate polygon, the wrong hide, no description;
- union and determinism.

**Services: 8 tests.**
- the release mapping;
- v18 equals v17 plus the pinned sentence, and only for the New York hide;
- exact restoration arithmetic: 10,925 pixels restored, every other pixel untouched;
- the render path: v18 ships the board's sign under the outline and the painted child above it, while v17 is byte for byte the plain bounded join of its painting;
- a replay re-derives the same picture and record without a second dispatch;
- refusal before any purchase;
- the self-repair join: the board inside the window and outline, an unchanged audit, the record bound to the candidate;
- the publication matrix, and the database lookup only when needed.

**Not covered by an integration test:** retained recomposition. It is a QA-only migration that shares the helper, and seeding a v12 game for it is heavy. Codex may want one.

## 3. The quality question: object joins (dual release v3)

### Diagnosis, from the retained answer and the exact evidence rebuilt (`evidence-v17.ts`)

- **What Opus said.** On B-a10: "The taxi roof sign lettering looks slightly softened at the top but stays a coherent sign". On the bottom boundary: "only minor softening of the lettering". `pictureWhole`, `severeSeam` and bottom `boundaryIntegrity` were all pass.
- **The bottom strip.** The bottom return strip shows the cut at native scale, with letters about 20 px tall and nothing marking where the join runs.
- **The close-up.** The AFTER close-up ends exactly at the returned area (`LOCAL_PATCH_REVIEW_CLOSEUP_GUARD_PX` is the return guard). The cut sign therefore runs off its edge, and the question says an evidence-crop edge is not a cut.
- **The schema.** It asks for "specific crossing anatomy": people, not objects.

### The revision

**The release.** `local-patch-dual-high/v3` (`LOCAL_PATCH_VISUAL_REVIEW=dual-high-v3`) is pinned per game at creation, like v1 and v2, so a flag never changes an existing game's question.

**Continuity.** v1's question and bounded reader, exactly. Sol's images, labels and words are identical to v1 up to the binding that names the release (tested).

**Quality.** The v12 player question, plus `object-joins/v1`:
- **Evidence.** Four `JOIN_DETAIL` images (`prepareJoinDetails`):
  - each returned edge's own span, ±40 px across the join;
  - magnified 3× (2× for a band longer than 500 px, the side joins here), nearest-neighbour, so nothing is smoothed;
  - BEFORE above AFTER, or to its left;
  - red ticks in a white margin mark the join, and nothing covers the pixels;
  - cut from the same registered context and window as the boundary strips. The integration test rebuilds them independently and finds them pixel-identical.
- **Words.** One paragraph (`objectJoinInstructions`), placed before the schema; boundary observations become "specific crossing people and objects". The paragraph:
  - names "a word or sign cut along the line, a doubled or ghost edge, a stepped contour, half of an old object beside a new one" as a break, "never as softening or blur";
  - when the break is visible in the player context, fails `pictureWhole` and `severeSeam` with a located fault, and fails that edge's boundary;
  - keeps legal "an object repainted, moved, resized or removed wholly on one side of the line" and "natural occlusion by a coherent foreground object";
  - does not count a registration difference of one or two pixels as a break.

**Readers.** The verdict schema is the same, read by `quality-read/v1-located-600`. Nothing is decided from words in a reason.

**Repair routing.** A located `pictureWhole` or `severeSeam` fail with a failed bottom boundary goes to repair as before. It is tested end to end: `quality-retry`, with repair checks `pictureWhole` and `severeSeam`, no Sol purchase, no publication.

**Provenance.** The receipt records the question actually asked: 12 wire hashes and the four `join` evidence ids. Two things publish nothing (tested):
- a v3 receipt read as v1's;
- a v3 continuity stage without its reader.

**v1 and v2.** They ask the prepared question byte for byte (`dualQualityRequest` returns the same object), and their tests are unchanged.

**Cost.** The four images add about 3,500 input tokens, about +$0.014 per Opus review at the measured $4/M input ($20/M output). All seven v17 reviews match this price exactly.

## 4. The next paid manifest: `docs/art/v18-foreground-joins-manifest-20261012.json`

**Not authorized.** It needs Guy's own approval, and it runs as a new run identity, `pv18-20261012`, with its own $1.50 cap.

**Phase 1: qualification on saved pixels.** One Opus review with the v3 question per saved v17 shipping crop (SHA-256 pinned):

| Saved picture | Expected | Why |
| --- | --- | --- |
| `B-a10` NY | reject | the seam |
| `B-a6` NY | pass | the same object, a sound join |
| `A-a6` GW | pass | a coherent repainted prop |
| `A-a10` NY | observe, not gating | |

**The gate.** It is read from the retained answers:
- B-a10 must be a decided `retry` with a located `pictureWhole` or `severeSeam` fault;
- both controls must be acceptable;
- an unreadable answer is not a rejection: it fails the gate.

If the gate fails, nothing is painted.

**Phase 2, only after the gate.** B-a10, A-a10 and B-a6 at New York are painted under v18. Each is reviewed by Opus (v3) and by Sol.

**Estimate.** All figures come from the measured prices.

| | Amount |
| --- | ---: |
| Expected | $0.95 |
| Upper | $1.14 |
| Highest committed with reservations open (upper) | $1.40 |
| Cap | $1.50 |
| If the gate fails | about $0.40–0.50 |

The peak is the settled total before the last Sol review, plus that review's $0.30 reservation.

**Runner (private, git-ignored).** It sits next to the v17 one, and the v17 files are unchanged at their reviewed hashes.

| File | Role |
| --- | --- |
| `run-guard.ts` | v17's lock, identity and capped ledger, with the run id as a parameter |
| `v18-guard.ts` | the pinned contract: manifest, saved pictures, sheets, and the product's outline and versions |
| `v18-run.ts` | the two phases, the gate, an atomic report from the ledger and the retained answers, the stop on an unconcluded painting, an outline check per painting |
| `run-v18.ts`, `run-v18.ps1` | dry run by default |
| `selftest-v18.ts` | 32/32 checks, 0 network calls |

**What the self-test covers:**
- the pins, including a changed picture whose manifest hash was changed to match;
- the cap across two ledger instances;
- the whole run: a v3 question with 12 images, Sol's v1 question with 6, a gate read from the retained answers, the outline on every painting, accounting equal to the ledger, a second launch that buys nothing;
- the gate failing three ways, each with nothing painted;
- a stop after a qualification review, then a resume;
- a lost painting, the cap, the lock and the identity;
- the outline invariant on its own.

**Mutation checks.** Each guard was removed in turn, and `v18-run.ts` was restored by hash every time.

| Guard removed | Checks that failed |
| --- | ---: |
| The gate | 3 |
| The outline invariant | 1 |
| Rejection loosened to "any non-acceptable state" (the unreadable case) | 1 |

**SHA-256 of the private files:**

| File | SHA-256 |
| --- | --- |
| `run-guard.ts` | `de249a64…` |
| `v18-guard.ts` | `8d44038a…` |
| `v18-run.ts` | `ed31264d…` |
| `run-v18.ts` | `49d7b424…` |
| `run-v18.ps1` | `d7dcf97c…` |
| `selftest-v18.ts` | `c66875ee…` |

## 5. Checks

**Full run of both changes together (the tree of `9657af12`).** `tsc --noEmit` is clean. `vitest run --maxWorkers=4`:

| Result | Count |
| --- | ---: |
| Passed | 4,930 |
| Failed under load | 3 |
| Expected fail | 2 |
| Skipped | 55 |

That is 377 files. The three failures were load, not logic, and all three pass alone (24/24, `--maxWorkers=1`):
- `production-bootstrap`: `spawnSync … ETIMEDOUT`, known under load;
- `collection-world` (kingdom) and `local-patch-extra-attempt-world`: Prisma interactive transactions expired ("Transaction not found") inside an unchanged fence transaction.

**The intermediate commit.** `5b7e0466` type-checks on its own (`git archive` of that tree).

**The new tests:**

| Test | Result |
| --- | ---: |
| Domain foreground | 4 |
| Services foreground | 8 |
| Object joins | 6 |
| v3 end to end | 2 |

The existing v16/v17 prompt pins, render and repair-join tests pass unchanged.

## 6. Open, and for Codex

- **Review.** The foreground contract and its paths, especially recomposition, which has no integration test. Then the v3 question, the manifest and the runner.
- **A latent mismatch.** The board review builds its return window from mask ± 120 and ignores an authored `returnRect` (`local-patch-board-review.ts`, around the `returnedWindow` line). No v12 product hide has one today; only the Detectives plan in `docs/art` does. If such a hide ships, its boundary strips and joins would be cut in the wrong place.
- **Only one hide has an outline:** `newyork-v12-1`. Other hides whose support lies behind a foreground object have not been surveyed.
- **Not done:** real-photo validation, the parked customer game, live QA and deployment. Nothing here is production-ready on this evidence.
