# Explorers / Detectives in the wizard — 9 October 2026

Branch `claude/search-level-20261009`, from the QA release `8e730ee3` (Connect HIGH visual judges). Not pushed, not deployed. Brief: `docs/CLAUDE_EXPLORERS_DETECTIVES_WIZARD_20261009.md`. Codex's review of `8949bff4` found three lifecycle defects and a migration prerequisite; the second round below fixes them (see "Review fixes"). Codex's review of `ebe82372` found a payment-resumption race and a child switch the form could not answer; the third round fixes both (see "Review fixes, third round").

**Nothing a parent sees changes until two things happen, in this order:** the column is migrated on QA, and `SEARCH_LEVEL_CHOICE=on` is set while a Detectives release is registered. With the flag off (the default) the name step, the boards and every price are exactly as before.

## Commits

| Commit | What |
| --- | --- |
| `6e638d55` | Data: `Game.searchLevel`, the additive QA rollout, the pure domain rule, the empty Detectives registry, the flag (and the production bootstrap's column count, 229 to 230) |
| `a04e8ac5` | Flow: the cards, saving and restoring the level, boards by level, the checkout gate, the family path |
| `6b8439ac` | Text routing: which body text reaches each paid stage, and the frozen body text |
| `8949bff4` | First handoff |
| `ebe82372` | Review fixes: per-draft question, sent answers never dropped, exact Detectives checkout, the migration prerequisite |
| this commit | Third round: resumption bound to the exact open order under the payment claim; the name step follows the draft the save will use when the child changes |

## Rollout (Codex)

1. Generate the PostgreSQL client under the QA environment: `vercel env run -e production -- node scripts/prisma-generate.mjs`. It writes the ignored `prisma/generated/schema.postgres.prisma` and a PostgreSQL client. Never `db:push:postgres` or any schema push. The runner refuses to start with any other client and says so, instead of the datasource error the SQLite client gives.
2. `vercel env run -e production -- node scripts/qa-search-level-migrate.mjs --dry-run` is a **rollback rehearsal**: it executes the DDL inside a transaction and rolls it back. It is not a read-only check. Read its report before applying: project `find-me-qa`, the database name, schema `qa`, the unchanged `Game` count, the column shape and the level counts.
3. `--apply`, then `--verify`. Both run under the 5-second lock bound and the advisory lock. They prove no `Game` row changed, assert the exact column shape (nullable `text`, no default) and read the new field through the generated client.
4. Restore the local client: `npm run db:client:local`.
5. Deploy with `SEARCH_LEVEL_CHOICE=off`. Keep it off until `content/worlds/detective-releases.ts` lists a validated release.

The migration's actual PostgreSQL execution has not been run by me: I have no QA database access.

## Rules as built

- **Two facts.** `Game.searchLevel` (`explorers | detectives`) is separate from `ChildProfile.ageYears` (2-10, unchanged). The level is never inferred from age, name, photo, passport or a translated label.
- **NULL is history.** Games and drafts from before the cards keep NULL and play the historical (Explorers) boards. A value outside the closed list is corrupt data and fails closed.
- **Being asked belongs to the draft.** A draft created while the cards are shown is pinned. The pin is an immutable SYSTEM record written in the same transaction as the draft (`src/services/search-level-policy.ts`, like the dual-review pin). Only a pinned draft must answer before payment.
  - Switching the choice on later never adds the question to an older draft or to an open payment.
  - Switching it off never removes an answer that is still owed.
  - One function, `searchLevelTerms`, decides for the name step, its action, the package, worlds and checkout pages, and checkout itself.
- **A sent answer is never dropped.** Three facts stay apart: whether this draft must answer (the server's terms, never the form), whether an answer was sent, and whether that level can be sold now.
  - An unknown value is refused.
  - Detectives that cannot be sold now is `SEARCH_LEVEL_UNAVAILABLE`, before any draft, cookie or payment exists.
  - A sent Explorers answer is kept.
  - A legacy form without the field keeps its legacy meaning.
- **Detectives is sold** only while the choice is on and the world has its own registered release. Switching the choice off stops new Detectives sales. There is never a fallback to Explorers boards.
- **A Detectives checkout sells exactly what is eligible now** (`detectiveSelectionEligible`): whole worlds eligible today, exactly their boards, at the release's version. A withdrawn world, a stray board or another version is refused before any order or session. Explorers checkout keeps its existing rule (the selection pinned at the worlds step).
- **Open payments keep their terms, as that exact order only.** A hosted session that is already open resumes with its pinned boards: the same order and the same session, even if its Detectives world was withdrawn since. Nothing is re-asked under it, and the existing payment fence still blocks any level change.
  - A request let through only to resume carries that order's id. The payment claim re-reads the order under its own transaction and refuses (`SEARCH_LEVEL_UNAVAILABLE`) if it closed, changed or was replaced in between. It never creates, replaces, reprices or adopts an order.
  - Recovery of an uncertain dispatch on the same order is unchanged: the same key, lease, receipts and idempotency key.
- **The name step follows the draft the save will use.** Choosing another child than a saved draft's starts a new draft on save, so the form shows a new draft's terms for that child. Its cards start unanswered: a saved path is never carried to another child. Going back to the draft's own child restores that draft's terms and saved path. A typed new-child name is kept; the age resets on a child change, as before.
- **No hidden default.** Neither card is chosen on a first visit. The age adds a "Suits age N" badge (2-5 Explorers, 6-10 Detectives) that never selects or overrides. A missing answer is said on the spot, and focus moves to the group.
- **Restored.** Back, refresh and reopening a draft return to the saved level. A fresh adventure (`?child=`) starts unanswered.
- **Boards follow the level.** Changing the level drops boards pinned for the other one. Choosing Explorers for a pre-cards draft keeps its boards.
- **A level that can no longer be sold is asked again.** The name step shows the cards; the package, worlds and checkout steps send such a draft there, but never over an open payment. A Detectives world withdrawn after it was chosen is chosen again on the worlds step.
- **Family "add a world".** The cards appear only while that world can be sold at both levels.
  - The level is fixed with the draft and carried through sign-in (closed list only).
  - A sent answer that cannot be sold is refused when a new draft would be made.
  - An existing unpaid draft at the same level stays reachable, so its own open payment can resume. A different level is `DRAFT_LOCKED`.
  - Ownership is unchanged: owning a world at one level is not a second purchase slot.
- **Unchanged:** prices (39/69/99, 30 to continue), the $5 world cap, three hides per board, models, effort, reservations, receipts and publication rules.

## Design

Under the name: "Which path suits you?" / "איזה מסלול מתאים לכם?", then two cards, then the exact age, then the button.

- **Group:** a native radio group inside a fieldset, named by its legend, with arrows, a focus ring and an announced state. The whole card is the tap target (48px floor).
- **Selection:** the wizard's sea rim and ring, plus a tick that pops on the card's corner. Colour alone never shows the choice.
- **Illustrations:** binoculars and sparks for Explorers, a magnifier and footprints for Detectives, in the same stroke family as the board tools. There is no child figure.
- **Layout:** phones stack rows; from 440px of form width the cards stand side by side (container query).
- **Hebrew ranges** use an ASCII hyphen (`גילאי 3-5`).

## The age/body contract

`src/services/generation/__tests__/search-level-age-contract.test.ts` checks ages 3, 5, 6, 8 and 10.

- **What it shows.** The exact age's `childBodyDirection` reaches the v4 identity sheet, the v15 painter, its age repair and the self-repair diagnosis. The HIGH scene reviewer gets the stated age with its clear-category rule. No stage takes a search level.
- **What it does not show.** It covers **which text reaches each stage**, not the appearance of a generated child; that needs controlled renders.
- **Frozen text.** `childBodyDirection` is frozen by hash for ages 2-10, because pinned v13-v15 rows, v3/v4 sheets, gates and diagnoses embed it under unchanged labels.

Gaps found, predating this batch and **not** changed here. They change paid prompts, so they belong in a separate reviewed, versioned change for fresh rows only:

1. **Scale anchored to the replaced child.** 24 of Journey's 27 hides anchor the painter to the replaced child.
   - 21 say "with the source child head and hand scale": Paris, Marrakech, Giza, Tokyo, Great Wall, Sydney, Antarctica.
   - Amazon's three say "head/hand scale as the selected child".
   - New York's three compare with nearby children instead.
   - A constructed Paris v15 prompt for age 3 carries the source-scale phrase next to the age contract.
2. **Gendered words, field by field** (support and occlusion text of the 54 v12 hides):
   - About the painted child, to neutralise: greatwall-v12-1 "His hands hold the same sticks", and cloudcity-v12-3 "the taller child beside him" (the replaced child is "him"). Each is in both fields.
   - Naming the bystander to replace (location identifiers; keep them unambiguous, ideally neutral): eleven "Replace ONLY the … boy …" sentences in amazon-3, paris-1, paris-2, tokyo-2, greatwall-1, greatwall-3, sydney-1, sydney-3, dragoncave-3, icepalace-1 and nightcarnival-2.
   - Surrounding people to preserve (keep): amazon-3, paris-2, tokyo-3, sydney-3, dragoncave-3.
3. **A fixed age in the diagnosis.** `src/services/generation/local-patch-integration-diagnosis.ts:19` says "Do not shrink age8 into a toddler" for every age, including 3.
4. **Identity feedback truncation, which is conditional.** `src/infra/generation/openai.ts:284` cuts the serialised feedback at 1,200 characters.
   - With four checks and a 71-character reason, the skeleton strategy starts at character 926 and survives.
   - With an allowed 584-character reason it starts at 2,465 and is lost.
   - The provider prompt still separately states the body age.
   - Fix: keep the structured repair strategy ahead of lower-priority evidence before truncating.
5. **One outfit per board.** The 54 hides carry no per-hide outfit, so the painter receives the board's shared outfit. That is a prompt-level limitation, not proof that outputs look identical. Keep it separate from anatomy and identity fixes.
6. **No age in two stages, by design.** Restyle preserves the established body, and the Sol continuity reviewer judges head/body connection.

Proposed **v16** for fresh rows, like v15:
- Rewrite comparators at prompt-build time to "same physical depth; the replaced person's head and hand scale are not a body template".
- Neutralise references to the painted child while keeping location identifiers unambiguous.
- Drop the fixed "age8".
- Order the repair strategy before evidence.
- Keep `childBodyDirection` frozen; add a v2 only if the bands need refining.
- Validate with a controlled render of a second synthetic identity (short straight hair) at different explicit ages. No paid render was done or authorised here.

## Detectives release — what activation still needs

Approved art and 27 placements exist (`docs/art/journey-detectives-*.json`; the art itself is untracked in the authoring checkout). A sellable release still needs:

- tracked art with art-manifest entries, thumbnails and presentation entries;
- a catalog plan per board: personal zones, **54 measured discoveries**, postcards, direction, `collectionUi`;
- scene definitions;
- a content version the engine accepts (about 25 checks compare to 12 directly);
- an identity-style source from the Detectives boards;
- publication that accepts authored return windows (Antarctica);
- a second reference child, a full 27-hide run with both runtime judges, and logged-in tap/find/discovery/passport testing.

Only then: one line in `content/worlds/detective-releases.ts`, and the flag. Nothing exists for the Kingdom at Detectives.

## Review fixes (second round)

1. **P1, open checkout trapped by activation.**
   - Fix: the per-draft pin plus `searchLevelTerms`. An open payment is never re-asked or redirected.
   - Tests: a legacy checkout started with the choice off resumes after it is switched on, with the same order and session, no second order, and level edits still `CHECKOUT_IN_PROGRESS`. An asked draft left unanswered is still refused.
2. **P1, explicit Detectives silently becoming Explorers.**
   - Fix: the three-fact handling in the name action and the family purchase.
   - The two tests that blessed the old behaviour were replaced.
   - Tests:
     - A sent Detectives answer after the choice is switched off is refused, with no game, cookie or order, on both paths.
     - A sent Explorers answer is kept.
     - A legacy form without the field keeps its meaning.
     - An unknown value is refused.
3. **P2, ordinary checkout not checking world eligibility.**
   - Fix: `detectiveSelectionEligible` before any order.
   - Tests:
     - Two registered worlds at one version, one withdrawn after it was chosen, is refused with no order.
     - A stray board or another version is refused.
     - The exact release boards are accepted.
     - An open Detectives payment resumes after its world is withdrawn: same session, one order.
4. **Migration prerequisite.** The runner checks that the generated client is PostgreSQL, the rollout section says how to generate it, and `--dry-run` is called what it is. The report names the project and the database.

## Review fixes, third round (Codex's review of `ebe82372`)

1. **P1, a closed payment reopened as a new sale.**
   - The race: the checkout was open, the world was withdrawn, the request passed the resume check, and the parent closed the payment between the ownership and claim transactions. The claim then created a new order and a new provider session for a product no longer sold.
   - Fix:
     - `startCheckout` resolves the exact outstanding order (`outstandingCheckoutOrder`, the fence's own rule) and passes it as `resumeOrderId` to both purchase paths.
     - Inside the claim transaction, an exemption-only request proceeds only while the keyed order is that same order and still outstanding. Otherwise it is refused with no order, transition or provider call.
     - Ownership, lease, closure receipts, the quote check and idempotency are untouched. An uncertain dispatch on the same order is still recovered under its key.
   - Tests (`src/services/__tests__/search-level.test.ts`), each run for **ordinary and family checkout**:
     - The interleaving above is refused (`SEARCH_LEVEL_UNAVAILABLE`), keeps one order (now `CANCELLED`), makes no provider call and leaves the draft at `PACKAGE_SELECTED`. A later retry is refused too.
     - An unchanged open session returns its original URL and order, with no provider call. This is the second round's ordinary-only test, now on both paths.
     - A new attempt for a product still eligible sells normally after a close: a new URL and one provider call.
2. **P2, a child switch the form could not answer.**
   - The bug: an old unpinned draft for one child, after activation. The parent picks another child or "new child"; the action starts a new draft with a new draft's terms and requires the level, but the form showed the old draft's terms and no cards.
   - Fix:
     - The name page also passes a new draft's terms (`freshLevelChoice`) and the saved draft's child (`draftChild`).
     - `NameForm` shows the cards for the draft the save will use: a different child than the draft's (by the action's own rule) uses the new terms.
     - A child change clears the path; the draft's own child restores its saved path. The on-the-spot check follows the same terms.
   - Tests:
     - Component (`search-level-choice.test.tsx`):
       - another saved child and the new-child option each show unanswered cards, refuse on the spot and send the answer;
       - going back hides the cards and sends the legacy form;
       - a pinned draft's saved path is not carried to another child and comes back with its own;
       - with the choice off, no cards appear and nothing holds the form back;
       - a typed new-child name survives switches.
     - Action (`search-level-action.test.ts`): another child (saved or new) starts a new draft on `searchLevelTerms(c, null)`, requires the answer and creates the draft pinned. The draft's own child continues on its own terms with no answer.
   - Browser (local dev server, mock providers, synthetic parent with two saved children and an unpinned draft for the first):
     - the first child shows no cards;
     - the second child and "new child" show unanswered cards;
     - going back hides them;
     - an unanswered submit is answered on the spot;
     - Explorers continues to the photo step;
     - reopening the old draft continues with no choice.
     - In the database: the old draft is unchanged (no level, no pin), and the new draft is the second child's, `explorers`, age 6, pinned `search-level-choice/v1`. No console errors and no 5xx.
3. The feature stays off and the Detectives registry stays empty. Existing games, historical body/prompt versions, prices, the $5 world cap and three hides per board are unchanged.

## Verification

- **Third round.**
  - `npm run check -- --maxWorkers=4`: TypeScript and **372/372 test files, 4,783 passed, 2 expected failures, 55 skipped** (603 s). That is 14 more tests than the second round: service +5 net, action +3, component +6. `scenes:validate` and `adventures:validate` pass.
  - **Failing before, passing after.** Each fix was reverted to `ebe82372` in turn, then restored and checked by hash.
    - The claim binding (`world-purchase-checkout.service.ts`, `draft-checkout-lock.ts`, `order.service.ts`): exactly the two race tests fail (ordinary and family). The other four new service tests pass on both versions; they guard the preserved behaviour.
    - The form (`NameForm.tsx`): 5 of the 6 new component tests fail. The "choice off" test passes on both, as a guard against trapping the form.
  - The three new action tests pass on both versions: the server already started a new draft on a new draft's terms. They pin that half of the contract.
- `npm run check -- --maxWorkers=4` after the second-round fixes: TypeScript and **372/372 test files, 4,769 passed, 2 expected failures, 55 skipped** (486 s). `scenes:validate` and `adventures:validate` pass.
- **Mutation checks.** Reverting each fix in turn failed the new tests:
  - the global-flag requirement: 1 test;
  - the checkout eligibility: 3 tests;
  - the family refusal: 2 tests.

  The first round's two mutations (stale boards, fallback boards) also fail. All files were restored by hash.
- **First-round screenshots** (local dev server, mock providers): Hebrew and English at 1440x900 and 390x844, Hebrew at 320x640 and on a tablet both ways, with no overflow or console errors. The cards' markup and CSS did not change in this round.
- **Not verified:**
  - the migration on the real QA database;
  - a deployed build;
  - the payment race on PostgreSQL. The tests run on SQLite. Under PostgreSQL's serializable isolation the same interleaving can also end as a serialization conflict, which the claim already maps to `CHECKOUT_IN_PROGRESS`, also with no new order.
  - a real screen reader, physical phones and the iPad;
  - the family purchase panel in a browser (its checkout is covered by the service tests);
  - generated images of any kind;
  - anything Detectives at runtime (no release exists).
