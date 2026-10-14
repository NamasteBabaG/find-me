# The two cost experiments, ready for Codex's review (14 October 2026)

**Status:**
- Nothing has been bought, sent to a provider or deployed.
- The product code is unchanged since the two opt-in commits (`1770fe03` for E1, `c533b70c` for E2). This note and the plan's update are the only tracked changes.
- The runners are private and git-ignored. Each has a README for review:
  - `work/private-e1-runner/`: E1, the judge;
  - `work/private-e2-runner/`: E2, the painters.

  Both are in the worktree `work/claude-qa-v19-check-20261014`, branch `claude/review-cost-experiments-20261014`.

**Order:**
1. Codex reviews both runners.
2. Guy approves one cap per run: **E1 $7.00, E2 $3.00**, or either one alone.
3. The runs; Codex reviews their results.
4. Anything adopted goes only into a new release that new drafts pin. Existing worlds keep theirs.

## What changed from the plan, and why

1. **E1 buys each variant in its own world.**
   - The product refuses any world past $5, and E1's 84 questions together cost more. In one world the run would have stopped at question 80. The self-test caught this.
   - The runner now refuses, before any database is touched, if any world could pass $5 even if every answer cost its maximum. J0's worst case is $4.82.
   - The run's own cap spans the four worlds.
2. **E1's J0 is bought fresh for all 21 controls.**
   - Nine pictures already have Opus v3 answers from pv19, but those were asked with other bindings, inside the pipeline's worlds. J1–J3 must be compared with J0 on the same question text and evidence.
   - The earlier answers become a free repeatability check.
   - Reusing them would save about $0.93. That is Codex's call (question 1 below).
3. **E1's cost is recalibrated.**
   - Opus comes from the nine pv19 bills ($0.096–0.118, mean $0.103). Sol is projected at $0.05–0.06.
   - The estimate goes from $3.8 to **about $5.6**, and the proposed cap from $5.50 to **$7.00**.
4. **E1's cut-figure controls are built differently.**
   - **Construction.** Each is one reviewed rectangle returned to the board's own pixels, from above the hair to just above the eyebrows. Two automatic constructions left the head whole: the painter repaints the scenery around the child, so differences never isolate her.
   - **New York only.** Only New York's hide adds the child in front of plain scenery. **Amazon-3 and Great Wall-1 replace a child the board already has.** R7 was first built from the Amazon painting, and the cut grafted the board child's black hair onto ours. That is a different failure. R7 is now built from G4 (B-a10, New York).
   - Both cuts were checked by eye, magnified, and pinned: R6 `33a4d608…`, R7 `8723a1d3…`.
5. **E1's report:**
   - an unread answer on a good picture counts once, as unread, not also as a rejection;
   - time per question is now measured, as the plan promised.
6. **E2's baseline needed two paintings.**
   - For Great Wall-1 and Amazon-3, the v17, v18 and v19 painter prompts are byte for byte the same. So the v17 Great Wall paintings (both accepted by both reviews) are a fair MEDIUM baseline beside New York's pv19 paintings.
   - Amazon-3 has only v15 and v16 paintings, from other prompts, so P0 paints its two cases.
   - That makes 14 paintings, an estimate of **about $2.25** and a proposed cap of **$3.00** (was $2.75).

## E1: what is checked

- `npx tsc -p work/private-e1-runner/tsconfig.json`: clean.
- **Dry run** (no keys):
  - the pins match, and the built pictures reproduce their digests;
  - **all 84 questions are admitted.** The most one question can cost is J0 $0.230, J1 $0.125, J2 $0.126 and J3 $0.112, each against a $0.25 reservation;
  - every world fits: J0 $4.82, J1 $2.73, J2 $2.75, J3 $2.49, all under $5;
  - the effective binding matches the manifest;
  - no database, no provider.
- **Self-test: 54 of 54**, covering:
  - the manifest refused for each changed pin (12 changes, the reservation and the cut rectangles included);
  - changed pictures, sheets and board pixels under a cut;
  - the cut construction's own refusals;
  - the run as labelled: every label met, every Sol variant accepted, costs, tokens and times reported, each variant in its own world;
  - each acceptance rule failing on its own control;
  - admission refusals, per question and per world;
  - R1 before the first purchase, after a stop and on the unchanged continuation;
  - cap, lock and identity;
  - the saved pictures unchanged; no network.
