# The Flex runner's three remaining guards: N1, N2, N3 (16 October 2026)

This answers Codex's brief "המשך ממוקד: שלוש הגנות שנותרו ברץ Flex" (`work/codex-e6-final-review-20261016/`), checked against `fd118078`.

**Scope, as the brief asks:**
- the fixes are in `work/private-channels/e6b-flex.ts`, provider-free;
- focused tests and signatures only, with no broad mutation round.

**Not done:**
- no purchase, and no Flex default;
- no deployment;
- no change to the historical 503 or to the three unknown charges ($0.165);
- the E6 results are not reopened.

## N1: one run, bound once, capped as a whole

**The hole.** The run's total was summed over the current launch's items only. Three launches with three different cohorts, on one database under one run identity, bought 12 answers, **$0.54 against the $0.50 cap**, and each launch reported $0.18.

**The fix.** It reuses the guards E6a already uses.
- **`acquireRunLockFor`:** one launch at a time.
- **`bindRunIdentityFor`:** before the first purchase, the run's contract is written once. It fixes:
  - the cohort: each item's key, hide and fingerprint;
  - **each Flex request's exact content**, as the SHA-256 of the body sent;
  - the cap;
  - the policy: the reservation, asks, pause, timeout, tier cards, and the free-429 rule.

  A later launch that differs in any of these is **refused before any call**.
- **`RunCappedLedgerFor`:** every reservation is checked against the run's whole total, under the run's mutex, across processes.
- **Money reporting:** money is reported over every world of the run. A refused launch reports the bound run's total.
- **History.** A database holding this run's purchases from before identities existed is history: refused, and left untouched. The 15 October run is that case.
- **A new database** is initialized by one process, under an `O_EXCL` lock file. The two-operator test found this race: two operators starting together on a new file both applied the schema, and the second crashed. The crash was fail-closed, with no purchase, but it was not a clean refusal.

## N2: a tier with no card is never priced

- **The hole.** Any tier other than `flex` was priced at standard. An `unpriced-test-tier` answer settled at $0.09.
- **The fix:** `TIER_CARDS` = {`flex` → the Batch card, `default` → the standard card}. Any other tier, or no tier at all, is kept, held at its full reservation, and never asked again. The standard price is no longer treated as an upper bound for unknown tiers.

## N3: only the documented 429 is free

- **The hole.** Status 429 alone settled a request free and retried it. A 429 `insufficient_quota` was asked three times and recorded three times as Resource Unavailable.
- **The documented signature.** OpenAI's Flex guide names it as "`429 Resource Unavailable`" ("You will not be charged when this occurs"), with no separate type or code string.
- **The fix:** `classify429`, one classifier used both at purchase and when a row is re-read (`failureOf` / `rowOf`).
  - **`resource-unavailable`:** a 429 whose error message contains "Resource Unavailable". It is free and retryable, as before.
  - **`insufficient-quota`:** type or code `insufficient_quota`. It is held at its full reservation, and the run stops.
  - **`other-429`:** anything else, including rate limits and unreadable bodies. It is held, and the run stops.
- **An earlier version's zero-settled non-documented 429** is surfaced on re-read for a person to reconcile. It is never shown as unbilled.

## Tests

| Suite | Result |
| --- | --- |
| `selftest-e6b.ts` | **32/32** (15 new) |
| `selftest-e6b-procs.ts`: two operators | **4/4**, run twice. Two **processes** launch on one database at the same moment, with the same cohort and then with different cohorts. Exactly one buys its four answers; the other is refused at the lock with zero calls; the run's total is the four answers and stays within the cap. |

The 15 new checks in `selftest-e6b.ts`:
- **N1:** Codex's three-cohort scenario; a changed cap; changed request content; a same-run relaunch replaying; the cap stopping the run at the reservation that would pass it, and holding across a relaunch; the pre-identity database refused untouched.
- **N2:** an unpriced tier; a missing tier.
- **N3:** the classifier; a quota 429 held, the run stopped, and the relaunch reading it the same way; a rate-limit 429; the earlier version's zero-settled quota 429.

**Codex's own reproduction,** copied with only its output path changed (`qa-repro/repro-flex-followup.ts`), with **0 network calls**, sources and historical ledgers unchanged:

| Control | Codex's evidence (`fd118078`) | After the fix (`flex-followup-after-fix.json`) |
| --- | --- | --- |
| N1: three cohorts, one database | 12 calls, **$0.54 > $0.50** | **4 calls, $0.18.** Launches 2 and 3 are refused with 0 calls, each reporting the run's $0.18. |
| Quota 429 | 3 calls, 3 "unbilled" | **1 call**, `insufficient-quota`, held $0.066; the replay sends 0 calls |
| Unpriced tier | settled $0.09 | **held $0.066**, `unpriced-tier` |
| Wrong model | held $0.066 | held $0.066, unchanged |

**Not in the brief's scope:** E5's runner (`runE5`) initializes a new database the way E6b did. Two E5 launches starting together on a brand-new file would see the second crash. That is fail-closed, before any purchase. The same lock-file fix applies there if wanted.

## Signatures

| File | SHA-256 |
| --- | --- |
| `work/private-channels/e6b-flex.ts` | `8145a42f478ef45e11f69f2e0a4da22ebb9e515eac5b4b706930f933a568382b` |
| `work/private-channels/run-e6b.ts` (reports the run's status; the repro recorded the earlier `086282137…`, which it does not run) | `07ff3e2dffe932aae9ee4aea196e81fb23c60ec4a0d58673d14f9a5e1e00236b` |
| `work/private-channels/selftest-e6b.ts` (32/32) / `logs/selftest-e6b-n123.log` | `61a218e00bdc6b5f65095efb8af35fc52545decb088003c3f73f50281b66caa3` / `919f92fcffab2ecfca8009e88976099b675a7dbb253b0505824774e69288f4b4` |
| `work/private-channels/e6b-worker.ts` / `selftest-e6b-procs.ts` / `logs/selftest-e6b-procs.log` | `937325495b889bb3949dcaad987d85bfffff0438da46f18694ed52770919a5ec` / `42a7a8cd5d808ff85eb71e4d4fa798dc47648d7225ed6b9888068a399d698d1b` / `653355d16c347f7009ec9994476069cd1d08e64bd833ad3ddd75320e9454bcd0` |
| `work/private-channels/qa-repro/repro-flex-followup.ts` / `flex-followup-out/flex-followup-after-fix.json` / `logs/repro-flex-followup.log` | `ae7fa45281e0094ca7c8ff996a8ccbc180030db33c1b77b0cd02de959e9d08b6` / `92db7d4f3c5bf4f5178e6449edac721813fee3a8029eca243d56def73d62280a` / `efbae0b53ea8e2f0d4d8318134aef2ae86c420e0c2e43ec5d05b18862dc1d583` |
| Codex's evidence, untouched: `flex-followup-independent.json` | `f7284ccb02b6b59716a271afab264eb9ff38e96c6bc7669c4c69a062f7a81c34` |
| Historical ledgers, unchanged: E6b `out-e6b/purchases-e6b.sqlite` / E6a `out/purchases-e6.sqlite` | `c1ac782400f1cbf49e47eb2ae18f5ce22101a8e4d3e971b06246bdbd3457becb` / `414e866bb82a909a87d2654cb0925a78864cb5489dd999cdcc2b6cd4c1207dcf` |

**Next,** per the brief: the product-wiring decision, without reopening the verified E6 results.
- **The target** is about $3 on average for a world with all 27 hides.
- **Projections, not a measured average:** about $2.83 on the Flex path, and about $3.36 with Sol on the standard tier.
