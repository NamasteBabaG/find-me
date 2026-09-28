# Launch workstream — 27 September 2026

## Release truth

**Update 2026-09-28:** QA now runs `ad0892c5`, deployment
`dpl_CDvbisdWZF6fPXguvCJeJrjKDqCj`, after passing CI and a clean guarded
deployment. Alias and REST commit metadata verified. See
`QA_WIZARD_INCIDENT_RELEASE_20260928.md` for exact evidence and limits. No public
production promotion, authenticated live-game acceptance or F-A approval.
The failed personal game is NOT repaired by this UI release. A private local
nine-board review now displays the 25 retained generated appearances, with the
six rejected attempts separate. See the generation incident document.
The paragraph below records the earlier checkpoint's starting state.

This is an implementation checkpoint, **not launch approval**. At the start of
this turn the QA alias was verified through Vercel as deployment
`dpl_UpC95RDp4bt8dBtbusYE9dwmNPEc`, code `6b38de99`. No alias, production,
live database, paid game or generation recipe has been modified in this turn.
The earlier experiments at `9837ad40` / `12c68618` remain opt-in only.

## Implemented in this checkpoint

### Passport demo images

The user's screenshot is the `Picture.onError` fallback, not a normal loading
skeleton. The demo now prewarms only its visible public spread when the cover
is near the viewport, and mounts visible images eagerly. Private owner/shared
assets are never speculatively prefetched by this mechanism. Two bounded
automatic retries remain; a compact accessible manual-retry control recovers
after exhaustion without resetting the page, discoveries or stamp. The copy
now honestly says the image failed to load, rather than promising it is coming.

All nine local immutable WebPs decode and match their filenames' SHA-256.
Vercel's source-file listing also contains those nine deployed source files.
Local real-browser checks: Hebrew/English, desktop and 360×640, three images
decoded, turn forward/back works, zero horizontal overflow, no console errors.

**Live cause not closed.** The available QA browser is at the password gate.
The QA middleware intentionally gates static images too; a stale session can
redirect them to login HTML, but that is a hypothesis, not a proven diagnosis
of the screenshot. Requested normal user sign-in, no password in chat.
`scripts/check-passport-demo-assets.mjs` is an optional read-only normal-login
probe for an operator with `QA_ACCESS_PASSWORD` set privately. No cookie minting
or protection bypass. All attempts so far stopped before login because that
sensitive credential was unavailable; there is no live 9/9 claim.

### Storefront honesty and independent worlds

The home page now resolves availability through the same style/version policy
as a new creation draft. An unversioned catalogue may not inflate QA's offer.
The painted 18-board previews remain visible, per the product owner's request,
but are explicitly labelled when they differ from the purchasable scene art.
Unavailable worlds are labelled unavailable. Ownership, availability and art
preview status are separate. Removed the stale prerequisite/difficulty-ladder
claim: worlds are independent choices.

The creation picker may reuse an approved thumbnail only when both art path
and source hash match the draft's exact scene version; otherwise it uses the
actual scene thumbnail or map. This is a temporary truthful presentation, **not
activation of the two-world pilot**. QA's paid-generation catalogue remains
world 1/v10, nine boards × three hides, on its existing artwork. New art must
not be sold until generation/placement and discovery geometry pass acceptance.

### Refinement follow-up

See `passport/REGISTERED_RELIEF_PROBE_20260927.md`. The free registered A/B
reduced boundary artifacts by 35.4%, but fails visual acceptance. F-A remains
open. No new charge, no bulk rendering, no replacement in a game.

### Test reliability

An existing local-patch player test compared expiring signed URLs byte-for-byte
across a ten-minute signing boundary. It now verifies each capability and
compares asset paths plus every geometry/content property separately. It
does not weaken or extend actual asset authorization. Three initial SQLite
test timeouts passed unchanged in an isolated rerun (34/34 across two suites).

## Checkpoint verification

- `npm run check -- --maxWorkers=2`: **274 files, 3,493 passed**, two expected
  failures and 35 skipped, exit 0. Initial unrestricted run had the four
  failures described above; this is the final full run after the correction.
