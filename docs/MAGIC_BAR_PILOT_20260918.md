# Magic pilot — Bar, 18 September 2026

## Scope

Personal playtest of the approved castle v18, giant library v5 and fairy forest
v6. Three hides and six mapped discoveries per board: **9 finds / 18 items**.
This is a deliberately isolated three-board pilot, not a nine-board sellable
Kingdom, a new wizard-generation test or a real purchase. Catalog availability,
payment-provider gates and unrelated games remain unchanged.

## Art and generation

- Approved 3840×2160 masters are unchanged; all full 512×768 hide crops avoid
  every discovery card crop. Source hashes and all generation inputs are pinned.
- Reused Bar's previously reviewed identity, bound to the authorized photo and
  age five. No new identity charge and no original-photo upload to QA.
- Existing v10 painter, retained-purchase ledger and native compositor, with
  explicit $2 pilot reservation ceiling. The generic ledger's own $5 ceiling
  is not the tighter task cap enforced by both pilot wrappers.
- Ten paid image attempts yielded nine approved hides. Forest hide 1 attempt 1
  failed the seam gate (2-pixel translation); attempt 2 passed. Only the latter
  is used. Three grouped judge calls accepted the final nine candidates.
- All nine were also inspected at native size against the portrait, including
  face/curls, clothing, scale, neighbor faces, foreground props and patch seams.
- Actual child hit geometry was measured from the accepted outputs, not copied
  blindly from the proposed masks. The knight's shield and library books remain
  in front of the child as intended.

## Cost actually recorded

| Scope | USD |
| --- | ---: |
| Ten image calls, including rejected attempt | 0.213725 |
| Three grouped visual reviews | 0.008870 |
| **This pilot's incremental total** | **0.222595** |

All calls settled; no unknown costs or pending reservations. This excludes the
previous identity and base artwork, hosting/storage, and human review time. It
is not a promise for a new customer's complete game cost.

## Local end-to-end evidence

- Fresh isolated SQLite, local private assets, disabled generation and mock
  payment. Physical pointer clicks (no injected store/progress) completed all
  three boards, all nine hides and all 18 discoveries.
- Completion, next-board transitions and passport worked. All seven images on
  each passport spread loaded. Changing the castle souvenir from hide 3 to
  hide 1 persisted in `PassportPagePreference`.
- Replay reset the active round to **0/3 and 0/6**. Finishing it again left the
  durable album at exactly **9 finds / 18 discoveries / 3 postcards**, revision
  27: no erasure and no duplicate credit.
- Passport checked at 1440×900, 1366×768, 390×844 and 360×640: zero horizontal
  or vertical document overflow. Chromium viewport checks, not physical iOS.
- Fixed a one-pixel RTL page overflow caused by the off-screen live-region's
  negative margin. It is now anchored inside the scene and still accessible.
- No browser errors in the three full local board runs or replay.

## QA import and privacy

Dedicated project `find-me-qa` (`prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`), Supabase
project `vvqjmaubdjndmjvcfxve`, schema **qa only**. The authenticated connector
was used because sensitive DB secrets are intentionally absent from env exports.
No password reset, gate bypass, grants/RLS change or schema migration.

`scripts/magic-bar-qa-transfer.ts` prepares source-bound SQL but never executes
it itself. Exact PNG chunks resume with a prefix/byte-match fence. Publication
verifies all ten complete SHA-256 hashes before atomically creating the isolated
test owner, family child, GAME assets, three scenes, delivered config and zero-cost
mock order. No local earned progress was copied to QA. The original photograph
and identity sheet were not uploaded. These tables have no anon/authenticated
API grants; files remain behind the normal asset authorization service.

QA game: `game_magic_bar_qa_20260918_v1`. Share/sign-in bearers, render outputs,
inputs, detailed review JSON and screenshots stay in ignored private storage,
never source control or the public asset tree.

## Verification gate

- Initial full check: 253 files, 3,361 pass, 2 expected failures, 35 skipped.
- Final full check during parallel transfer: 252 files pass, one 20-second
  timeout in `fixed-world-staging.test.ts`; 3,360 tests pass. The failed file plus
  the new pilot regressions reran with one worker: **33/33 pass**. No test timeout
  was increased and no assertion was removed.
- TypeScript and adventure catalog validation pass after the transfer scripts.
- QA live results and clean-source deployment receipt follow below.

## Remaining content

Dragon cave, ice palace, underwater world, cloud city, sweet workshop and night
carnival are not rendered/activated by this pilot. Each needs a distinct brief,
six readable interior-safe discoveries, approved art, three hide placements and
its own personal playtest. Refund-provider fencing, PayMe and production/load
release gates stay separate and open.
