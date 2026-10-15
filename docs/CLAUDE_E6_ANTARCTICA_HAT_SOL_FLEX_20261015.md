# Antarctica's hat and Sol on Flex: E6a and E6b (15 October 2026)

> **Reviewed by Codex on 16 October.** The results below are confirmed. Codex found four defects in the runners: two P0 (the E5 store across processes; E6b's model check) and two P1 (cleanup acknowledgement; E6b's kept evidence). They are fixed in `CLAUDE_CODEX_E6_REVIEW_FIXES_20261016.md`, whose signatures supersede those below for `e6b-flex.ts` and `run-e6b.ts`.

**Approval.** After the QA round (`CLAUDE_LOW_GAME_QA_FIXES_R1R2_20261015.md`) Guy wrote "מאשר להמשיך בתשלום": continue with payment. That handoff had named two paid items: the Antarctica hat check, and the Sol channel.

**Caps I set:** E6a $1.50, E6b $0.50.

**Constraints, as before:**
- the synthetic child only;
- no live database, flag, ceiling or model change;
- no deployment, and nothing published.

| Run | Result | Money |
| --- | --- | --- |
| **E6a:** Antarctica's winter hat (content v13), 3 hides | **3/3 accepted by both judges at the first LOW painting.** All 3 show a winter hat with the whole face visible. | **$0.439717**, settled |
| **E6b:** Sol continuity on OpenAI Flex, 4 questions | **3/4 answered in 55–62 s at half price**, all `pass`. 1 server error (503), held as unknown. | **$0.126172**: $0.060172 settled + $0.066 unknown |
| Total | | **$0.565889 exposure.** No provider invoice has been verified. |

## 1. E6a: the winter hat passes both judges

**What ran** (`work/private-e6-runner/`):
- **The board: content version 13's Antarctica.** It comes from branch `claude/antarctica-hat-v13-20261015`, commit `fd238042`. The runner reads it through a private copy under `work/` that must build the committed board exactly, by the release tests' digest (`31b45c03…`). This keeps this worktree's `src/` and `content/` byte-identical to the tree E4a's binding was reviewed on.
- **The painter: the product's own v19 path** (prompt builder, renderer and checks), at LOW, with LOW, LOW, LOW and then MEDIUM attempts available.
  - The prompt the painter received carries the hat wardrobe.
  - Each hide's prompt is pinned by SHA-256 in `manifest-e6.json`.
- **The judges: E4a's reviewed questions,** asked synchronously. Opus 5.5 HIGH answers on quality; Sol 6.1 HIGH answers on continuity, only where quality accepts. The R1 and P2 rules apply, and every hide and label has its own world.
- **The child:** E4a's synthetic child.
- **Tested before any purchase:** `selftest-e6.ts`, 19/19, with no network. The self-test also proves that the product's renderer builds exactly the pinned v13 prompts: its fake painter is reached only past the bound-prompt guard.

| Hide | Painting | Quality | Continuity | Reviews | Total |
| --- | --- | --- | --- | ---: | ---: |
| antarctica-v13-1 | a1 LOW, $0.018239 | acceptable, no fault | pass | $0.128018 | $0.146257 |
| antarctica-v13-2 | a1 LOW, $0.018219 | acceptable, no fault | pass | $0.132762 | $0.150981 |
| antarctica-v13-3 | a1 LOW, $0.018214 | acceptable, no fault | pass | $0.124265 | $0.142479 |

- No rework and nothing held. The run took 4.5 minutes.
- **The judges do not see the wardrobe.** Their questions are pictures: before and after, the close-up, and the portrait. So passing proves the painting is clean and recognisable, not that it has a hat.
- **So I looked at each accepted painting.** All 3 show a knitted winter hat pushed back off the forehead, with the whole face and the hair at the brim visible.
- **The side-by-side with today's demo** is `out/compare-antarctica-v12-vs-v13.jpg`.

