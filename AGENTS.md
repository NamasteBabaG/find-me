# FindMe repository instructions

Read `CLAUDE.md` before nontrivial work. Architecture, scene authoring and design
rules live in `docs/ARCHITECTURE.md`, `docs/SCENE_AUTHORING.md` and
`docs/DESIGN_SYSTEM.md`; preserve existing versioned game contracts.

- Work from an appropriate clean release checkout. Do not discard changes in
  another checkout or overwrite work owned by another agent.
- Never run `git add -A` or bulk-stage untracked files. Stage named, reviewed
  paths only. Keep `.githooks` enabled and inspect the staged diff for secrets
  and customer data. Ignored scratch files are not releasable source.
- Never publish customer photos, names, birthdays, emails, private asset URLs,
  bearer links, SQLite databases or credentials in code, reports or test
  fixtures. Use synthetic fixtures. Removing a secret from HEAD does not
  remove it from history; coordinate rotation rather than using leaked values.
- Domain rules belong in `src/domain`; services receive their container;
  providers remain behind interfaces. A verified payment webhook is required
  before generation. Jobs, provider purchases and retries must be idempotent.
- Preserve all required hides and the authorized per-world budget. Automatic
  recovery must diagnose failures; never approve broken art, silently remove
  hides or require human image approval to deliver a game.
- Preserve private source/identity assets, ownership checks, signed GAME
  capabilities and complete deletion. Qualify PostgreSQL raw SQL using the
  configured datasource schema, never an HTTP request or a pooled search path.
- Customer copy goes through HE/EN dictionaries. Use design tokens, at least
  48px adult and 64px child touch targets, immediate feedback and reduced-motion
  alternatives. The child's play screen has no store or failure punishment.
- Run `npm run check`; also run scene/adventure validators after content changes
  and the build/private-asset audit for releases. Test with local mocks unless a
  real provider call is explicitly authorized. Do not expose secrets in output.
- QA is the dedicated `find-me-qa` project. Verify the exact pushed commit and
  completed CI before promoting its custom domain. A production release requires
  production-equivalent engine, payment, migration and delivery verification;
  never unpause the old production artifact or relabel production as QA.
