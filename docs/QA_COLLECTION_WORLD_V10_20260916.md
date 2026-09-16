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
- Deployment tracing retains the historical PNG catalog and the v10 manifest, not another 110MB of public WebPs. Deployed QA reads the nine exact child-free WebPs from its fixed authenticated CDN origin; MIME, byte bound, redirects and SHA-256 are enforced before rendering. Local tests read the identical disk files. No image resizing or recompression was introduced.

## Evidence so far

- TypeScript passes.
- Controlled-provider integration uses temporary real SQLite, actual QA world selection, actual 4K source reads, real compositing, durable purchase/review receipts, publication policy and album persistence. Result: 27 distinct render dispatches, nine three-hide reviews, delivered config with 27 targets and 54 discoveries. Duplicate collection events are idempotent; other-owner writes rejected; rerunning delivered game dispatches nothing.
- This fixture injects a renderer and reviewer and starts after the identity stage. It does **not** certify real likeness, payment UI, live AI output or a complete browser journey. Those require separate live evidence below.
- Catalog tests prove v9 still has 45 targets, v10 has 27, and all nine shipped WebPs match source hashes and 4K dimensions.

## Release evidence — September 16

- Full `npm run check -- --maxWorkers=2`: 238 files passed, 3281 tests passed, 2 expected failures, 35 skipped. TypeScript passed. `adventures:validate` verifies 27 hides / 54 discoveries and nine exact native 4K assets.
- Runtime code: `79f6b430` (feature commit `2dd4b194`). QA deployment `dpl_5REc18FTFVUaGWkv9DnAeJtxr5RV`, `https://find-me-q0xhmaacx-smallheroes-projects.vercel.app`, READY and promoted to `https://qa.findmeworlds.com`. CLI inspection of the custom domain confirms that deployment. Production shop was not deployed.
- Remote build passes packaging/privacy checks: max route 220,234,146 traced bytes, jobs 218,334,364; 37 catalog files, 10 legacy local-patch files, one v10 manifest. The first attempt including all WebPs correctly failed the 250MB gate and was never promoted.
- An opt-in local integration fixture can be exported by setting `COLLECTION_E2E_FIXTURE=1` for `collection-world.test.ts`. It contains synthetic identity/patches only, starts after identity selection and never uses a paid provider. `scripts/verify-collection-world-browser.mjs` plays the resulting signed-link game with native pointer interactions and DOM assertions. Evidence is local `output/collection-e2e/`; never treat its colored test rectangles as finished character renders.
- Authenticated QA home was opened after promotion. Real QA creation reached the Bar age-five photo step, but Chrome extension file upload is denied until the user enables file-URL access or selects the photo themselves. The draft tab is retained for handoff. No paid render or payment was submitted in this verification turn.

### Still not certified

Live upload → payment → real identity and 27 real renders → publication, deployed CDN reader execution, and likeness/seam quality (especially the newly authored Paris third slot) still require the live run. Local injected-provider and browser success are not substitutes for those gates.

### Existing Arbel run (read-only observation)

The unchanged v9 game `game_ras96hxkd7s3dvth209h` reached `GENERATION_FAILED` at `2026-09-16 14:02:08 UTC`: four appearances lacked a usable accepted render after three attempts. Amazon hide-4, Marrakech hide-2, Giza hide-2, Great Wall hide-5 report moved-border seam failures (best offsets near -3px). No targets, billing, version pins or progress were changed to conceal this failure. It is separate from the new v10 QA release and requires an explicit bounded repair, not a silent re-pin or relaxed seam gate.
