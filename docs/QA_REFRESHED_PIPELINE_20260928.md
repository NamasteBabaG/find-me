# Refreshed creation pipeline and independent body age

## Incident evidence

The delivered Yuval game was created on 28 September with `ChildProfile.ageYears=5`
and all nine scenes pinned to version 10. The owner has now explicitly supplied
the correct age, **8**. Read-only QA database evidence confirms the stored 5;
the available audit does not establish who selected it. Rendering and review both
honoured the incorrect input, including the earlier recovery. No live profile,
paid receipt or delivered asset has been rewritten as if it had used age 8.
The creation form also explicitly asked for age when the photo was taken. That
wording could cause an older photo to pin a younger body; its contribution to
Yuval's stored age is not established. The form and FAQ now ask for the desired
character age, independently of the photograph's facial reference.

The storefront had already switched to the approved refreshed 18-board artwork,
but `sceneVersionForDraft` still chose the density-based v10 Journey release.
The shared New York master is unchanged; the other eight Journey bases differ.
The identity atlas also used the historical board-conditioned catalog. Thus a
newly created game could disagree with the art the parent saw before creating it.

A separate systemic quality gap was found: historical best-of-two
selection could publish a usable identity sheet with a failing/uncertain likeness
or age verdict. The v12 prompt emphasized painting the facial planes like nearby
people. Authored pilot directions also contained a specific five-year-old's body
and curly/brown hair instructions. The retained identity review for Yuval itself
passed all four checks, explicitly against age5; the permissive selection rule
was not what accepted that particular sheet. The contribution of facial paint
instructions to each visual mismatch remains an inference, not a measured cause.

## New release contract

- Main QA creation now selects scene **11**, nine refreshed Journey boards and
  all **27** appearances. It projects the same approved masters, hashes, measured
  placements and 54 discoveries used by the storefront; v10 stays addressable.
- Scene selection, identity preflight, private rendering, board review, automatic
  recovery, final player config, collection cards and build tracing all resolve
  this explicit version. No new test game or paid provider call was made for this
  implementation. The two-world pilot's private personalized outputs are not used.
- Identity style **v3** uses verified context crops from these exact nine masters,
  instead of enlarged faces from the old boards. Character prompt **v5** makes the
  uploaded child's facial geometry/hair authoritative and treats board pixels as
  paint/material/palette evidence only.
- Patch prompt **v13** uses the canonical portrait for face/hair identity. The
  explicit body-age contract reaches initial identity, patches and visual review:
  height at the same depth, torso and limb lengths, shoulders, hands/feet and
  head-to-body ratio follow supplied age independently of the reference body.
  An authored source person's standing height is a scale reference, not an age-8
  height cap. The historical preschool-only repair wording is excluded from v13.
  These are illustration instructions, not individual anthropometric measurements.
- Identity/age failures cannot become a v11 success through best-of-two selection.
  After two failed candidates, the engine persists both reviews' located evidence,
  selects a face-geometry-first/body-construction strategy and queues a new attempt.
  Each candidate/review has a distinct durable billing key; restart and deletion
  retain their existing fences. Historical v9/v10 selection semantics stay frozen.
- Patch recovery after two failures also applies to scene11, preserving identity,
  source hashes and age while changing placement/mask or recomposing retained raw
  pixels. Sol reviews the delivered native target evidence. Likeness, age, scale,
  complete anatomy and an intact picture require positive results. Full27 remains
  mandatory; the old reduced-subset protocol is not enabled for v11.
- The supplied age and an edit link are visible in the ordinary checkout summary.
  No extra approval step is introduced.
- Automatic diagnosis can enlarge a too-small edit envelope within the same crop
  when older-child anatomy needs it, while retaining depth, pose and support.

Existing per-world spending ceilings, unknown-charge reconciliation, paid-order
requirements and private-image protection remain in force. A synthetic passing
test does not establish real-provider visual likeness. Yuval's next actual game
must be created with age8 and verified visually before calling that output good.

## Verification

Focused main-pipeline/identity lifecycle tests passed (32), including a real SQLite
run with two rejected identity/age candidates, a changed third attempt, restart,
six settled purchases and deletion of all candidates. Synthetic providers only.

Catalog/packaging/paid recovery integration passed (45, with20 version-specific
skips), including v11: all27 publication, changed strategy after another failed
review, crash/replay without duplicate charges, retained siblings and privacy.
Historical v8/v10 recovery remains covered. Catalog tests bind generation,
player/config, cards and storefront masters by exact hash and native dimensions.

The full `npm run check -- --maxWorkers=4` passed: 284 files, 3,620 passing
tests, two expected failures and 55 explicit version-specific skips (342.60s).
Scene and adventure validators passed, including all nine v11 native artwork
hashes, 27 hides and 54 discoveries. The main collection test exercised creation,
paid synthetic rendering/reviews, full publication, repeat execution and saved
progress. Real-provider visual quality remains unverified for a new age-8 game.
After the final diagnosis-envelope and form wording review, TypeScript and all
three affected integration suites passed again: 46 tests, 20 historical-policy
skips. The v11 recovery test explicitly asserts the age-8 body contract and
permission to expand the editable envelope rather than shrinking anatomy.

CI, remote build/private-asset audit and QA alias verification must pass on the
published commit before promotion. Deployment IDs are recorded in the release
handoff after completion rather than pretending they exist before dispatch.