- Both scene and adventure validators: exit 0. Their approval is for content
  structure/art bytes, not personalized rendering or catalogue activation.
- Production-mode `next build`, then trace finalization and privacy audit:
  exit 0, no private leaks and no audit problems. Existing Prisma client used
  (no schema changes or regenerate); explicit mock providers, generation off,
  disposable SQLite path. The dev server uses `.next-two-worlds`, the build
  `.next`, avoiding the prior concurrent-output corruption.
- Largest relevant inspected route closure is about 208 MB uncompressed on
  disk. This is **not** a measurement of a remote Vercel function artifact.
- Local browser evidence described above; authenticated live QA, remote CI on
  these new commits and a post-deployment playthrough are **not** claimed.

## Remaining order / acceptance gates

**New live wizard blocker (28 September, morning):** photo-step return and
blank checkout reported by the owner. Normal reload restored checkout with
photo/world selection intact; root cause is not yet proven. See
`CODEX_WIZARD_INCIDENT_20260928.md` for browser evidence, the timing caveat on
the RSC error and a bounded reproduction plan. Prioritize this before real
purchase/generation acceptance. No application fix has been deployed for it.

**Separate generation blocker:** the owner's subsequent QA run stopped with
25 output appearances and two failures (Antarctica hide-3 likeness; Giza hide-2
seam alignment). Read-only authenticated admin evidence and repair constraints
are in `CODEX_QA_GENERATION_INCIDENT_20260928.md`. No retries or changes were
made; output count is not human visual acceptance. This is not the RSC issue.

**Incident follow-up in progress:** photo POST now leaves via a fresh document
GET; premature guarded-step prefetch is removed and paid-photo resume keeps
its supplied destination. Tests/release remain pending; QA is still `5f0f8759`.
Read retained-byte findings in the generation incident document: Antarctica's
provider relocates the child above the target and deletes a neighbour, then
the bounded compositor cuts the head off. A free widened-return preview was
rejected because it preserves that scene damage. Giza's first retained reply
reproduces the two-pixel seam refusal and a shoe cut at the return boundary.
No paid request, DB mutation, asset replacement or game recovery was performed.

Latest completed independent review is now
`CLAUDE_QA_RECHECK_RELEASE_REVIEW_20260928.md`, reviewing `12028c17`.
Its nonblocking home-wide expiry finding I-4 is addressed in
`CODEX_HOME_QA_RECOVERY_RESPONSE_20260928.md`; read its actual verification
and release status rather than treating local corrections as deployed.
F-A and authenticated live-incident acceptance remain open.

### Overnight independent-review follow-up (2026-09-28)

Claude completed the review of `8d13cc69` / `47f1bf05`; it is distinct from the
older engine sample reports. The findings, reproduced corrections and test
evidence are recorded in `CODEX_CLAUDE_CHECKPOINT_RESPONSE_20260928.md`.
Recovery controls are reachable inside the book, image-failure announcements
are consolidated, and the CI build initializes only its disposable SQLite
schema. This closes neither the authenticated QA image investigation nor F-A.
Check the response document for current gate/release status before deploying.

Further bounded follow-up: `CODEX_DIAGNOSTIC_GATES_20260928.md` records a fixed
false-success exit status in the public-image probe and a read-only cron
observation (29 consecutive 200 GETs, about 1.9–2.8s). Neither resolves live
image diagnosis or the historical timeout under actual generation load.

`CODEX_DRAGON_GEOMETRY_AUDIT_20260928.md` adds offline prop/context preflight:
the arch is clipped by the crop and lies inside actual return permission
(provider mask plus 120 px guard). A wider context alone is not a preservation
fix. No new placement or render was approved; runtime and QA are unchanged.

