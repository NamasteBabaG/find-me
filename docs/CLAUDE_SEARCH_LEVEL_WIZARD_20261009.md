# Explorers / Detectives in the wizard — 9 October 2026

Branch `claude/search-level-20261009`, from the QA release `8e730ee3` (Connect HIGH visual judges). Not pushed, not deployed. Brief: `docs/CLAUDE_EXPLORERS_DETECTIVES_WIZARD_20261009.md`.

**Nothing a parent sees changes until two things happen, in this order:** the column is migrated on QA, and `SEARCH_LEVEL_CHOICE=on` is set while a Detectives release is registered. With the flag off (the default) the name step, the boards and every price are exactly as before.

## Commits

| Commit | What |
| --- | --- |
| `6e638d55` | Data: `Game.searchLevel`, the additive QA rollout, the pure domain rule, the empty Detectives registry, the flag (and the production bootstrap's column count, 229 to 230) |
| `a04e8ac5` | Flow: the cards, saving and restoring the level, boards by level, the checkout gate, the family path |
| `6b8439ac` | Proof: the exact age decides the body in every paid stage; the body text is frozen |
| this commit | This handoff |

## Rollout (Codex)

1. `vercel env run -e production -- node scripts/qa-search-level-migrate.mjs --dry-run`, then `--apply`, then `--verify` — **before** deploying any client that includes commit 1: Prisma selects every `Game` column, so the new client fails on a schema without it. The runner refuses any target but the QA project's `qa` schema with the mock payment provider, holds an advisory lock, bounds locks to 5 s, proves no `Game` row changed and asserts the column's exact shape (nullable `text`, no default).
2. Deploy. With the flag off nothing changes.
3. Leave `SEARCH_LEVEL_CHOICE=off` on QA until `content/worlds/detective-releases.ts` lists a validated release. Even when it is on, qa/production show the cards only while a Detectives world can actually be sold; development shows them for design review.

## Rules as built

- **Two facts.** `Game.searchLevel` (`explorers | detectives`) is separate from `ChildProfile.ageYears` (2-10, unchanged). The level is never inferred from age, name, photo, passport or a translated label. An 8-year-old on Explorers is drawn as 8; a 5-year-old on Detectives as 5.
- **NULL is history.** Games and drafts from before the cards keep NULL and play the historical (Explorers) boards. A value outside the closed list is corrupt data and fails closed.
- **No hidden default.** Neither card is chosen on a first visit. The age adds a "Suits age N" badge (`recommendedSearchLevel`: 2-5 Explorers, 6-10 Detectives) and never selects or overrides. A missing answer is said on the spot, in product copy, and the focus moves to the group; the server checks again and decides whether the cards were asked, never the form.
- **Restored.** Back, refresh and reopening a draft come back to the saved level. A fresh adventure (`?child=`) starts unanswered, like the age.
- **Boards follow the level.** `sceneVersionForLevel` / `worldsForDraft(…, level)`: Explorers is the engine's existing collection; Detectives is only a registered release, filtered to its worlds. There is no fallback: Detectives without a release returns `SEARCH_LEVEL_UNAVAILABLE`, never Explorers boards. Changing the level drops boards pinned for the other one (the worlds step re-pins them); choosing Explorers for a pre-cards draft keeps its boards.
- **Frozen at payment.** The existing `assertNoOutstandingCheckout` fence covers the level: once a payment session is open, a change is `CHECKOUT_IN_PROGRESS`. Checkout refuses an unanswered level where the cards were asked (`SEARCH_LEVEL_REQUIRED`) and a Detectives draft whose release is gone (`SEARCH_LEVEL_UNAVAILABLE`).
- **A level that can no longer be served is asked again** (`searchLevelQuestion`): the name step shows the cards with the stored answer, and the parent chooses; the package, worlds and checkout steps send such a draft back there instead of looping. A family world purchase keeps its frozen level, so its checkout refuses until the release is back: never withdraw a release while drafts on it are open.
- **Family "add a world".** The cards appear in the purchase panel only while that world can be sold at both levels; the level is fixed with the draft, like the age, and carried through sign-in (`worldPurchaseHref(…, searchLevel)`, closed list only). An unpaid draft at the other level is `DRAFT_LOCKED`. Ownership is unchanged: owning a world at one level does not open a second purchase slot for it — the commercial model for that is not defined, so it is out of this batch.
- **Worlds step.** At Detectives, worlds without their own release are not offered, and the step says which ones stay Explorers.
- **Unchanged:** prices (39/69/99, 30 to continue), the $5 world cap, the three hides per board, models, effort, reservations, receipts and publication rules.

## Design

Under the name: "Which path suits you?" / "איזה מסלול מתאים לכם?", two cards, then the exact age, then the button. A native radio group inside a fieldset (named by its legend; arrows, focus ring, announced state), the whole card the tap target (48px floor). The wizard's own selection language: sea rim and ring plus a tick that pops on the card's corner, outside the text, so a phone row never loses a word to it — not colour alone. Illustrations are one family with the board tools (`ToolIcon`): binoculars and discovery sparks, a magnifier and footprints; no child figure, so neither card reads as a gender. Phones stack the cards as rows (two columns left 84px for a word at 320px); from 440px of form width they stand side by side (container query, with rows as the fallback). Hebrew ranges use an ASCII hyphen (`גילאי 3-5`), which stays in order right to left. Reduced motion is the global rule.

## The age/body contract

Proven by `src/services/generation/__tests__/search-level-age-contract.test.ts` for ages 3, 5, 6, 8 and 10: the exact age's `childBodyDirection` reaches the v4 identity sheet, the v15 painter, its age repair and the self-repair diagnosis, and the HIGH scene reviewer gets the stated age with its clear-category rule. No stage takes a search level. `childBodyDirection` is now frozen by hash for ages 2-10: pinned v13-v15 rows, v3/v4 sheets, gates and diagnoses embed it under unchanged labels, so an edit in place would silently change paid questions in flight.

Gaps found and **not** changed here (they change paid prompts, so they need a new versioned recipe, a measured comparison and Codex's lane):

1. All 27 journey v12 hides tell the painter "Exactly parent-stated age **with the source child head and hand scale** at this physical depth" (Amazon and New York similar), which contradicts the body contract ("neither the replaced person's age/proportions is a body template").
2. 20 hide-text fields across the 54 v12 hides name genders. Most identify the bystander being replaced; one describes the painted child itself: greatwall-v12-1, "His hands hold the same sticks". v15 adds a counter-sentence; the text itself still travels.
3. The self-repair diagnosis carries a fixed "Do not shrink age8 into a toddler" for every age.
4. Identity best-of-two feedback is cut at 1200 characters before its "skeleton for the explicit age" strategy.
5. v12 Explorers hides share one board-level outfit, so the three appearances on a board are not varied; the Detectives placements already carry per-hide wardrobes.
6. Restyle carries no age (it preserves the established body, by design); the Sol continuity reviewer carries none (its role is head/body connection, by design).

Proposed **v16** (fresh rows only, like v15): rewrite comparators at prompt-build time to "same physical depth; the replaced person's head and hand scale are not a body template", neutralise pronouns that refer to the painted child, drop the fixed "age8", keep `childBodyDirection` frozen and add a v2 only if the bands need refining (3 vs 4-5, 6-7 vs 8-10). Validate on a short-straight-haired synthetic reference at ages 4 and 9 before activation.

## Detectives release — what activation still needs

Approved art and 27 placements exist (`docs/art/journey-detectives-*.json`; the art itself is untracked in the authoring checkout). Missing for a sellable release:

- tracked art + art-manifest entries, thumbnails and presentation entries for the nine boards (approved versions and hashes are in the authoring JSON; several newer folders are rejected attempts);
- a catalog plan per board: personal zones, **54 measured discoveries** (names, hints and stories in both languages, rects, card crops, protected from the hides), postcards, direction, `collectionUi`;
- scene definitions (copy, stamp, celebration, palette, target slots from the masks);
- a content version the engine accepts — about 25 checks compare the version to 12 directly — plus an identity-style source from the Detectives boards and publication that accepts authored return windows (Antarctica);
- validation: a second reference child, a full 27-hide run with both runtime judges, logged-in tap/find/discovery/passport testing.

Only then: one line in `content/worlds/detective-releases.ts` and the flag. Nothing exists for the Kingdom at Detectives; it is never offered there.

## Verification

- `npm run check -- --maxWorkers=4`: TypeScript and **372/372 test files, 4,759 passed, 2 expected failures, 55 skipped** (589 s). `scenes:validate` and `adventures:validate` passed (no scene or adventure content changed).
- New tests: `src/domain/__tests__/search-level.test.ts`, `src/lib/__tests__/search-level-migration.test.ts`, `src/services/__tests__/search-level.test.ts` (real SQLite: saving, restoring, level change, payment freeze, checkout gates, the family path, no fallback; a synthetic release points journey at v12 only to exercise the plumbing), `src/app/create/__tests__/search-level-action.test.ts`, `src/app/create/__tests__/search-level-choice.test.tsx`, `src/services/generation/__tests__/search-level-age-contract.test.ts`. Two deliberate mutations (keeping stale boards; falling back to Explorers boards) each failed the suite and were restored.
- Screenshots (local dev server, mock providers, `SEARCH_LEVEL_CHOICE=on`, development): Hebrew and English at 1440x900 and 390x844, Hebrew at 320x640 and on a tablet both ways. Each run covers nothing chosen, keyboard focus (Tab from the name lands on the group), each choice, the age badge and, on desktop and phone, a missing answer (the message, both cards marked, focus on the first). No horizontal overflow and no console errors at any size. Sent to Guy, not committed.
- **Not verified:** the migration on the real QA database; a deployed build; a real screen reader; physical phones and the iPad; the family purchase panel in a browser (unit-tested only); anything Detectives at runtime (no release exists).
