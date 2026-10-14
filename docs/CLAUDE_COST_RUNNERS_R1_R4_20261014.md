# Codex's R1–R4 on the cost runners, fixed provider-free (14 October 2026)

**Status:**
- Nothing has been bought, sent to a provider or deployed. No model, default, flag, ceiling or required hide count changed.
- Product source is unchanged since `8d946d4b`, the head Codex reviewed. This note and the plan's update are the only tracked changes.
- The fixes are in the two private, git-ignored runners in this worktree. Their final hashes are listed below, and the logs of every check are beside them (`work/private-e1-runner/logs/`, `work/private-e2-runner/logs/`).
- The caps stay as proposed: E1 $7.00 (about $5.6 expected), E2 $3.00 (about $2.25). Neither is approved.

**Order:** Codex re-reviews; then Guy decides each cap; then the runs; then Codex reviews their results.

## R1: the judge sees only an opaque wire ID

**The fix.**
- **Wire IDs.** Every control has a pinned wire ID (`e1-guard.ts`): a random 8-hex token generated once, independent of label, class, release and identity, and the same for all four variants.
- **The binding.** The binding the judge reads is exactly `{"version":"candidate-binding/v2","wire":…,"imageSha256":…,"portraitSha256":…,"statedAge":…}`.
- **What stays local.** The descriptive id, label, class, reason, and file, folder and sheet names stay in the manifest and the report. The request key is a ledger key and never reaches the provider (`visual-review.ts:63-73` sends only the prompt, the images and their labels).
- **Pins.** The manifest pins the wire IDs. The contract refuses a repeated or non-opaque one.
- **Rebuilt.** The 84 bound questions changed, so the manifest's effective binding was rebuilt.

**Regressions (self-test, section `blind`):**
- The exact outgoing request of all 84 questions is captured at the transport's own `fetch` and never sent: prompt, adjacent image labels and images, as the provider would receive them. Across all of them:
  - no descriptive control id, reason, file or folder name, sheet name, run name or label field appears;
  - no class name's presence varies between controls;
  - the binding has exactly the five fields, with the control's own wire ID;
  - no request carries another control's wire ID.
