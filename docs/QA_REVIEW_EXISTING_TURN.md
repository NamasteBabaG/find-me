# A named QA turn that reviews existing images

`review-existing/v1` narrows an ordinary generation turn. It is not an image
approval, additional spending authority or a change to a game's pinned questions.
Existing payment, ownership, lease, identity, publication and budget checks still
apply. The default turn keeps its existing behavior.

An authenticated owner or the existing cron credential may explicitly request
`/api/jobs/tick?gameId=<owned-game>&mode=review-existing`. The route accepts this
control only in `APP_ENV=qa` with database storage and a named game. Unknown modes,
an unscoped cron request and other environments are refused before generation.
The creating page does not select this mode or change its normal behavior.

The queue admits only an already generating `local-patch-world-v1` game. It skips
identity generation, source-identity revision, published-world repair, cron
selection and unrelated maintenance. Within the ordinary world slice it may:

- Reconcile existing provider requests and read retained paid answers.
- Run already supported, authenticated free pixel corrections.
- Buy ordinary assessments of saved images, using their normal question keys,
  policies and full reservations. These assessments can cost money.
- Publish and deliver only when all required images pass the normal publication
  policy. A refusal or incomplete image is never converted into approval.

It cannot dispatch new paintings or new paid diagnoses. Both the ordinary render
and automatic diagnosis/repair queues are skipped. An independently staged
quality pilot that still needs its image yields without dispatching or consuming
its authority. `maxHides:0` is not used as this control: the historical image limit
clamps its minimum to one.

The control does not unpark an otherwise ineligible exhausted recovery, reset
attempts, increase a cap, release UNKNOWN reserves or authorize a new question
continuation. An existing assessment can still return a defect; that result is
kept for the subsequent versioned recovery decision.

Regression coverage uses real SQLite and budget services with synthetic provider
responses. It proves ordinary assessment and publication for three saved images
in a 27-hide world, with no image request or attempt for the other 24; refusal of
fresh-world and identity work; staged-pilot exclusion; and API scope checks. A
separate retained-failure case exercises an actual queued diagnosis after two
failed paintings, proves its ledger unchanged in this mode, then proves the next
ordinary turn can still buy its diagnosis. Mutation controls separately reopen
the image queue, diagnosis queue, staged pilot and non-QA route; each must fail at
the relevant assertion.
