# Scoped recovery and occluded-body age assessment

## User intent

The existing Omer age-five game completed its normal three-attempt policy with
three unresolved hides. The user authorized one additional diagnosed attempt,
then clarified that natural face-only occlusion must not fail solely because
the hidden body's age cannot be assessed. The normal global maximum remains
three. No old purchase or attempt counter is reset.

## Current plan

- Amazon hide five keeps its existing attempt-three pixels. A new LOW grouped
  review asks about visible head scale and canonical likeness, not hidden body
  proportions. This authorizes a review only, never a fourth Amazon image.
- Sydney hide five receives one fourth image with an owned, site-specific rock
  and surfboard registration instruction.
- Great Wall hide five receives one fourth image with an owned, site-specific
  parapet/brick and bystander preservation instruction.
- The inclusive USD4 ledger is unchanged. All paid reviews and images use the
  existing server queue, retained purchase store and `purchaseOnce`.

The extra-attempt administrator action freezes exactly the selected row IDs,
old paid evidence, canonical identity, game ownership and order, original scene
art, all unaffected image bytes and geometry, and genuine prior approvals.
Replays use the same request keys. No fifth image is permitted.

## Age policy

For authored peeking placements with natural occlusion, an explicit age `unsure`
can remain an honest warning when canonical likeness, face readability and seam
checks pass and the normalized reply has no faults or contradictions. Scale is
still independently required. Simultaneous scale uncertainty requests only a
scale correction, not an invented body-age correction.

A real age failure, malformed evidence, an unrecognizable face, or a visible
oversized/ambiguous head does not receive this exception. The raw model result
is never rewritten into `pass`. Publication uses a distinct hash-bound policy
record with its contextual warning.

New scoped reviews use the explicitly different `visible-body-v1` question and
request-key suffix; historical paid question fingerprints remain unchanged.

## Preservation and restart

The 42 previously generated images remain byte-identical. Of these, 38 already
have genuine completed approvals; four Great Wall siblings receive their first
real review when their final hide is usable. A failed first sibling review does
not authorize repainting it. Amazon also retains its old third image and bill.

New generated assets and retained requests are included in privacy inventory
before provider dispatch. The scoped authority's copied assessments are redacted
on deletion, while accounting survives. Publication is fenced against a stale
worker, deletion, identity or order changes and modified scope.

## Verification scope

Synthetic providers exercise the actual SQLite/CAS ledger, retained FileBlob
store, queue claim, target publication and final game assembly. Separate tests
cover lost publication acknowledgements, fourth-attempt replay without rebuy,
the two-render/one-review-only plan, preservation of prior images and judgments,
terminal failure without a fifth purchase, and authentic contextual approval
without changing Amazon's pixels or raw age result.

Visual quality and remote latency still require the controlled QA run. Passing
tests do not establish that a provider will preserve the background.

Verification before deployment: both TypeScript projects passed; full `npm run
check -- --maxWorkers=4` exited zero on 13 September 2026: 200 test files,
2,965 passing tests and 35 intentionally skipped. Independent agent review of
the authority, queue, browser boundary and publication flow found no remaining
concrete blocker. These results do not claim that the live repairs have run.

## QA rollout and remote staging

Commit `9d50651` installed the scoped flow. The first live administrator staging
transaction failed at its final job update with a closed-transaction error; the
30-second transaction rolled back, leaving zero grants and no provider dispatch.
Read-path review found no nested or escaped transaction. Commit `40445bd` gives
only this explicit, one-game administrator stage 120 seconds inside its
300-second route. Worker fences keep their existing short timeout. Seven real
SQLite authority tests and TypeScript passed after that narrow change.

QA deployment `dpl_4gX4qNbMxHB39NG85o3Z2ARWRHJW` is the promoted `40445bd`
build. Both QA aliases point to it; the public production alias is unchanged.
At 2026-09-13 13:32:09 UTC the immutable grant committed successfully for
`game_reuse_97a33e8ea6146e96763a071b1944`, followed by the queued transition.
Live scope is exactly Sydney and Great Wall images, Amazon review only, and
three possible new grouped reviews. A board without a usable new image does not
buy a review merely to consume that allowance.

At 13:37 UTC Sydney's fourth purchase had settled for USD0.022694 (rate-card
estimate). Its retained picture was refused by the unchanged registration gate
at shift (-2,+1); no fifth purchase is authorized. The visual inspection of the
raw crop alone is not a proof of an invisible seam in the composed board.
The inclusive settled estimate at that point was USD1.482228, with no pending
or unknown charges. Remaining scoped work was still in the server queue.

## Completed bounded live round

At 13:39:38 UTC the server stopped cleanly at `local-patch:quality-failed`:
43 generated appearances, seven complete boards, two unusable appearances.
Sydney and Great Wall each purchased exactly one fourth image. Neither
purchased a fifth image or a grouped review for an unusable candidate. Amazon
purchased one `visible-body-v1` grouped LOW review; its original third image
was accepted with every normalized check `pass`. Its raw reason refers to a
standing body, although the visible target is mostly a face behind foliage;
do not treat that prose as a verified body-age measurement. Hidden body age is
not required by the new contextual policy.

Read-only SQL SHA-256 comparison against the frozen authorization proved all
42 unaffected image payloads and Amazon's existing image byte-identical. All
38 already-completed unaffected judgment strings also remain identical. The
four Great Wall siblings still await their first review because hide five is
unusable; 43 generated images must not be described as 43 quality approvals.

The new settled estimates were Sydney USD0.022694, Great Wall USD0.022589 and
Amazon review USD0.004375: USD0.049658 incremental, USD1.509192 cumulative.
All are rate-card estimates, not a provider invoice. No pending or unknown
charges remain. The heartbeat was paused; no further purchase is authorized.

## Independent border-detector regression and paid-image diagnostic

The alignment sampler used lines at `x/y=12`, immediately outside the actual
12-pixel border band. This can both mistake an interior repaint for a shifted
join and miss a genuinely shifted join when the interior is unchanged. A
synthetic example with a byte-identical outer band was wrongly refused.

The corrected sampler uses a fixed common set of actual border-band pixels
whose full search neighborhood stays inside the image and inside the band.
Thresholds, search radius, fade width and composition geometry are unchanged.
Five regressions cover both false refusal and concealed real border movement;
restoring the old sampler makes four of them fail.

The two already-paid rejected shipping crops were exported through the
authenticated administrator page for a local diagnostic, without a provider
call or live-data write. Frozen scene-art hashes were verified. Running the
old sampler independently reproduced both live reports exactly, confirming
the correct source pixels, mask and native return region were used:

| Hide | Native return rectangle | Mean difference | Old shift | Corrected shift | Result |
| --- | --- | ---: | --- | --- | --- |
| Sydney5 | 2737,748 / 335x380 | 12.6068298762 | -2,+1 | -2,+1 | Refused |
| Greatwall5 | 2566,884 / 340x420 | 37.8478826993 | -3,-1 | -2,-3 | Refused |

Great Wall also independently exceeds the unchanged mean-difference limit24.
Thus this real detector bug does not explain away the remaining live failures.
No old rejection, image, attempt count or publication binding was rewritten.

Final full regression run after the detector correction: `npm run check --
--maxWorkers=4` exited zero, 200 test files, 2,970 tests passed and 35 skipped,
349.04 seconds, 13 September 2026. Both TypeScript projects are included in
that command. A separate agent reviewed the sampling geometry and found no
blocking defect. No provider was used by this regression run.
