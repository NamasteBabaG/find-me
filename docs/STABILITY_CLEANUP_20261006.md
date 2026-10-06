# Identity recovery and project boundaries — 6 October 2026

This change starts from QA commit `32945b45`. It does not change published
artwork, game content versions, prices, private media permissions or player
progress. Provider and database verification uses synthetic fixtures only.

## Identity recovery

Current v12 identity selection formerly deferred whenever less than $0.54
remained. That estimate combined an image reservation and a later review,
so it could stop even when the actual image reservation fit. More importantly,
no real refusal occurred to activate the standing $5 policy while the game
was still generating its identity.

V12 now requests each real image/review reservation. A qualifying refusal can
activate the existing single immutable $5 receipt under the Game → Job → Child
identity fence, then queue the avatar step. Retry retains the checkpoint,
images and charges. The ledger, payment, owner, deletion, version, pending,
UNKNOWN and overrun checks remain in force. Dispatched responses cannot use
the pre-reservation deferral callback. Historical selection rules are unchanged.

The base $4 cap and strict authorized $5 maximum are unchanged. A fully used
$5 ceiling still cannot buy more calls or waive a failed quality review. This
fix resolves access to the authorized fifth dollar; it does not guarantee
acceptable art after all authorized money has been consumed.

A native cap refusal without adapter metadata can only queue the identity
step under an existing verified $5 receipt and a recognized reservation. The
live claim and clean ledger are checked again transactionally. This path
cannot grant, dispatch, alter charges or waive unresolved billing evidence.

## Creation access and server reads

The six identical creation-management checks share
`domain/game/access.ts`. Cookie-draft, account-owner and verified-admin access
keep their existing meanings. Routes retain their 403/404 responses, QA gate,
cron secret and lifecycle checks. Participant, passport-family and signed-media
permissions remain separate contracts.

`currentDraft` moved to `lib/server/current-draft.ts` and is no longer an
exported server action. Explicit continuation still requires the signed-in
owner and an active purchase intent. Existing `draftBelongsTo` service imports
remain compatible.

## Dependency direction and compatibility

Pure budget rules and retained-purchase contracts moved to
`domain/generation`. Old service imports re-export the same implementation
and error constructors, preserving `instanceof`, payload hashes and accounting
semantics. Checkpoint transport types now live beside infra interfaces.

Production infra → services imports fell from twelve to four. The remaining
edges use exact pure hash/pixel helpers whose historical source files are part
of retained evidence. Those files remain unchanged. Boundary checks limit each
exception to its named symbols; they do not allow service use cases through.
The six existing operation-scoped provider factories retain their versioned
world ledger and receipt context, with guards against accidental expansion.

Guards also reject client imports of server readers and direct reader exports
from server-action modules. No framework or database dependency was added to
the pure budget rules.

## Small removals and current documentation

Removed the unused `sanitizeProps` helper after a repository-wide caller search;
the active analytics property allowlist is unchanged. Removed three unused
homepage dictionary keys from both languages. TypeScript remains the dictionary
compatibility check.

Architecture, authoring, design and maintenance documentation now distinguish
active collection/passport routes from planned pilot boards, and current
three-hide collections from historical five-hide games. Current phone
orientation guidance is documented accurately.

Historical engines, authoring tools, evidence, captures and old content releases
are retained. No dependency, asset or private work directory was deleted merely
because a static search found no normal application caller.

## Verification scope

Focused tests cover real isolated SQLite reservations, automatic identity
continuation, strict quality gates, retry idempotency and invalid lifecycle
states; creation authorization matrices; retained purchases, CAS ledgers,
checkpoint adapters, pure-contract compatibility and boundary regressions.

Release still requires the full check, build/privacy/performance audits and
passing CI for the exact pushed commit before QA promotion. SQLite tests do
not establish live PostgreSQL concurrency or physical iPad smoothness. Existing
production resources and protections are outside this QA update.
