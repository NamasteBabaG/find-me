# First-find player report — 12 September 2026

## Evidence and scope

The reported permanent freeze was not reproduced in the open QA game. The
first star was present, browser error/warning logs were empty, and zoom, hints
and a second visible target responded without reloading or clearing progress.

A concrete presentation regression was confirmed: find-any inherited the
legacy automatic find zoom, but skipped the legacy cloud turn that resets it.
The camera therefore stayed focused on an already-found child. This is not
evidence of a server hang, an image-generation problem or a permanently locked
mission reducer.

## Change

Commit `1fa9ce3` skips automatic find zoom only in find-any mode. Manual pan and
zoom, the anchored feedback bubble, earned stars and the found-completion timer
are unchanged. Legacy sequential boards retain their focus/cloud/reset flow.
No game configuration, paid artwork or saved progress was reset.

## Verification

- Independent agent reviewed the change and added four real-viewport tests:
  desktop and mobile successive pointer finds without reset, manual camera
  movement during feedback, and unchanged legacy choreography.
- `npm run check -- --maxWorkers=2`: TypeScript checks succeeded; 169 test files,
  2,440 passing tests and 35 skipped tests, exit 0.
- Isolated browser fixture: desktop 0→1→2→3 stars, next board unlocked and opened;
  at 390×650, another board accepted 0→1→2 with the exact same camera transform,
  one bubble, and no browser errors. Mock providers, generation off.
- Existing live QA game: saved 2/5 survived deployment reload. Another visible
  target produced 3/5 and the Continue control; the camera transform remained
  exactly unchanged before and after the click. No rerender was purchased.

## Deployment

QA only, project `find-me-qa`, branch `codex/qa-five-hides-20260912`.
Deployment `dpl_CqcTPWEG7mnearLykkCTWN7ty5iY` built successfully and was promoted
to the QA alias. Production application/project was not changed.

The user was asked whether the original symptom involved unresponsive controls
or remaining focused on the found child. That distinction was still unanswered
when this verification was recorded; do not claim a separate intermittent
runtime freeze has been diagnosed by this camera fix.
