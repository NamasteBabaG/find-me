# Worlds, replay and friends: design polish review

Claude's four completed commits (`8797d68d`, `b777ef9d`, `56e8f3db`,
`4e312d6e`) were integrated without altering his worktree. The source handoff is
`CLAUDE_WORLDS_FRIENDS_POLISH_20261005.md`; its remaining-issue section describes
the original handoff, before the fixes below.

## Review fixes

- Completion keeps a quiet, labelled map icon beside replay when the primary
  action does not already return to the map. The toolbar beneath the overlay
  is no longer the only touch route out. Replay and earned achievements remain
  separate; the last round has no duplicate map action.
- Historical games without a world map retain the full-game start-over action
  on their grid. Starting a round preserves earned progress and passport data.
- A successful automatic guest save dismisses the obsolete unsaved sheet. It
  does not switch players: switching still requires another explicit request.
  The outgoing player's in-flight and newer buffered finds must be saved first.
- Mixed historical two/three-find thresholds use neutral instructions rather
  than promising the lowest threshold for every board. Uniform current worlds
  continue to show their precise counts.
- Guest switching copy says "progress" in Hebrew and English, distinguishing
  it from the optional discoveries. The parent-area link has a quiet 48px
  target and press/focus feedback; its space is included in the map's budget.
- The opening passport frame reserves the reader's toolbar and footer, and its
  retry control reaches 64px. A narrow completion card uses a bounded grid and
  container width so its actions do not cause horizontal scrolling.

## Validation and limits

- Full `npm run check -- --maxWorkers=4` passed: 344 test files, 4,342 passed
  tests, two expected failures and 55 skips. Scene and adventure validators
  passed. The local production build and route/private-asset audit passed with
  no private leaks or audit problems, using a disposable SQLite database and
  mock providers with generation disabled.
- TypeScript and focused regression suites passed: navigation 41, guest sync
  42, mixed-instruction/gift coverage 18.
- Independent local browser checks used an isolated SQLite fixture, geometric
  figures and published demo artwork, with generation disabled and mock
  providers. No customer photographs, live orders or image-provider calls.
- Hebrew owner flow: new round, three actual finds, completion, direct map
  exit, return to saved progress, passport and friend reports. At 320x640 the
  completion overlay's client and scroll widths are both 320px; all four
  actions are visible and at least 64px tall. At 390x844 the parent link is
  48px and the map has no document overflow. The 768x1024 passport opens with
  loaded imagery and 64px memory actions.
- Guest flow: independent zero-find progress, selected nickname mark, a busy
  save indication before switching, and a fresh second participant. Report
  updates remain marked during reading and clear after closing.
- Orientation selection and English strings are covered by automated tests;
  browser viewport checks are not physical-device tests. The user-approved
  X close and absence of a tablet orientation tip are retained.
- The passport keeps its existing three-target/six-discovery contract. Old
  formats stay playable without newly issuing passport stamps. The generation
  engine, 27-hide current worlds, $5 per-world budget and commerce rules are
  unchanged by this release.

QA publication must follow the exact pushed commit's completed quality gate,
the dedicated QA project's READY build and its private-asset audit. Generated
publication evidence lives in ignored `output/friends-world-release/`; this
document alone is not proof of a live deployment or a new image-generation run.
