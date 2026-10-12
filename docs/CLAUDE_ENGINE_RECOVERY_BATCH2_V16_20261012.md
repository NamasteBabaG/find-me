# v16: age, body and feedback — batch 2 handoff, 12 October 2026

Brief: `docs/CLAUDE_ENGINE_RECOVERY_IMPLEMENTATION_BRIEF_20261012.md`, batch 2. Separate commits after batch 1 (`docs/CLAUDE_ENGINE_RECOVERY_BATCH1_20261012.md`), on the same branch. For Codex's review before any push or deployment.

- **Worktree:** `C:\GNart\Work\find-me\work\claude-engine-recovery-20261012`
- **Branch:** `claude/engine-recovery-20261012`, on top of batch 1 (`053338d1`)
- **Commits:** `44a5c1928e705a54b4ca57669b488d68580331f2` (painter, diagnosis, repairs, identity feedback) and `0f2d979011d66cd5e84d65cb1183809b2ffd6399` (identity sheet style v5); this document is in the commit after them

No deployment, live database, flag change, paid render or provider call. All references and answers are synthetic.

## What v16 is

A new release for **new questions only**, chosen explicitly: `LOCAL_PATCH_PROMPT_RELEASE=v16` (default `v15`; `/api/health` reports it as `promptRelease`).

- A hide row created while v16 is chosen is pinned to `local-patch-prompt/v16-age-body-neutral` and keeps it: its repairs, self-repair diagnosis, redraw and restyle all use it, whatever the flag says later.
- A row created before keeps its own question. v13–v15 are unchanged; a test pins by hash the v15 painter for all 54 hides × ages 3, 5, 6, 8, 10 × three repair sets, the historical v12 diagnosis and the v4 identity sheet.
- An identity checkpoint created for a v12 game while v16 is chosen uses the strategy-first feedback; an older checkpoint keeps its exact feedback.
- A new v12 identity created while v16 is chosen uses identity style v5; an identity already painted keeps its style.
- `childBodyDirection` is unchanged.

## The four findings, and what changed

### 1. Scale: the new child was sized by the person it replaces

28 of the 54 v12 hides sized the child by someone else (measured by the test, against the v15 text):

| Hides | v15 wording | v16 wording |
| --- | --- | --- |
| 21 Journey (Paris, Marrakech, Giza, Tokyo, Great Wall, Sydney, Antarctica) | "Exactly parent-stated age with the source child head and hand scale at this physical depth…" | "Exactly the parent-stated age at the replaced child's physical depth; that child's head and hand size is not a body template…" |
| Amazon (3) | "Same physical depth and head/hand scale as the selected child…" | "…at the selected child's physical depth; that child's head and hand size is not a body template…" |
| New York (3) | "Match the scale of nearby children, with the proportions of a age-appropriate." | "Nearby people show the depth only; the parent-stated age decides height and proportions." |
| amazon-v12-3, amazon-v12-2, fairyforest-v12-3 (support) | "Same natural child scale as the girl", "at the original head size", "at the same scale as the neighbors" | depth only, with the stated age deciding the body |

Every v16 prompt also ends with an **AGE, BODY AND IDENTITY** paragraph:
- the placement fixes only where the child is and at what depth;
- the replaced person and the neighbours are not a template for height, head or hand size, age, gender, hair or clothes;
- a child older or younger than the replaced person is drawn taller or shorter;
- never a scaled-down adult or a stretched younger child;
- Image 2 alone decides face and hair, and age never changes facial identity;
- everyday children's clothes.

The rewrite is sentence by sentence (exact strings, one targeted pattern), so a location is never lost; text that matches nothing passes through.

### 2. Wording that dictated the painted child's gender

- greatwall-v12-1 "His hands hold the same sticks" → "The new child's hands hold the same sticks".
- cloudcity-v12-3 "the taller child beside him" → "the other child beside the new child" (both fields).
- The eleven "Replace ONLY the … boy …" sentences keep their clothing and position with "child". Example: "Replace ONLY the blue-shirt child on the LEFT of the purple-shirt girl reading the wildlife book".
- Neighbours keep their own words ("the girl in yellow", "the elderly woman", "she is NOT a replacement target"): they are locations, not the child.

### 3. The fixed `age8` in the diagnosis

A v16 row's self-repair diagnosis says "Keep the N-year-old body of the BODY AGE CONTRACT: never change its age to fit the window, and never enlarge the head to make the face readable". It also sees the support sentence as its painter read it. Older rows keep "Do not shrink age8 into a toddler…" byte for byte. No age was added to the continuity reviewer.

### 4. Identity repair feedback cut at 1,200 characters

The provider reads the first 1,200 characters of the repair feedback.

**Before:** the feedback was `{checks, reason, diagnosis, attempt}`, and the diagnosis held both reviews' evidence before its strategy. With an allowed 584-character review, the strategy never reached the window. That includes "Build a new skeleton and torso for the explicit age N" (asserted in the lifecycle test under v15).

