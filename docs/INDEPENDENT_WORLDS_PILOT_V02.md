# Independent worlds and magic pilot — v0.2

Date: 2026-09-15. Implementation baseline: Claude `df3ce2e`.

This is the implementation decision record for the user's approved work order,
not a production release or permission to spend on rendering. The source v0.1
is `findme_independent_worlds_magic_pilot_spec_v1.md`, supplied by the user.
Its art direction and independent-adventure product intent remain unchanged.

## Decisions and scope

| Concern | v0.2 decision |
| --- | --- |
| World choice | Any owned, delivered world can be the first adventure. No completion requirement in another world. Existing world hub/local progression are retained. |
| Board progression | Local to its world. Advance threshold and full completion remain separate content-driven rules. |
| Pilot content | Kingdom trial: castle gate, giant library, fairy forest, in that explicit trial order. Three serial child appearances and six discoveries per board: 3 common, 2 rare, 1 epic. |
| Legacy content | Four/five-target games remain valid. No global replacement of target counts, unlock rules, images or saved progress. |
| Completion | All actual child targets award the postcard; collecting every discovery is a separate achievement, never a gate. |
| Difficulty | No automatic escalation by world number. Rarity and visual difficulty are separate; hints carry no penalty. |
| Replay | Explicit action on a fully completed board. Round child finds/stars/discovery count reset in memory. Existing achievements never reset. |
| New replay discovery | Recorded immediately through the normal album event path. Locally pending discoveries count as already collected. No duplicate cards/rewards. |
| Bag visit | Opening the bag suspends the current round; “Back to my round” resumes it. This deliberately replaces v0.1's rule that a bag visit ends replay. |
| Round boundary | Map, another world/board or refresh ends the temporary round. Successfully saved/pending discoveries survive independently. |
| Reopening completed content | No automatic replay or automatic confetti on refresh. Return to the map; replay requires the explicit action. |
| Owner versus guest | Separate pilot browser storage. No automatic guest-to-owner merge. Switching owners cannot reuse another owner's queue. Server session still authorizes every account write. |
| Release identity | Album and progress browser keys include policy, immutable book release, viewer scope and game. No import of old unscoped caches. |
| Activation | Only newly composed test games explicitly carrying `playPolicy: "independent-worlds-v1"`; schema requires a complete bound AdventureBook. Existing configurations default to legacy behavior. |

## Persistence contract

The store applies `recordAdventureEvent` for every new discovery, including in
replay. The existing account endpoint and server-side book validation remain
authoritative. There is no replacement endpoint or client-side ownership claim.

Pilot owners must read their account snapshot before sending local events.
Offline retries retain local finds, reconcile only within the same book, and
never announce account persistence before acknowledgement. A mismatched book is
refused rather than retried into a different release. A stopped viewer ignores
late reads/writes. Local storage failure is surfaced as unsaved/unreadable;
this does not claim the whole game works offline.

The opaque owner storage scope is derived server-side from the authenticated
viewer. It is cache partitioning, not an access token or an authorization rule.
Stored content remains subject to normal browser/origin access; this is not
encryption or a privacy boundary against scripts on the same origin.

## Delivery versus future commercial work

The current game delivery pipeline expects the configured game slice to be ready
as a whole. **Independently ready worlds inside a partially generated purchase
are not implemented by this pilot.** They need a separate delivery-state design.
Likewise arbitrary world selection in checkout, add-on purchases, merging
orders, pricing, public availability and PayMe release readiness are separate.
Do not alter Claude's wizard while he is redesigning it.

Produce a new pilot game/book containing only its delivered boards; do not add
them to Bar's existing immutable game. A completed three-board pilot remains a
completed three-board pilot after a future nine-board release appears.

No database migration is required for this opt-in config/client policy. The
production config producer still needs deliberate activation when the reviewed
magic assets are ready; this change does not automatically enroll any game.

## User-facing behavior

Keep existing compact HUD, inline discovery feedback, world-based album and
save status. Replay uses round counts on the board and permanent counts in the
bag. Pilot explanation: “Search again. New discoveries join your album; your
earned stars stay safe.” The Hebrew equivalent and return-to-round action are
in the existing dictionaries, not hard-coded component copy.

Legacy marketing copy is not globally changed while legacy games retain their
old replay policy. Update public claims when the policy is actually released.

## Acceptance and rollout order

1. Recheck Claude's service fixes and protect pipeline callers against lost CAS.
2. Test policy validation, legacy replay, new/old discoveries, guest/owner/release
   isolation, offline refresh/reconnect, storage failure and bag resume.
3. Verify the same player in a local browser with public demo assets; no personal
   game or paid generator is needed for this interaction check.
4. Approve scope and spending cap for **one castle-gate board** before any paid
   call. See `MAGIC_CASTLE_GATE_BRIEF_20260915.md`.
5. Review actual 4K source, faces, occlusions, target/collectible separation and
   mobile/game-scale usability. Only then approve the remaining two boards.
6. Compose a new authorized pilot game, run real owner/guest end-to-end tests,
   then request QA deployment approval/coordination. Public rollout is separate.

The local review route `/dev/independent-pilot?lang=he` (or `en`) requires both
development mode and `INDEPENDENT_PILOT_REVIEW=1`. It uses only the existing public
Anna beach assets, local guest storage and disabled telemetry. It is not the
magic world and is unavailable in production.

## Explicit non-goals

No social features, native app, trading, random rarity, new currencies, increased
item count, automatic difficulty ladder, unapproved paid retries, legacy cache
migration, private-art publication, wizard redesign or live deployment.
