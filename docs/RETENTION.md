# Retention — what lives how long

A photograph of a child is the most sensitive thing this product holds, and
it is held for one purpose: drawing the character. Everything below follows
from that. The clocks are in `src/services/retention.service.ts`
(`RETENTION_DAYS`); the policy runs from the cron tick about once an hour
(`runRetentionIfDue`) and writes a `retention:run` audit row with counts.

| Thing | Lives while | Then |
| --- | --- | --- |
| Original photo (`ORIGINAL_PHOTO`, private) | the game is being made | deleted when QA approves the game, unless the parent asked to keep it; deleted with the game |
| … on a draft nobody paid for | 7 days after the last edit | photo deleted, draft `CANCELLED` |
| … on a game QA sent back for a new photo | 30 days waiting | photo deleted; the game stays in `NEEDS_NEW_PHOTO` for a person to see |
| Identity sheet (`IDENTITY_SHEET`, private) | as long as its game | deleted with the game; a regeneration is drawn from it, so it cannot go earlier |
| Rejected renders (`REJECTED_PATCH`, private) | 14 days | deleted, and the ids that pointed at them stripped from the spot rows |
| Avatar sticker and hiding-spot patches (`GAME`) | as long as the game | deleted with the game (`deleteGame`) |
| A game stuck in `GENERATION_FAILED` | 7 days of the cron retrying | moved to `MANUAL_REVIEW`; nothing deleted |
| Audit log | indefinitely | contains ids and reasons, never a picture, a name or an address |

What the policy does not cover, on purpose: backups of the database (the
hosting provider's retention applies; the picture bytes live in the `db`
storage provider today, so they are inside those backups), and the image
model's own data controls, which are an account setting at the provider and
are not verified by code. Both belong in the privacy policy as facts, not
promises.

Deleting user data is never part of a test: the retention tests run on a
temporary SQLite database seeded for the purpose.