**Now:** v16 sends `{order, attempt, strategy, checks, candidates, evidence}`, at most 1,200 characters by construction. Only the evidence is shortened, from its end. The strategy (face construction, the body for the explicit age, four complete views) always arrives whole.

### Found while verifying "no forced dark curls": the identity sheet

The v16 painter already uses the reference's own hair, through every repair, self-repair cause and restyle. But the v12 identity sheet prompt (style v4, `character-v6`) told every sheet: "Hair is a few broad curl groups filled with dark paint". The painter then copies the sheet's hair. So a straight-haired, light-haired child could not pass the brief's check.

Style **v5** (`character-v7-reference-hair-identity`) is v4 with only that sentence replaced: "Hair keeps the photograph's actual colour, length, part and texture … straight hair stays straight and short hair stays short; never invent curls or darken the colour."

- **Unchanged:** the atlas, the body contract, the layout and the painted-style rules.
- **Selection:** v5 is chosen for new v12 identities under v16.
- **Acceptance:** it is accepted wherever v12 accepts v4 (publication readiness, the review policies, Kingdom). It is refused for v11, and a sheet whose prompt and style versions disagree is refused.
- **Commit:** separate, so Codex can review or take it on its own.

## Wiring

| Path | v16 behaviour | Test |
| --- | --- | --- |
| Fresh row | pinned from the release at creation | world test: same game, one row v15, one v16 |
| Normal paint and repair attempts | the row's own recipe (`scene-integration-v5`), repair directions included | world test, render test |
| Self-repair diagnosis | stated age, neutral support sentence | paid-repair test (bought diagnosis prompt) |
| Self-repair redraw | v16 recipe and the recovery instructions, reference hair | paid-repair test (render prompt) |
| Restyle | reference hair | render test (checked outside the provider stub) |
| Identity selection | strategy-first feedback for the new checkpoint | lifecycle test, both releases |
| Identity sheet | style v5 for a new identity | lifecycle test (all three candidates), gate test |

## Evidence

- Prompt contracts (`local-patch-age-body-v16.test.ts`):
  - every hide × ages 3, 5, 6, 8, 10 has its age's body contract exactly once, no other age, no `age8` and no scale anchor;
  - between ages 3 and 10 only the body text changes;
  - no hair type is imposed through 13 repair checks, 9 self-repair causes and restyle;
  - the v5 sheet differs from v4 only in the hair sentence;
  - feedback stays within the window.
- Synthetic identities: two flat-colour reference images, standing in for a light short-straight-haired and a dark curly-haired child, receive byte-identical v16 questions; only the image differs. Nothing in the words assumes a hair type. (What a painter draws from them is the controlled render below.)
- Failing without each piece (each undone alone, the file restored and checked by SHA-256):
  - no placement rewrites: 2 tests fail;
  - v16 as a label over v15: 9 fail;
  - fresh rows ignoring the release: the world test fails;
  - the diagnosis keeping `age8`: the self-repair test fails;
  - the identity feedback in its historical order: the lifecycle test fails;
  - the render skipping v16 directions: the restyle test fails;
  - new identities staying v4: the lifecycle test fails;
  - v5 keeping v4's hair: 5 fail;
  - v12 publication refusing v5: 2 fail.
- One existing test was too weak. The restyle test's assertions ran inside the provider stub, where a failure is treated as a provider error, so the render mutation first passed. They now run outside it, for v3, v4 and v5.

## Checks run on the tip

| Command | Result |
| --- | --- |
| `npm run check -- --maxWorkers=4` on `0f2d9790`'s tree | passed: 374 files; 4,855 tests passed, 2 expected failures, 55 skipped; 808 s |
| `npm run scenes:validate`, `npm run adventures:validate` | passed (no content changed; run as CI runs them) |
| `npx prisma db push` on a throwaway SQLite, `npm run build` with CI's synthetic environment, then `git diff --exit-code` | passed: 41 static pages; `finalize-build-traces` read 0 private-asset bytes; `audit-board-catalog-tracing` `status: pass`, `privateLeaks: []`, `problems: []`; `audit-player-performance` `status: pass`; no drift |

## Enabling it (for Codex, after review)

Set `LOCAL_PATCH_PROMPT_RELEASE=v16` on QA and redeploy. `/api/health` then shows `promptRelease: "v16"`. Only new hides and new identities change. To return to v15, unset it; rows and identities created meanwhile keep v16, as designed.

## Not verified

- **Renders:** no paid render was made. A controlled render is the proof these prompts change pictures:
  - two synthetic references, short straight light hair and long dark curly hair;
  - ages 3, 6 and 10;
  - two hides with a scale anchor and one with a gendered sentence;
  - v15 against v16, and identity v4 against v5;
  - judged by eye and by the two HIGH reviewers.
  It needs a spend authorization.
- Outfit variety across hides is untouched (a separate topic).
- iPad performance (separate device acceptance).
