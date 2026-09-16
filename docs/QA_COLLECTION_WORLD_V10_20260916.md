# QA wizard collection release v10

## Contract

- New QA `journey` purchases only: nine approved child-free 3840×2160 density boards, three serial appearances each, six mapped discoveries each (27 / 54).
- The same immutable board pixels serve generation, player and collection cards. Existing guided collection tray, album and temporary replay are reused, not redesigned.
- Historical v6–v9 purchases keep their original art, target count and receipts. In particular Arbel `game_ras96hxkd7s3dvth209h` remains pinned to v9 while generation is running. Never rewrite that game's version to v10.
- Identity selection uses the existing bounded best-of-two procedure. Age/identity grouped review now accepts exactly three labeled before/after pairs for v10; historical paid prompt text is preserved.
- No new image model, API key, pricing rule, unlimited retry, manual approval bypass, database migration or production activation.

## Authored geometry

- Adapted approved Bar pilot placement instructions to the supplied child's identity/age, removing Bar-specific curls and fixed preschool assumptions.
- Antarctica first return window moves 32px right while the child's world position is unchanged, so the person is outside the seam band.
- Paris third old placement hits the bottom edge of the source artwork. V10 uses the complete child playing hopscotch instead (window x1300 y1390, person box 275/310/205/350). This is new geometry requiring visual review of the first real render; historical Paris is unchanged.
- Collection validation checks whole returned patch rectangles against collectible/card rectangles, not just child hitboxes.
- Deployment tracing explicitly includes only nine hash-pinned child-free WebPs in addition to historical source PNGs; all other public scenes and private work stay excluded from functions.

## Evidence so far

- TypeScript passes.
- Controlled-provider integration uses temporary real SQLite, actual QA world selection, actual 4K source reads, real compositing, durable purchase/review receipts, publication policy and album persistence. Result: 27 distinct render dispatches, nine three-hide reviews, delivered config with 27 targets and 54 discoveries. Duplicate collection events are idempotent; other-owner writes rejected; rerunning delivered game dispatches nothing.
- This fixture injects a renderer and reviewer and starts after the identity stage. It does **not** certify real likeness, payment UI, live AI output or a complete browser journey. Those require separate live evidence below.
- Catalog tests prove v9 still has 45 targets, v10 has 27, and all nine shipped WebPs match source hashes and 4K dimensions.

## Release gate

Pending: full regression results, remote build/tracing audit, browser creation and play journey, QA deployment identity. Do not describe these as complete until recorded.