- Changing every local name, label, class and reason (descriptive ids, and the built pictures' references to them) leaves all 84 question fingerprints unchanged, matched by wire ID.

## R2: qualification is absolute; J0 is a diagnostic

**The fix (`buildE1Report`).** Each variant, J0 included, qualifies only if all of these hold:
- the run is complete (R3);
- all 8 verified good pictures pass;
- all 11 verified rejects are caught, each by its own class's check with a located fault;
- no counted answer is unread or truncated.

The two observe-only rows stay outside the score. `comparisonWithJ0` lists, per Sol variant:
- the rejects caught by J0 only, and by the variant only;
- the good pictures rejected by each;
- how many of the 19 readings agree.

It is a diagnostic only. A bad baseline can neither lower the bar nor block a good candidate.

**Regressions (section `qualification`), the gate run:**
- **J0** misses R5 and rejects good G6, so it does not qualify.
- **J1** catches R5 and passes G6, so it **qualifies**: valid located failures where the baseline failed.
- **J2** rejects a *different* good picture (G4, the same count as J0's) and rejects R6 only on a check outside its class, so it does not qualify.
- **J3** has an unread answer, a truncated one, and a claimed pass over a failed check, so it does not qualify.
- **The borderline row** is never scored.

**The all-miss run:** every variant, the baseline included, misses R3. None qualifies, though every Sol variant agrees with J0 on all 19.

## R3: the money settles before anything qualifies

**The fix.**
1. Every world is audited first.
2. Every open, unknown, held or conflicting purchase, every charge past its reservation (`overrunRequestKeys`) and any cap overrun is named.
3. The status is decided.
4. Only then is anything qualified.

On a run that is not complete, every reading and charge is kept and marked `provisional`, with each variant's first reason saying so.

**Regressions:**
- **A stray unknown purchase.** After a complete run, an extra purchase of unknown charge is made through the product's own `purchaseOnce`. Result: incomplete and held, nothing qualifies, every reading and charge kept, nothing bought on relaunch.
- **An overrun on a planned question.** With planned purchases only, the last J0 question settles at 260,000 against its 250,000 reservation. Result: the full charge kept, its world held, the run incomplete, nothing qualifies.
- **A cap overrun.** The run's last question, charged past its reservation, carries the total to 5,833,000 against a 5,823,000 cap. Result: stopped and over the cap, every charge kept, nothing qualifies.

## R4: a contact-sheet failure never suppresses E2's report

**The fix.**
- The contact sheets are written in their own `try/catch`.
- A failure is recorded under `artifacts.contactSheets` and in `unconcluded`, so the run cannot read as complete.
- `results.json` is always written, with the stop and every charge.
- A relaunch replays every settled purchase and writes the sheets again, buying nothing.

**Regressions (section `artifacts`), each with only `out/contact` obstructed by a file:**
1. **A stop after one settled painting.** The report is written, with the stop, the 19,000 charge and the artifact error.
2. **The failure after every purchase.** The report is written, with every charge (2,242,000), and the run is incomplete, not complete.
3. **The obstruction removed.** A relaunch writes all six sheets and completes, buying nothing.

## E2: paired, matched-case reporting (Codex's comparison note)

- **`pairs`, per case:** the MEDIUM painting beside P1 and P2. A saved painting is marked as a visual reference only, not paid here, with its earlier outcome. Amazon's P0 is marked as paid here.
- **`matched`:** aggregates over matched cases only. P1 against P2 on all six, and P0, P1 and P2 on P0's two Amazon cases. P0's Amazon-only cost is never set against six-case figures, and saved baselines enter no aggregate.
- **`notes`:** the price per accepted hide includes refused paintings, but E2 has no retries and no identity stage, so it is not delivered-game cost.
- **The plan** now says the same, and records Codex's $2 note: the continuity review stays Sol HIGH, about $0.95 per 27 first-pass reviews, leaving about $1.05. A later continuity qualification may be needed; it is neither authorized nor implemented.

## Checks

| | E1 | E2 |
| --- | --- | --- |
| `tsc` on the runner | clean | clean |
| Dry run: pins and admission pass, and the binding matches the rebuilt manifest | yes (each world's worst case under $5, J0 at most $4.82) | yes (review admission for all six cases) |
| Self-test (network blocked, synthetic bills) | **65 of 65** (16 min) | **56 of 56** (6 min) |
| Mutations, each restored and hash-verified | **23 of 23 caught** | **18 of 18 caught** |

The logs are `logs/selftest-e1.log`, `logs/mutate-e1.log`, `logs/selftest-e2.log` and `logs/mutate-e2.log`. Each mutant runs only the self-test section written to catch it. The new mutants:
- **E1:**
  - the binding names the control, or carries its label;
  - wire IDs unchecked;
  - each gate rule off;
  - "catch only what J0 caught";
  - "compare false rejections by count";
  - a financially open run qualifying;
  - overruns unnamed.
- **E2:**
  - a contact-sheet failure suppressing the report;
  - an artifact failure reading as complete;
  - P0 aggregated over cases it did not paint;
  - a saved baseline reported as paid.

## Final hashes

**Changed since Codex's review:**
- E1: `e1-guard.ts`, `e1-run.ts`, `run-e1.ts`, `selftest-e1.ts`, `mutate-e1.cjs`, `manifest-e1.json` and the README.
- E2: `e2-run.ts`, `selftest-e2.ts`, `mutate-e2.cjs`, `manifest-e2.json` and the README.

**Unchanged:**
- `e2-guard.ts` (`57e0e65d…`);
- both `run-guard.ts` (`de249a64…`);
- `binding.ts` and `photo-binding.ts`;
- the launchers, manifest tools and tsconfigs.

The reviewed head is `8d946d4b`; these files complete the inputs. The logs are in each runner's `logs/`.

| Private file | SHA-256 |
| --- | --- |
| `work/private-e1-runner/README.md` | `c92a0dc3a4217001d219357f47f7f1237bd2a7b16b8d66a56e5616e6fcc73645` |
| `work/private-e1-runner/binding.ts` | `a84e3b42cf8aa144a4fcc8cc3f7d20dabc7d9c23a8b71bab151d5a8d42f3f560` |
| `work/private-e1-runner/e1-guard.ts` | `b15c9e6b4f658281ed5ce1ee978307a08d220fac4cd22e57d7a8cfc8ac4f8d1b` |
| `work/private-e1-runner/e1-run.ts` | `bacb868aa471663337ae836c617150ecc110cf843c5195d220855b6d307ad810` |
| `work/private-e1-runner/manifest-e1.json` | `6fe3aae274b337b5494bca6555e00a07591664e6e33329dd1cbe6ccb3f846391` |
| `work/private-e1-runner/manifest-tool.ts` | `1ae719e1c04b4d22009b645876af646da6df2a5e7ea73de9ff5fbc4526e976ca` |
| `work/private-e1-runner/mutate-e1.cjs` | `333141fca09694ffed5af6868817424184e955848b13be2c41aea6b771526e4b` |
| `work/private-e1-runner/run-e1.ps1` | `dd9bff0d49ffb819e3a6bdaf19a650db4a729700980c2b6727a6f8f38b2f8d87` |
| `work/private-e1-runner/run-e1.ts` | `9c15306db46c4654698faf783e2f8708b35486781352b0ee16e69ade02293a0f` |
| `work/private-e1-runner/run-guard.ts` | `de249a648c7a19f09752b318d277337ca35b0f42240e813951e2be6648516471` |
| `work/private-e1-runner/selftest-e1.ts` | `f6d90a4b39286205202fe6f3760b4c98253c3675c3237244e446d96a45092449` |
| `work/private-e1-runner/tsconfig.json` | `b38f03766485765540702aa7495482726d1ed92e1ae2e6a52782947988acd080` |
| `work/private-e2-runner/README.md` | `bbef5c326da4e3b4dd2a905fb7d556f197b4064b431049cc766fdddf2cb50c41` |
| `work/private-e2-runner/e2-guard.ts` | `57e0e65d5161131cc961b0baffc97598d05ddd5fec30cb8e9d97f65aae88937b` |
| `work/private-e2-runner/e2-run.ts` | `df0d11f9250e52dc1c98867c9bed564fb1510fb8d06b63dc7f4c550c82b5db00` |
| `work/private-e2-runner/manifest-e2.json` | `8af83c5d25c003c28da1b52b32c09c258ca50ed4b5329eb6343338b5a70433e4` |
| `work/private-e2-runner/manifest-tool.ts` | `02593094efe262d7f21baca7528680cc1699a568a3abcfa3fce5a4858a9d0b96` |
| `work/private-e2-runner/mutate-e2.cjs` | `75c5236d36740c69061f7976e1e828fe937613500d5bba5639f0a40316c1afd6` |
| `work/private-e2-runner/photo-binding.ts` | `f37d22430ced072923b581e30565675dfb88375df481c6b89132dcfdde7b4ef7` |
| `work/private-e2-runner/run-e2.ps1` | `d577928b466b92c3ffaef85ae3aabca03817655fc00e8d0bcd53660d91bf4244` |
| `work/private-e2-runner/run-e2.ts` | `20f23961f23180c7568dba560a5a22dbd5d4d46741632be748d7a14255de1a1a` |
| `work/private-e2-runner/run-guard.ts` | `de249a648c7a19f09752b318d277337ca35b0f42240e813951e2be6648516471` |
| `work/private-e2-runner/selftest-e2.ts` | `db173c11fd84c68aca41ac3ffd97b4a5980816d3ae359834160ad66afe6d3d5f` |
| `work/private-e2-runner/tsconfig.json` | `241c5ced76da272a1ed82abbb2aa5039e804faf8572a9ec84fbedbaa69effcfe` |

## Unchanged, on purpose

- The model choices, defaults, ceilings and the 27 required hides.
- The labels: nothing was relabelled in response to any answer (none has been bought).
- The proposed caps.
- E2 still paints one painting per case and painter, as Codex advised for a first screening.
