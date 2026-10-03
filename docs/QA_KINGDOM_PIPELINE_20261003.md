# Kingdom on the QA generation pipeline

New QA drafts use `local-patch-world-v1` and pinned scene version 12. They can
select either Journey or The Enchanted Kingdom as one complete world. Each
purchase has nine boards, 27 personal appearances, 54 discoveries and its own
$5 ledger. Time Travel is not registered for this engine.

Kingdom route order: castlegate, fairyforest, dragoncave, icepalace, underwater,
cloudcity, sweetworkshop, giantlibrary, nightcarnival.

The approved masters and measured placements come from `two-worlds-release.ts`.
`wizard-integrated-release.ts` binds their public route names to version 12;
`wizard-kingdom-art.json` pins all nine 3840×2160 WebPs. Existing prepared
960×540 previews match those same masters. No board was re-rendered.

Kingdom authoring briefs no longer assume the pilot child's age, hair or lack
of glasses. Parent-stated age governs the body; the canonical reference governs
identity. The v12 rendering, review and automatic diagnosis policies apply.

Identity style comes from the selected world's nine original board crops. Its
trusted digest is shared by identity preparation, rendering, review and repair.
Unknown board/version scopes fail instead of substituting a current catalog.
Journey's existing v12 art, geometry, hide IDs, catalog entries and identity
fingerprints remain unchanged. Existing paid selections are not rewritten.

The version catalog contains 18 boards; a one-world job still completes after
its own 27 appearances. Mixed or oversized selections are rejected before
provider dispatch. Public art is read from the trusted QA CDN by manifest hash;
function traces contain metadata without duplicating the full-resolution art.

Regression coverage includes:

- All Kingdom master/preview hashes, dimensions, placements and discoveries.
- Independent world choice and historical version preservation.
- Actual source atlas/digests with synthetic identity/provider replies through
  27 renders, 27 independent judgments, delivery, passport saving and replay.
- Independent $5 ledgers and rejection before spending on invalid selections.
- CDN path/hash/MIME/size checks and build trace privacy.

Tests use synthetic people and provider replies. They verify wiring and recovery
contracts; visual quality of a newly generated personal game still requires
observing the actual provider output. No customer images or paid provider calls
are needed for these regression tests.