The preceding independent review, `CLAUDE_LAUNCH_AND_ART_RECHECK_20260928.md`,
reviewed `690c2d29`. N-1/N-2/N-3/T-1 were reproduced and addressed in
`12028c17`: page-scoped failures, compact tile wording, normal QA sign-in
recovery without session extension, and per-crop guard recomputation.
CI `36377617926` passed all 3,540 tests and release gates. QA then ran that
exact commit, deployment `dpl_9v4FLqBL3gBXmFneuEAR8QfDLWNn`; alias and REST
metadata verified, public production untouched. Evidence and next independent
challenge: `QA_LAUNCH_ART_RECHECK_RELEASE_20260928.md` and
`CODEX_LAUNCH_ART_RECHECK_RESPONSE_20260928.md`. The local expired-session
mechanism is proven; the original live incident still needs authenticated
diagnostics. F-A remains open; no paid reference experiment was performed.

Home-wide recovery `5f0f8759` subsequently passed CI `36385279674` attempt 2
(3,549 tests plus build/privacy/drift), then guarded QA-only deployment
`dpl_8ycF2sZufgoGddwJ3ie5QgCZhpvk`. Alias and exact runtime metadata verified.
Attempt 1's font-loader failure and one unchanged successful rerun are recorded,
not hidden. Independent recheck of this new release remains pending.

| Order | Work | Acceptance / dependency |
|---|---|---|
| 1 | Live demo-image fault | Normal authenticated QA image responses, MIME/hash/timing and browser retry; do not call preload a root-cause fix. |
| 2 | Engine art and placement | Approved native/context output through the real runner; fix arch-crossing mask and preserve props, clothes, head/body scale. No bulk v12. |
| 3 | Two-world catalogue activation | Versioned art + 3 personalized hides + 6 discoveries per board; wizard, delivered game, passport and marketing must bind the same release. |
| 4 | Real QA purchase→generation→delivery→play | Multiple distinct identities, interrupted/retried work, owner/guest links, collection, final-board and passport tests; record full cost, not images alone. |
| 5 | Third world | Existing repository has a time-travel world, but its intended theme/content requires owner confirmation. Asked; do not silently turn legacy test art into the new third world. 9 briefs, lighting/wardrobe, 27 personal hides, 54 legible discoveries, shallow composition, UI-safe placement. |
| 6 | Production data and security | Isolated rehearsal + backups, migration inventory, coordinate exposed-credential rotation with every consumer; no blind live migration/rotation. |
| 7 | Reliable operations | Recheck real cron logs under overlap and slow DB; alerts, cross-instance rate limits, real email delivery, retry/refund reconciliation and support recovery. Earlier 504 cause remains unproven. |
| 8 | International storefront | Final USD ladder and price-version semantics; current 22/39/56 USD unchanged, ILS 49/89/139. Prior choice 19/29/49 vs 29/39/49 remains unresolved. Locale is not currency. |
| 9 | Legal / privacy / support | Real operator/contact details and approved policy text, versioned parental consent, retention/deletion checks. Do not invent legal terms or vendor promises. |
| 10 | Public delivery | Production domain/www certificate, metadata/favicon/OG/sitemap, monitoring, end-to-end public rehearsal, and payment-provider sandbox/live acceptance separately. |

## Brief for Claude — independent read-only challenge

Review the checkpoint commits, not the earlier released SHA alone. Use an
isolated checkout; do not modify this shared tree or purchase images.

1. Run the full check and build/privacy audit. Challenge the signed-URL test
   normalization: signatures must still be verified and geometry unchanged.
2. Force demo picture failures, exhaust auto retries, use manual retry, navigate
   and verify stamps/discoveries survive. Check small Hebrew/English toolbar
   layout and confirm no private-image prefetch. Measure actual live responses
   only after normal QA login; don't infer from files in the source listing.
3. Verify home availability matches new QA drafts, unavailable worlds aren't
   offered as playable, mismatched previews are explicitly labelled, and the
   picker cannot substitute a same-route/different-hash painting. Challenge
   whether the interim wording is clear enough; it does not close activation.
4. Recompute the free A/B using the pinned private inputs, check actual protected
   pixels and chroma, and inspect native/context art against the approved
   reference. Numeric improvement is not approval. No paid follow-up.
5. Report blockers with reproducible evidence, including what was NOT checked.
   Do not certify production or bulk rendering from unit-test success.
