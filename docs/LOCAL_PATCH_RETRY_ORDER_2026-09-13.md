# Local-patch retry order

The first image pass must reach every planned hide before a refused hide starts
its second purchase. Second candidates and their grouped reviews complete before
a new third/final purchase. The existing maximum is three images per hide in a
strict world, inclusive of attempts already started before a worker restart.

This is shared scheduling, not an Omer-specific repair script. Existing legacy
worlds also receive first-pass priority; their historical environment-dependent
attempt allowance remains unchanged. Strict worlds share the three-attempt policy
across environments, while the independent QA spending guard, identity approval,
key configuration, ledger and spending limits are not relaxed by this policy.

## Recovery and refusal boundaries

- An interrupted paid attempt resumes its original request key. In particular,
  a pending third attempt is recovered even if another board now needs an earlier
  retry or has an outstanding review. That exception never starts a new third
  purchase ahead of normal work.
- Accepted hides are not repainted. Attempts and receipts are never reset.
- Trustworthy visual failures/explicit mandatory uncertainty use remaining
  attempts. An unreadable review or an unresolved charge remains a stop, not
  permission to spend again.
- No fourth attempt, new order, direct local provider call, or implicit budget
  increase is introduced.

## Verification

Four synthetic-provider integrations use the real SQLite repositories, retained
purchase store, world budget and world slice. They cover all 45 first purchases
before retries; a delayed second-candidate review before the final repair;
fresh-client replay after a real publication abort; an interrupted paid third
attempt alongside untouched work; malformed-review blocking; and fresh ticks
after the cap without another purchase. No network is permitted in these tests.

Focused policy and strict-verdict tests pass (32 tests), and the four new
integrations pass independently. A separate agent reviewed the production diff
and found no blocking defect. Full-check and deployment evidence are recorded
below only after completion.

The full check passed with both TypeScript projects, 194 test files, 2,881 tests
passed and 35 skipped (`npm run check -- --maxWorkers=4`, exit 0). The legacy
queue regression was deliberately updated to put untouched first attempts before
attempt two; its existing retained-attempt-three replay checks remain intact.
