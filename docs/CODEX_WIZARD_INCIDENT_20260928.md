# Live QA wizard incident — 28 September 2026

## Scope and release

User reported photo-step return after upload, followed by a blank `/checkout`
after choosing one world. Inspected source at documentation tip `e3f7dd13`;
the browser's loaded chunk URLs identify deployed `dpl_8ycF2sZufgoGddwJ3ie5QgCZhpvk`
(runtime `5f0f8759`). No application changes or deployment in this investigation.

## Observed, not inferred

- The supplied photo-step screenshot displays the saved-photo notice. That
  notice is driven by the server's `originalPhotoAssetId`, whereas the image
  preview and consent checkbox are local component state. An empty upload UI
  is therefore not evidence that storage lost the photo.
- Inspected the user's existing authenticated Chrome checkout tab without
  exporting cookies, reading credentials, or submitting a form. Its document
  was `complete` with empty visible body text. The tab title was checkout.
- A normal reload recovered the summary, uploaded-photo display and one-world
  selection: nine places, 27 hiding spots. No payment or generation was started.
  Left the user's tab open. No private screenshot/photo/email is included here.
- During the reload observation, the browser captured `Failed to fetch RSC
  payload for .../create/scenes. Falling back to browser navigation.
  TypeError: Failed to fetch` at 07:35:30 UTC. This occurred at the reload
  boundary and may represent a cancelled in-flight request. It is NOT proof
  of the original blank screen's cause or of a server-side error.
- Vercel connector runtime-log query returned 403 access denied, not an empty
  log result. No server-log diagnosis is claimed.

## Source-backed hypotheses / next reproducible checks

`PhotoUploader` explicitly prefetches `/create/package` before photo storage,
then uses `router.push` after its POST returns. Package rendering redirects
to `/create/photo` without an original asset. The POST awaits storage and
the database update but does not invalidate the client router cache. A cached
guard redirect is a plausible explanation, not yet a reproduced conclusion.

`PackagePicker` prefetches both scenes and checkout; `ScenePicker` prefetches
checkout. Checkout redirects to scenes when the summary is incomplete, and
scenes redirects to checkout once all offered worlds have been selected.
Test the entire navigation sequence in a production-mode local build with
synthetic data, recording the pre-mutation prefetch and post-mutation response.
Do not assert a redirect loop merely from these conditional redirects.

### Framework-source check (08:13 UTC follow-up)

Read the installed Next implementation, not an assumption about generic SPA
caching. `app-router-instance.js` defaults imperative prefetch to `FULL`.
However, `server-action-reducer.js` applies returned Flight data, can clear
the prefetch cache when seed data is present, and seeds the redirect target
with the action response before redirect navigation. Package/world selection
uses these Server Actions; photo upload uses a separate fetch POST followed
by `router.push`. They are therefore different cache paths. Removing early
prefetch might mitigate the photo case, but cannot yet be claimed to repair
the blank checkout. The exact response/redirect chain and timing must be
captured before selecting a shared fix. No dependency or application code
was changed by this read-only check.

Next acceptance: normal photo upload -> package -> world -> visible checkout
without refresh; saved-photo resume; Hebrew/English; slow/failed RSC request;
no duplicate POST/payment/generation. Capture network failures before reload,
and separate aborted requests caused by reload from the original incident.
Do not reproduce by charging the user's draft or uploading a private photo.

The attempted local diagnostic-server shell command was rejected by tool
policy; it did not start. No alternate execution path was used to evade that
denial. Browser recovery is verified; a durable source fix is not.

## Claude handoff

Investigate against runtime `5f0f8759`, with an isolated synthetic fixture.
Challenge the router-cache hypothesis independently before recommending a fix.
The prior full gate and home-image recovery approval do not cover this live
wizard incident. F-A and launch acceptance remain open.

## Scoped correction under verification

Photo upload now navigates with a normal document GET only after the POST
reports successful storage. This bypasses stale client-prefetched guard results
without submitting the upload, checkout or generation twice. Explicit premature
prefetch was removed from the four wizard steps; Server Action post-save
redirects are otherwise unchanged. Saved-photo continuation also now respects
its supplied `nextHref`, fixing the separate paid-photo recovery case that
previously hardcoded the new-order package route.

Admin rejected-image previews now use contain rather than cover and open the
full authenticated asset in a new tab. This is evidence visibility only, not
a repair of the generation outputs.

Targeted jsdom suites initially passed 3 files / 10 tests: slow successful
upload navigates once after storage, repeated clicks do not duplicate POST,
decode/encode/network failure do not navigate, and paid-photo resume preserves
its destination. The final full check passed (exit 0): TypeScript, 277 files,
3,551 tests, two expected failures and 35 skipped, 699.99 seconds. Both content
validators passed. Production build with mock providers and the local disposable
SQLite fixture also passed, exit 0; private-asset audit reports no privateLeaks
or problems. Logs: `tmp/wizard-incident-check-20260928.log` and
`tmp/wizard-incident-build-20260928.log`. No release yet.
Production-browser reproduction of the original
blank checkout remains open. Removing speculative prefetch is a conservative
mitigation, not a proven diagnosis of that separate blank screen.

Review the changed components for unnecessary effects, dependency changes and
client/server boundaries: this change removes four speculative effects, does
not add a library, keeps mutation authority server-side, and retains the existing
button styles and consumer translations. No generation pipeline was modified.
Private retained-reply diagnostics are explicitly excluded by `/tmp/incident-*`
in `.gitignore`, in addition to the existing deployment exclusion of all `tmp`.