**What this does not establish:**
- These are 3 hides on one synthetic child with short hair. Long or voluminous hair may meet a hat differently.
- The likeness judge accepted hair partly under a hat in these three paintings. That is all this shows.

**Not done: wiring v13 into the product.**
- **The code.** The content version is referenced by 29 non-test files:
  - the version predicates;
  - `localPatchBoardsForVersion`;
  - the publication policy's `-v12-` id pattern;
  - the prompt and foreground policies.
- **The release decision:** which version the wizard sells.
- This is Codex's release lane. Until then, the demo game keeps v12's bare-headed Antarctica.

## 2. E6b: Sol on Flex

**Why.** E5 showed that OpenAI's Batch answered none of the 4 Sol questions in 3 hours. Flex is OpenAI's other half-price channel.

**What ran** (`work/private-channels/e6b-flex.ts`):
- **The questions:** the same 4, each byte-identical by fingerprint to its paid synchronous twin. The body is the product's own, with only `service_tier: "flex"` set.
- **How:** synchronously, one at a time, with OpenAI's recommended 15-minute client timeout.
- **The rules:**
  - a 429 ("Resource Unavailable") is documented unbilled, so the question is asked again after 60 s, at most three times;
  - anything else is an unknown charge, held in full and never asked again.
- **Tested before any purchase:** `selftest-e6b.ts`, 10/10. Its first run caught a real bug before any money moved: the run's final report read the ledger after the database had been disconnected.

| Question | Flex | Latency | Charged (standard equivalent) | Synchronous twin |
| --- | --- | ---: | ---: | --- |
| newyork-v12-1 | pass, served by `flex` | 55 s | $0.017714 ($0.035428) | pass, $0.035838 |
| sydney-v12-1 | pass, `flex` | 59 s | $0.018533 ($0.037065) | pass, $0.027715 |
| paris-v12-2 | pass, `flex`, untruncated | 62 s | $0.023925 ($0.047850) | **truncated**, $0.052100 |
| giza-v12-2 | **503** `server_error` after 6 s | — | **unknown, $0.066 held** | pass, $0.030540 |

**What it establishes:**
- Flex served each of the three answers itself (`service_tier: "flex"`), at exactly half its standard equivalent.
- Latency was 55–62 s, about the synchronous median of 63 s. In this sample, Flex fits the product's 270 s slice.
- All three answers read `pass`. paris-v12-2's synchronous twin was truncated; its Flex answer completed.

**What it does not establish:**
- **1 in 4 failed with a 503.** Only a 429 is documented as unbilled for Flex, so the 503 stays unknown and holds its world until a person reconciles it. A world asks about 32 Sol questions, so at a rate like this most worlds would hold. Before Flex can be used, the product needs one of two things:
  - a documented basis for treating a 5xx as unbilled;
  - a retry only for failures proven unbilled.
- **Product pricing.** The product's Sol reader prices only the `default` tier (`local-patch-judge.ts:674`). In today's product, a Flex answer would be an unknown charge, so pricing must change first.
- **A rate.** Four questions are a sample.

## 3. What this means for a ~$3 world

These are projections, not measurements. The honest average is measured on delivered worlds.

| Purchase | Channel evidence |
| --- | --- |
| Paintings at LOW | Validated: the E4 world, and E6a's 3/3 at the first try. |
| Opus on Anthropic Batch | Validated as a channel (E5): half price, 4 answers in 1 h 34 min. |
| Sol on OpenAI Batch | **Not validated:** 0/4 answered in 3 h (E5). |
| Sol on OpenAI Flex | **Promising:** 3/4 at half price in about a minute. One 503 is held as unknown. |

- **For this world,** Sol on Flex or on Batch projects the same: $2.759757, ≈ $2.83 with identity. Both are half price.
- **With Sol synchronous,** it projects $3.286008.

## 4. Money and what needs a person

