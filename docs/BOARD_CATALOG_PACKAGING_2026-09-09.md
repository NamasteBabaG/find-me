# Recoverable board-catalog packaging

The active local catalog was revision `world-fixed-20260909-v3` and referenced
36 static assets under `world-fixed-20260909-v2` (about149MB). Keeping two complete
revisions in one server trace could exceed the250MB uncompressed route limit.

The minimal packaging strategy is one active revision, with old artifacts moved
recoverably under ignored `work/` after a replacement is fully validated.

## Staging and promotion

Do not run these commands until the final nine-board authoring manifest is
approved. Staging is local only; neither command deploys or calls providers.

```powershell
npx tsx scripts/export-board-conditioned-catalog.ts --manifest=FINAL_MANIFEST_PATH --revision=world-fixed-20260909-v4 --asset-revision=world-fixed-20260909-v4 --output=content/board-conditioned-qa/catalog-v4.json
npx tsx scripts/promote-board-conditioned-catalog.ts --staged=content/board-conditioned-qa/catalog-v4.json --archive=work/catalog-packaging-archive-20260909/pre-v4
```

The second command is a read-only plan. It reports the current catalog SHA and
inventories all36 old/new files. Apply with the exact SHA from that plan:

```powershell
npx tsx scripts/promote-board-conditioned-catalog.ts --staged=content/board-conditioned-qa/catalog-v4.json --archive=work/catalog-packaging-archive-20260909/pre-v4 --expected-current-sha=SHA_FROM_PLAN --apply
```

Promotion requires a fresh archive path, refuses symlinks/junctions, checks every
asset hash, and refuses to move an old directory containing any undeclared file.
Old and staged asset directories must be disjoint. It moves the old asset folders
and catalog into the archive, then promotes the staged catalog. Nothing is
deleted. Exact moves and hashes are recorded in `PROMOTION_PLAN.json` and
`PROMOTION_RESULT.json`. On a failed move it reverses completed moves without
overwriting intervening files, and records any manual-recovery need.

## Server traces

`next.config.ts` derives its explicit37-file include list from the active catalog,
not a hardcoded asset revision. The post-build filter removes undeclared files
under `content/board-conditioned-qa/`, in addition to existing private/CDN
exclusions. The independent audit rejects stale revisions, missing files, hash
changes, private leaks and oversized route closures. Archived private artifacts
are excluded from deployment.

Tests use synthetic files and cover dry-run safety, complete recoverable
promotion, changed approval/hash, undeclared old files, unsafe/archive-reuse
targets, overlapping asset revisions, stale-trace rejection and idempotent
filtering. They do not claim rendered-image quality or remote deployment size.

## Actual local v4 promotion and verification

Completed from the parent-approved authoring manifest
`work/open-placement-20260909/world-runtime-manifest-v3.json`.
This includes the new Greatwall tower direction, not the rejected lantern
position. Greatwall's existing paid-source proof remains separate from its new
future-generation direction; Antarctica is authored/prepared, not a claim of a
completed new source. This catalog is a private-QA candidate, not semantic
approval of all27 generated appearances.

- Active revision: `world-fixed-20260909-v4`.
- Active catalog SHA256:
  `575a0c89070422c717131bf504a4ca09f099abaa62138faab76523e2be628a51`.
-36 static PNGs:149,159,468 bytes;9 boards and27 foregrounds.
- Child images exported:0.
- Old catalog and149,093,038 bytes of old static assets were moved recoverably
  to `work/catalog-packaging-archive-20260909/pre-v4`;0 files deleted.
- The archive includes `PROMOTION_PLAN.json` and `PROMOTION_RESULT.json` with
  exact original/destination paths and file hashes.
- `npm run build`: passed, including TypeScript, page generation, final trace
  filtering and the independent catalog-tracing audit.
-41 NFT manifests checked. Generation route closure:198,584,564 bytes with all37
  active catalog files. Largest route closure:199,952,401 bytes.
- Missing files, private leaks, stale catalog files and duplicate public-CDN
  scene art in server closures:0.

Those byte counts are local Windows NFT closures, not a measurement of remote
Linux/Vercel function artifacts. No deployment, database write, live provider
call or automatic release was performed by this packaging step.
