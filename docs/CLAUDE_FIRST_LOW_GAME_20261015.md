# The first complete LOW game (15 October 2026)

**What Guy asked for:** "I just want to see a game." It should be made at the lowest cost I can offer, without hurting quality, and pass the judges. All decisions are delegated.

**What exists now:** a complete, playable journey world, made on the plan's path A2 (`CLAUDE_COST_LOW_THREE_DOLLAR_PLAN_20261015.md`):
- 9 boards, 27 hides and 54 discoveries.
- A synthetic child, "נועם", age 6.
- **Every hide was painted at gpt-image-2 LOW and accepted by BOTH of today's qualified judges:** Opus 5.5 HIGH on quality, and Sol 6.1 HIGH on continuity, read and not truncated.
- It was assembled through the product's own world path and plays locally, in Hebrew.

**What it would cost on path A2 (computed, not yet measured on Batch):**
- **$2.73** for the purchases this world actually needed.
- **About $2.80** with a customer's identity stage ($0.074).
- The $3 target is met.

**What was actually spent** at standard prices, with nothing on Batch yet:
- **$4.846543.** That is $2.424932 for E4a and $2.421611 for E4c.
- The approvals were: stage A ≤ $1.50, stage B within E4a's $5, the rework ≤ $3.00.

**What was not changed:** no live database, no flag, no deployment, no customer picture, and no product code.

## 1. How the world was made

| Step | Run | What happened |
| --- | --- | --- |
| Paint | E4a stage A | 29 LOW paintings for 27 hides. The product's checks refused 2 (marrakech-v12-1 a1, greatwall-v12-2 a1); their second attempts were accepted. Gate 27/27. $0.517726. |
| Judge | E4a stage B | 14 hides judged, then the run stopped: Sol's continuity call on giza-v12-2 timed out at 240 s. That charge could not be stated, so the ledger kept it as an **unknown charge held in full ($0.066)** and bought nothing again. 11 hides were accepted by both judges. amazon-v12-3 was rejected by quality (severeSeam, pictureWhole, neighborsIntact). paris-v12-2's continuity answer was truncated. |
| Finish | E4c (new) | E4c is the rework, and every one of its hides and attempts has its own ledger world, so one more timeout would hold only itself. It handled three cases. **13 unreviewed hides:** E4a's own paintings were judged, and 12 were accepted by both. greatwall-v12-2 was rejected by quality; its repaint at a3 was refused by the checks, and a4 was accepted by both. **Two re-asks:** giza-v12-2's continuity was re-asked once and passed. paris-v12-2's re-ask truncated again. **Repaints:** amazon-v12-3's a3 was accepted by both. paris-v12-2's a3 truncated twice more, and its a4 passed. Result: 16/16, $2.421611 within $3.00. |
| Assemble | `build-game.ts` | The product's own seed, world selection, identity gate, `runLocalPatchWorldSlice` and publication produced a DELIVERED game with a player link. |

**How the assembly stays honest:**
- **The painter is a replay.** The product's painting prompt for each hide must equal, SHA-256 for SHA-256, the prompt that was bought. It did, for all 27.
- **The board review replays the real decision**, and only for hides both judges accepted.
- **Every published picture was then checked** against the exact image the judges saw, through the asset id the product derives from its hash. 27/27 were byte-identical.
- **No provider could be reached:** `fetch` throws and no key is set.

## 2. What this world teaches

**Rework** (per hide):

| Purchase | Per hide | Measured MEDIUM world |
| --- | ---: | ---: |
| Paintings | 34 / 27 = 1.26 | 1.15 |
| Opus questions | 31 / 27 = 1.15 | 1.15 |
| Sol answers (32 including the timeout) | 32 / 27 = 1.19 | 1.19 |

- LOW's extra paintings are cheap ($0.018 each): 3 of 34 were refused by the product's checks, and each refusal costs only a repaint.
- The judges rejected 2 of 29 distinct paintings they read.

**The cost on A2:**
- **What was spent:** paintings $0.607, Opus $3.121, Sol $1.053, plus the timeout's $0.066 held.
- **On A2:** paintings at standard, and reviews at Batch's half: **$2.727**.

**Two failure modes, each seen and handled:**
1. **A synchronous timeout.**
   - **What happened:** Sol's call ran past its 240 s limit (the median is 63 s). The product correctly holds the charge as unknown, and that held the whole review world.
   - **What changed:** E4c isolates each hide's questions in its own world.
   - **The product fix:** Batch removes the timeout itself, which is §3 of the plan.
2. **Continuity truncation on a crowded board.**
   - **What happened:** paris-v12-2 ran out of output on reasoning 4 times, on three different paintings. Sol spent all 4,096 tokens thinking.
   - **What does not help:** a new painting. It passed only on the fourth painting.
   - **What should:** the plan's recommended fix, re-asking with 8,000 tokens at the same HIGH effort. It is prepared as `work/private-e4c-runner/e4d-run.ts` and was not run: E4c resolved the hide first.
   - **The cost of the four truncations:** about $0.20 at standard, or $0.10 on Batch.

**Speed.** Medians were painting 15.6 s, Opus 25.7 s and Sol 63.4 s. This was one sequential run, not the product's pacing.

## 3. Decisions taken (delegated by Guy)

- **Stage B ran at standard prices, not Batch.** Batch adapters are not built yet (E5 first). The A2 figure above prices the same tokens at Batch rates.
- **Rework policy: LOW, LOW, then MEDIUM**, until both judges accept. MEDIUM was never needed.
- **Re-ask an open continuity answer once on the same pixels; repaint only on a judge's rejection.** E4a's paid paintings were judged before anything was repainted.
- **A synthetic child, not a customer's.** The game is in Hebrew (`Game.locale` "he", frozen at creation).
- **The game is local** (`work/private-game/out/`). Publication to QA is handed to Codex.

## 4. Files

Everything is private and git-ignored. Each file below is listed with the first 16 characters of its SHA-256.

**Runs:**
- `work/private-e4a-runner/out/results.json`: `223db9c6c673d264`
- `work/private-e4c-runner/`:
  - `e4c-run.ts`: `85a16b8b9f98a8c1`
  - `run-e4c.ts`: `f9ec64f3458e364f`
  - `selftest-e4c.ts`: `e9e8120e83a83690`, 16/16 (`logs/selftest-e4c-1.log`)
  - `out/rework.json`: `1aa97d7d9bdf2a40`

**The game:**
- `work/private-game/`:
  - `make-selection.ts`: `a4b81fe232acf332`
  - `selection.json`: `82728086537eb2c0`
  - `build-game.ts`: `79225d851ad2229f`
  - `game-cost.json`: `24dd758044ffc75e`
- `work/private-game/out/`:
  - `game_low_demo_he_20261015.sqlite`: `9f8b4b04132aa5d4`
  - `final-27.png`: `611bdc942828822a`

**Serving it:**
- **Command:** `powershell -File work/private-game/serve-game.ps1 -GameId game_low_demo_he_20261015`.
- **Setup:** port 3041, mock providers, no QA gate.
- **Player link:** in `work/private-game/out/local-game.json` and the build output.

## 5. Next

1. **Codex QA** of E4c, the builder and the game, then publication to QA so the game can be played on a phone.
2. **E5:** the batch contract test (≈ $0.30, cap $1). It proves the A2 price on real batches.
3. **The 8,000-token continuity re-ask**, as a product change for Codex's review.
4. **Path A2 in the product:** the batch purchase from the prototype, rounds, and the deadline fallback.