- **E6a:** $0.439717 settled. Paintings $0.054672, reviews $0.385045.
- **E6b:** $0.060172 settled, plus $0.066 unknown.
- **Unknown charges to reconcile** against OpenAI's usage, never by assumption:

  | Run | Question | Held |
  | --- | --- | ---: |
  | E4a | giza-v12-2, timeout | $0.066 |
  | E5 | the request cancelled before it started | $0.033 |
  | E6b | giza-v12-2, 503 | $0.066 |

- **Decisions for Guy and Codex:**
  - wiring content v13, and which version the wizard sells;
  - the Sol channel: Flex with a 5xx policy and Flex pricing, or synchronous;
  - Codex's review of `e6-run.ts` and `e6b-flex.ts`. **Nothing more was spent past these two runs.**

## 5. Signatures

All files are private and git-ignored, in `work/claude-qa-v19-check-20261014`.

| File | SHA-256 |
| --- | --- |
| `work/private-e6-runner/antarctica-v13.ts` | `f4e90cbcba5362d48eb9e751f86fe702fc1b92d6698f4f39305a41312c6eac3f` |
| `work/private-e6-runner/e6-run.ts` | `e5d4b3b9f866e80a762a41a3dbe404df2925334b69ccd2902ef597dc581b8acb` |
| `work/private-e6-runner/run-e6.ts` / `run-e6.ps1` | `021d87b4ae9233df146f2f0932216b7569178b6421347b537058409d0f392078` / `5e3816f0630e57615d62e54763f49b55106b922eb37596693875315efc7dad5b` |
| `work/private-e6-runner/selftest-e6.ts` (19/19, `logs/selftest-e6-1.log` `759c0e4f3b85ebe5792af6b11b4bb1c0b8600d327eafd2b0f4c8f09707ea9d07`) | `81abaeeefea99375bea5f381141ad245afa2f0b55548bb868dc19492c61065ec` |
| `work/private-e6-runner/manifest-e6.json` | `1cb58f0821fc4d06f392d50298a7d62b16178a77f7db679618334c19d3c882ac` |
| `work/private-e6-runner/out/e6.json` / `out/purchases-e6.sqlite` | `d2a4b2b440a50655d4681a2c9c98a254b1507051fa32d25a30d731ae1e0dc1d1` / `414e866bb82a909a87d2654cb0925a78864cb5489dd999cdcc2b6cd4c1207dcf` |
| `work/private-e6-runner/compare.ts` / `out/compare-antarctica-v12-vs-v13.jpg` | `d9b9ea47661fdcd2d1058edd213b0576731511f2673ea1bff0c75eb963988fbc` / `f0fd6272f42d20c9aefcb035f1c6b04de31ce1ebbdbb238a0d8ec71ab84b2db3` |
| `work/private-channels/e6b-flex.ts` | `c6fad76caf9bd75fa8a3f9537e08fab5fa9414e7e118da39b541d45bbf386e48` |
| `work/private-channels/run-e6b.ts` / `run-e6b.ps1` | `217d982eff54078bb03a0b6f26cfd751d76a811355e11093e9d749ab7288a115` / `ffc4151b8033d197d5323eb793b06435ef17f48a29b509fc41b64c94c55a95ca` |
| `work/private-channels/selftest-e6b.ts` (10/10, `logs/selftest-e6b-2.log` `ced69942edf9b84a95584e74ea41e5e1579781403db4e17d8457d40833343b72`) | `1c54b410fb4996d0f5d94fb5c13383b4e8330a1d51e2cc9cd040fe96fd320305` |
| `work/private-channels/out-e6b/e6b.json` / `out-e6b/purchases-e6b.sqlite` | `2f051500f301f9a6d22bb155e52b6f91f74cd3138a5d54466dfe1f9c6d4ecbdd` / `c1ac782400f1cbf49e47eb2ae18f5ce22101a8e4d3e971b06246bdbd3457becb` |
