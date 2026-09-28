# Yuval terminal-v10 bounded repair — 28 September

## Outcome

The owner authorized reuse of the existing OpenAI credential after the stated
scope of one image per failed hide plus quality reviews, total at most USD 1.
That exact round has now run: two images and two reviews. No live game, asset,
job, order or original ledger was modified. The game remains unplayable; this
is NOT a completed repair or a release.

| Candidate | Image micro-USD | Review micro-USD | Result |
|---|---:|---:|---|
| Antarctica hide-3 | 53,344 | 1,514 | Rejected: intended target displaced upward |
| Giza hide-2 | 52,774 | 1,095 | Visually promising; review unsure on occluded ground contact |
| Total | 106,118 | 2,609 | 108,727 micro-USD = USD 0.108727 |

Amounts use the existing conservative rate card, not an invoice. The local
ledger has no pending, unknown, conflict or overrun requests. Its generic world
limit is USD 5; the additional request guard enforces this round's stricter USD 1
cap and exactly one image/review key per selected hide. No retry grant exists.

## What changed in the trial

Used the actual existing image adapter and retained-purchase boundary, MEDIUM
quality, historical v10 scenes, the existing canonical illustrated portrait
quadrant, and the unchanged bounded compositor/thresholds. A separately versioned
candidate recipe adds target-specific placement instructions to the v12 prompt.
This is NOT an assertion that the unchanged production v12 recipe was tested.

Antarctica instructions explicitly distinguish the LOWER standing child from
the upper kneeling child and require the original feet/ground line. Giza is an
insertion/peeking location behind objects, not replacement of a person. No
original photograph was exported or sent in this round. Both use the private
gallery reconstruction as context, with the other two retained appearances.

Candidate tooling uses only an explicit private SQLite file, never the app DB.
Prepared manifests pin source/composed image, identity, mask, prompt, render
policy, snapshot, scope and budget. `--execute` requires an already prepared
manifest. Immutable input changes refuse. Request fingerprints are retained
with the paid answer. `--replay-check` replaces the provider boundary with a
throw: both image purchases replayed successfully without reaching it.

## Visual and technical findings

Both candidates pass the existing compositor permission without changing
thresholds. Their raw seam classifier still reports a (0,1) shift, admitted by
the existing one-pixel-per-axis rule; neither is a byte-perfect/clean-seam claim.
That technical permission is NOT sufficient.

Antarctica: the whole face is now present, and the upper kneeling neighbor is
retained, but the new child starts around crop y=250 instead of the intended
y=368 region and stands over 100 pixels above the required ground line. The
review independently flags displacement, scale and age proportions. Native visual
inspection also flagged the lower boot/background region for investigation;
do not state that orphaned-foot diagnosis is conclusively established. The
candidate is rejected regardless. Head completeness alone did not fix placement.

Giza: full face and curls fit the target region, with a coherent peeking pose
and natural foliage occlusion. No sliced shoe or head is visible in the raw
reply, shipping crop or full-board review. The reviewer passes identity, age,
style, scale and scene completeness but returns overall `unsure` because feet
are concealed. Its raw reply is evidence, not a normalized passing runtime
verdict; it uses the field `brief reason`. Do not auto-publish it or weaken gates.

## Evidence and preservation

Private, ignored evidence: `tmp/incident-yuval-repair-20260928/` contains the
immutable input manifests, normalized portrait, raw provider bytes, raw/shipping
crops, full-context boards, review requests/replies, purchase SQLite and ledger
audit. `index.html` is a private side-by-side review, not browser-verified because
the earlier file-URL/server restrictions remain in force. Do not upload it.

Original 27-row export SHA256:
`b568d40acce16945b262038c442c345c93ac9bbba8b66c68cb8e400365d9675b`.
Preserved 25-row aggregate:
`32e1c675299cacf97357323247daa73b86c672b848b85f620005e0be4d9cb553`.

Fresh read-only QA query confirms GENERATION_FAILED, no config and no active
QUEUED/RUNNING job. The job row is DONE with the quality-failure error; distinguish
this from the game's FAILED status. The first preservation probe accidentally
omitted three selected columns and correctly refused. Repeating the query with
the original complete export shape passed all 25 canonical row hashes. This
does not claim every private asset was independently re-downloaded again.

## Verification

- 18 focused tests pass, including snapshot corruption/scope/preservation and
  one-shot purchase keys, strict cap, wrong world, invalid reservations and
  distinct replacement/insertion prompts.
- TypeScript passes after the review path's required fetch argument was fixed.
- Both retained image replay checks pass with a throwing provider boundary.
- Full `npm run check -- --maxWorkers=2` completed with exit 0: 279 files,
  3,569 passed, two expected failures and 35 skipped, 510.35 seconds. Log:
  `tmp/incident-repair-check-20260928.log`. No suite was restarted for silence.
- No runtime imports, live DB writes, asset promotion or deployment in this round.

## Remaining work / independent review brief

1. Challenge exact manifests, cap/retention behavior and the two images in context.
   Do not mistake numeric seam success for visual acceptance.
2. Antarctica needs a different spatial input, not another identical retry. A
   target-centered context window is prepared as an unpaid design hypothesis:
   provider crop `(2531,926,512,768)`, provider mask `(163,248,171,377)`.
   Offline arithmetic proves the SAME world target `(2694,1174,171,377)` fits
   the original return `(2574,1054,411,520)` and shipping crop. The old compositor
   applied blindly to the new crop would extend the return downwards; DO NOT
   use that as the implementation. A future adapter must cap to the original
   return and prove other-hide/neighbor preservation. Private source preview
   and plan are retained; no new render and no proof of visual success.
3. No further image purchase is authorized by this one-per-hide round. Retain
   Giza; do not spend on it again merely because Antarctica failed.
4. Even after acceptable images exist, implement/test a versioned terminal-v10
   publication/finalization path preserving all 25 outcomes, original receipts,
   owner/game binding, jobs and transition fencing. Never force status or reuse
   v8/v9 repair tools. No playable config exists yet.
5. QA still runs ad0892c5. General art gate F-A remains open. No release for these
   private candidate tools/evidence; public production remains untouched.