- **Mutations (`mutate-e1.cjs`): 16 of 16 caught**, each by the check written for it. Both mutated files were restored and hash-verified after every mutant. The mutants:
  - drift ignored;
  - a question past its reservation admitted;
  - a world past the product's budget admitted;
  - every variant in one world;
  - a rejection on another class's check counted;
  - a softened or undecided rejection counted;
  - the borderline rows judged;
  - each of the four acceptance rules switched off;
  - the lock not required;
  - picture, built-picture and reservation pins not checked;
  - a cut rectangle outside the mask allowed.

  Each mutant runs only the self-test section written to catch it (a full self-test takes 10 minutes).

## E2: what is checked

- `npx tsc -p work/private-e2-runner/tsconfig.json`: clean.
- **Dry run** (no keys):
  - the baselines, sheets and New York scenery match their pins;
  - the three painter policies match their pinned hashes;
  - New York's prompts carry the fixed-scenery sentences, and the other hides' do not;
  - **both review questions are admitted for all six cases**: quality at most $0.229 against $0.25, continuity at most $0.0625 against $0.066 (the tightest margin in either run);
  - the effective binding matches the manifest.
- **Self-test: 51 of 51**, covering:
  - the manifest refused for each changed pin (11 changes);
  - the product checked against the contract: a painter policy, the reservations and the New York scenery;
  - changed baselines and sheets, and a case with no MEDIUM painting to compare with;
  - **the planned run:**
    - each of the 14 paintings asked of its own variant's painter, in its own world, with its case's bound prompt;
    - case by case, variants in order;
    - the same case under two painters is two purchases;
    - New York's records and restored pixels verified;
    - per-variant money and the price per accepted hide;
    - six contact sheets;
    - a relaunch buys nothing;
  - **outcomes:**
    - a painting the checks refuse is recorded and not reviewed;
    - a review rejection counts against its painter;
    - a tampered New York pixel, a stripped record and a wrong restored count each stop the run before that painting's reviews;
  - **R1:** before the first purchase, after a stop (with the unchanged continuation buying the rest exactly once) and during a launch;
  - cap, lock and identity;
  - the saved paintings unchanged; no network.
- **Mutations (`mutate-e2.cjs`): 14 of 14 caught**, each by the check written for it. Both mutated files were restored and hash-verified after every mutant. The mutants:
  - drift ignored;
  - a painting not rechecked before its purchase;
  - another painter than the variant's;
  - the New York record, restored pixels or restored count not checked;
  - variants not painted case by case;
  - a review rejection counted as accepted;
  - the lock not required;
  - the product's scenery, painter policies or reservations not checked against the contract;
  - baseline and sheet bytes not checked;
  - a case left without a MEDIUM painting to compare with.
- **Not covered by a test, by design:** the review admission before each reservation, and the world-budget refusal. Neither can be triggered while the contract is pinned to the product (every question fits, and a world holds at most three hides). The dry run shows both hold for all six cases.
- **One risk no test here covers: Mini's endpoint.**
  - The painter sends Mini today's edit request, changing only the model and size.
  - gpt-image-1-mini is documented to take the same edit parameters as gpt-image-1, but no Mini request has been sent yet.
  - If one were refused, the run would stop at the first Mini painting. It would have spent about $0.16 by then, plus at most the $0.12 reservation if that request's charge could not be stated.

## Questions for Codex

1. **J0 for all 21, or reuse the nine earlier Opus answers?** Reuse saves about $0.93. I recommend fresh: the same words and evidence for all four variants.
2. **The acceptance counts the good pictures rejected, as the plan says, not which ones.** A Sol variant that rejects a different good picture than J0 still passes this rule. Should it be a set comparison instead?
3. **One painting per case and painter is a first look.** Is that enough to decide whether to try LOW or Mini on one QA world, or should E2 paint two per case? Two per case would roughly double E2.
