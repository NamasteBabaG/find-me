# Scripts: production tools versus historical authoring

All tracked TypeScript scripts compile through the root tsconfig and npm run check.
That is a type-safety claim, not permission to run them and not proof that their
private input pictures exist. scripts/ is never imported by production src/.

## Entry-point map

| Kind | Entry points | Side effects |
| --- | --- | --- |
| Local verification | validate-scenes.ts, validate-adventures.ts, build trace audits | Read-only validation; no paid providers |
| Local album pilot | pilot-test-board.ts, pilot-game.ts | Draws the marked 16:9 dummy board and creates the pilot game in a LOCAL file: database only (refuses anything else); public demo art, no photo, no provider, no money. See docs/ADVENTURE_PILOT_2026-09-14.md |
| Build/setup | prisma-generate.mjs, prisma-sql.mjs, finalize-build-traces.mjs | Generated local files; schema commands are separately guarded |
| Product diagnostics | game-status.ts, inspect-five-hide-layout.ts | DB reads / local previews; require the correct owned QA inputs |
| Marketing | refresh-hero-found.ts, build-demo-assets.ts | Public demo assets, explicit apply where supported; never customer images |
| Paid local-patch pilot/recovery | local-patch-style-pilot.ts, resume-local-patch-repairs.ts | Real spend/writes when enabled; explicit scope and budget required |
| Environment/deployment | qa-secrets.mjs, qa-env-preflight.mjs | Preflight inspects; secrets script changes real settings |
| Historical authoring | fixed-*, board-conditioned-*, author-*, slot-patch.ts, prepare-boards.ts, rejudge.ts, character.ts | Different generations of contracts; may call providers or rewrite assets |

The HTTP creation path is in src/services/generation/pipeline.ts and queue.ts,
not character.ts, prepare-boards.ts or a private work/ runner.
Do not use a historical CLI to repair a current game without checking its engine,
content version, evidence bindings and accounting. The global generation flag
does not guard every one-off script.

## Why old files still exist

Some tools reproduce old catalog releases and paid evidence. Moving or deleting
them can break historical reports, operator workflows and tests. They are not a
fallback engine for new games. A missing private capture is not a reason to
generate a replacement automatically.

Three tracked modules currently have no non-test caller in this checkout:

- src/domain/scene/hide-acceptance.ts: historical assembler decision contract;
  live local-patch uses its publication/human-approval modules.
- src/services/generation/patch-site-complexity.ts: uncalibrated authoring
  diagnostic, not a placement acceptance gate.
- src/services/generation/fixed-world-enrollment.ts: manual fixed-world bootstrap
  contract, not checkout routing.

They are retained intentionally for now. Before removal, migrate any external
authoring consumers and keep their evidence readable. Separately, adventure
geometry and the album service are intentionally staged future capabilities;
their missing UI caller is documented in ADVENTURE_FOUNDATION_2026-09-14.md.

## Reproducible maintenance

- Run npm run check from a clean checkout; no private work/ folder is needed.
- check:work is a compatibility alias to typecheck. The old second tsconfig
  checked an ignored directory that a clean checkout did not contain.
- Keep source, schema, tests and current runbooks together in a reviewed commit.
- Do not delete worktrees, databases, captures, paid replies or customer images
  as a code-cleanup shortcut. Customer deletion uses the lifecycle services.
- Use explicit git add paths. Never stage a dotenv file or private output.
- Do not pipe check into tail/grep and use the latter's exit code as a gate.
