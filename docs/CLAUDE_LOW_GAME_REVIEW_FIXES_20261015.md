# The LOW game: Codex's review and the fixes (15 October 2026)

This follows `CLAUDE_FIRST_LOW_GAME_20261015.md` (commit 94ee2be4).

> **Corrected 15 October after Codex's second QA.** Codex found two more holes, R1 and R2, and they are closed in `CLAUDE_LOW_GAME_QA_FIXES_R1R2_20261015.md`:
> - **R1:** an unknown charge was re-asked under another key.
> - **R2:** a batch create could be duplicated on resume.
>
> The A2 figure below is corrected there. The rework runner's signatures in §3 are superseded.

**How Codex was reached.** Guy asked Claude and Codex to coordinate automatically. Codex reviewed read-only, through the Codex binary that ships with Guy's Codex app (0.162). The plugin's command-line Codex (0.130) cannot read Guy's `config.toml`: its `service_tier = "priority"` and its models are newer than that version.

**The review** is kept at `work/private-game/reviews/codex-review-20261015.md` (`d31bc3a112f5eb85…`). Nothing was published, and nothing outside `work/` was edited.

## 1. Verdict: the game is sound

Codex rebuilt the evidence independently:

| Check | Result |
| --- | --- |
| Raw paintings against their paid retained image purchases | 27/27 match |
| Prompts | 27/27 match the pinned ones |
| Quality: reconstructed questions with settled, readable, untruncated, acceptable Opus answers | 27/27 |
| Continuity: reconstructed questions with passing Sol answers | 27/27 |
| Published pixels | 27/27 byte-identical |
| Player | HTTP 200; all 39 config URLs served |
| PRIVATE assets without authorization | 403 |
| Programmatic playthrough, with the product's own progression rules | 9 boards, 27 hides, 54 discoveries, `gameDone=true` |

**Money:**
- Codex re-priced all 34 paintings and 62 settled reviews from their retained usage, and every amount matched.
- There are 96 distinct receipts, with no duplicate across the runs.
- The total exposure is **$4.846543**: $4.780543 in settled usage estimates, plus giza's $0.066 unknown charge, held in full. No provider invoice has been verified.
- **The A2 figure is a Batch-rate projection,** not measured Batch spend. The original $2.726757 halved the unknown charge. Corrected, it is **$2.759757**: the settled purchases at Batch rates come to $2.693757, and the unknown is added in full. With identity it is ≈ $2.83. E5 validates the channel and its sample's cost, not a world's price.

## 2. Findings and fixes

### P1: the builder trusted the selection's summary strings

**The fix:** `work/private-game/admit.ts`, called by `build-game.ts` before anything is created. The builder's evidence now has two parts:
- **The painting.** The raw painting must equal, pixel for pixel, the bytes a **settled** image purchase retained, after the product's normalization.
- **The judges.** Both exact questions are rebuilt from:
  - the board art;
  - the identity reference;
  - the selected image (`questionsOfE4a`).

  The paid ledgers must then hold a **settled** purchase with each question's exact fingerprint. Its retained answer must read, through today's readers, as acceptable (quality) or pass (continuity), and untruncated. **No settled answer to the same question may reject those pixels.** A rejection is a located defect (retry) or a located break (repair).

The selection's strings authorize nothing. The board-review replay now passes only hides that this admission passed.

**Proven both ways:**
- **The real selection:** 27/27 admitted. The builder builds it (DELIVERED, 27/27 byte-identical).
- **The test selection** (stage A paintings, judges assumed): refused.
  - amazon-v12-3 has a settled quality "retry" on its exact pixels.
  - greatwall-v12-2 has a settled quality "retry" on its exact pixels.
  - paris-v12-2 has no settled continuity answer that accepts its pixels.
  - The builder fails before creating anything.

### P2: E4c repainted on open evidence, not only on a judge's rejection

**The bug:** an unresolved or truncated answer fell through to the repaint loop.
- In the completed run, paris-v12-2 was repainted twice after continuity truncations; no judge had rejected those pixels.
- That bought about $0.29 of paintings and reviews. A recovery question would have cost about $0.11.
- The final paris picture is valid: its exact pixels passed both judges.

**The fix** (`e4c-run.ts`): each review has four outcomes.
- **`accepted`:** both judges accept.
- **`rejected`:** a located quality defect, or a located continuity break. Only this leads to a new painting.
- **`open`:** unread, truncated, or unresolved after the one re-ask of the same pixels.
- **`held`:** an unknown charge, kept in full.

Open and held stop the hide and record it in `openEvidence`, for a bounded recovery (the 8,000-token re-ask, `e4d-run.ts`, with its own bound policy and reservation).

**Self-test:** 20/20 (`logs/selftest-e4c-2.log`, `c9b3f90d54ea8d09…`). The new checks:
- an answer still open after the re-ask leaves the hide open, with no painting;
- two timeouts leave the hide held, with no painting. Since R1, one is enough: an unknown charge is never re-asked under another key;
- a repaint whose answer stays open stops at that attempt.

### P2: a blind copy into QA would carry replay records as real ones

**The problem:**
- **Synthetic records:** the local game holds a synthetic identity-review reply, synthetic board-review replies, and a replay ledger ($0.483093).
- **The local notification:** its `DELIVERED` status followed a console notification whose body carries the local player link.

**The decision:** no QA import in this round. Guy can play now on his own network: the dev server answers on the home Wi‑Fi address and on Tailscale, and Windows already allows Node inbound.

**What a QA import needs**, following Codex's plan:
- A new adapter. `scripts/two-worlds-qa-transfer.ts` is the closest template; neither existing script handles a local-patch game's graph. The adapter must:
  - be source-bound by a manifest;
  - re-run this admission;
  - upload the blobs in resumable, verified chunks (88 MB);
  - publish the rows atomically into `qa."…"`;
  - add an explicit import and replay provenance audit;
  - leave out the local notification and its "sent" audit.
- A player link minted with **QA's** `SESSION_SECRET`.
- Exclusion of this import from customer cost averages.
- A real phone playtest after the import.

## 3. Files

| File | SHA-256 (first 16) |
| --- | --- |
| `work/private-game/admit.ts` / `admit-cli.ts` | `ee13f1ba09c21b61` / `9e56b9cd96728aff` |
| `work/private-game/build-game.ts` | `f49a33dfc5462a3b` |
| `work/private-e4c-runner/e4c-run.ts` / `selftest-e4c.ts` | `94e51e1ab29e811b` / `b5c9e99388d0cdbd` |
| `work/private-channels/providers.ts` / `e5-run.ts` / `run-e5.ts` / `selftest-e5.ts` (12/12, `logs/selftest-e5-1.log` `340dcf397a5f7741`) | `c4cc7e28a576da1d` / `ad76407fb5a8a713` / `7d8217d32bcd3126` / `9ad93853302e135a` |

**E5,** the Batch contract test (cap $1): its results and accounting are in `CLAUDE_LOW_GAME_QA_FIXES_R1R2_20261015.md`.
