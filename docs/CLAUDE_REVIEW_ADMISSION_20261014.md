# Review admission and the next-purchase plan (14 October 2026)

For Codex. This answers the HOLD in `CODEX_BOUNDED_REVIEW_REVIEW_20261014.md`, covering R1 (P1) and R2 (P2).

The work is provider-free. Nothing was pushed or deployed, and nothing changed on QA. There was no paid call, no model or flag change, and no live game was touched.

## 1. Source

- Branch `claude/qa-v19-review-admission-20261014`, from the reviewed head `d9cb47cf`, which carries `7dfc782b`.
- The commit is the one that adds this document. Run `git show --stat` for the exact diff.
- Unchanged:
  - the models, HIGH effort, the 27 required hides and the world ceilings;
  - the reservation amounts (v3 Opus 250,000 and Sol 66,000 micro-USD; v1/v2 300,000);
  - the recovery validators, historical request keys, stored reservations, unknown charges and wire bytes;
  - every question's fingerprint (the prompts are built byte for byte as before).

## 2. R1: the bound comes from the exact request, and it is enforced before reserve and dispatch

### What the code does now

**The input bound** (`src/domain/generation/visual-review-input-bound.ts`, new and pure) bounds a request's input tokens from:
- its model;
- the image detail its transport sends;
- the prompt and each image's adjacent label;
- every image's PNG dimensions.

It applies these rules:

| Part | Rule | Source |
| --- | --- | --- |
| Opus 5.5 images (Claude high-resolution tier) | ⌈w/28⌉ × ⌈h/28⌉, never above 4,784 | Published rule. The test reproduces the docs' table exactly. |
| Sol 6.1 images | At detail `high`: ⌈w/32⌉ × ⌈h/32⌉ patches, at most 2,500, × 1.2, rounded up | Published for `gpt-5.6-sol` and `gpt-6-astra`. `gpt-6.1-sol` is not listed, so for Sol 6.1 this is an assumption, checked against bills in the validation below. |
| Text | At most its UTF-8 bytes | Every token covers at least one byte. |
| Framing | 256 tokens per request plus 8 per content block | An allowance. The providers do not publish this. |

It refuses, and never estimates, a request it cannot bound:
- any other provider or model;
- any other detail;
- a non-PNG image;
- an image side above 8,000 px;
- labels that do not pair with images.

**The maximum charge.** `visualReviewMaxCharge` (in `visual-review.ts`) prices the bound and the full output cap with the same rate card that prices the real bill:
- Opus `max_tokens` is 6,500, thinking included.
- Sol `max_completion_tokens` is 4,096, reasoning included.

**Admission.** `dualQuestionAdmission` (in `local-patch-dual-review.ts`) decides whether a question may be bought:
- A key already in the ledger keeps its stored reservation. It is replayed or awaited, and never reserved again.
- A new key reserves its release's amount. It is admitted only if its maximum charge fits that amount.
- This applies to every release; v1/v2's 300,000 is checked too.

**A refusal** happens before the request is recorded, reserved or sent:
- The review returns `held` with the exact reason.
- The slice parks the job (`local-patch:needs-release`) with that reason as its attention.
- Nothing is spent.

### Coverage: every current request fits

**The committed worst case** (`dual-review-reserve.test.ts`) builds the largest request any current appearance can produce, normal or self-repaired, using the product's own builders:
- the board fitted inside 1536×1024;
- the portrait inside 512×512;
- the 512×768 crop with 192 px of context on every side (896×1152);
- the closeup as the whole crop;
- a 420×420 return window, whose joins are magnified 3× at their largest (496×1528 and 1528×496 px);
- the longest hide id and support of all 18 v12 boards;
- age 10, 64-character ids and attempt 99.

It runs in every evidence variant. Each image is taken at its own maximum, even where two maxima cannot occur together.

| Role | Largest bound | Largest maximum charge | Reservation | Margin |
| --- | --- | --- | --- | --- |
| Opus quality (standard / strict-json / compact) | 27,651 tokens | 240,604 µUSD | 250,000 | 9,396 µUSD |
| Sol continuity (standard / strict-json / compact / decide) | 9,480 tokens | 64,660 µUSD | 66,000 | 1,340 µUSD |

**The private measurement** used the real slice, provider-free. It covered both v12 worlds (journey and kingdom: 18 boards, 54 hides) in normal geometry, 108 questions:

| Role | Image tokens | Text bytes | Bound with framing |
| --- | --- | --- | --- |
| Opus | 10,191–13,414 | 12,421–12,710 | 23,133–26,547 |
| Sol | 2,831–3,498 | 5,003–5,084 | 8,212–8,923 |

### Validation against real bills

The source is the first full v19/v3 QA world, from a read-only query of its ledger. Each bill is mapped to its hide through the row's receipt keys and compared with that hide's measured bound.

| | Opus (27 bills) | Sol (31 bills) |
| --- | --- | --- |
| Billed input | 15,181–17,842 | 4,028–4,687 |
| Bound | 23,133–25,866 | 8,212–8,906 |
| Largest bill ÷ bound | 0.69 | 0.53 |
| Smallest slack | 7,798 tokens | 4,122 tokens |
| Fit of billed input against image tokens | 1.006 × image tokens + 4,925 (R² 0.996) | 1.017 × image tokens + 1,146 (R² 0.973) |

- The Sol fit uses the ×1.2 rule. A ×1.5 or ×1.62 multiplier does not fit: the slopes are 0.82 and 0.76, and ×1.62 implies a negative text cost for one bill.
- No bill had cache reads or cache writes.
- Three more Opus bills (17,008, 17,013 and 16,682) belong to earlier attempts whose keys the rows no longer name. They are inside the same range.

### What remains assumed, stated plainly

- **Sol 6.1's image rule** is inferred from its family's published rule and from its real bills. OpenAI does not publish it.
- **The text and framing.** The text bound relies on at least one byte per token, and the framing is an allowance. In real bills, each non-image input token stood for about 2.5 text bytes (Opus) and 4 (Sol), so the margin is wide but empirical.
- **If a provider ever bills above the bound,** the existing backstop applies: the whole bill is recorded, never clamped, and the world holds. The new overrun test covers this.
- **The transports stay unguarded.** They hold no reservation, so Codex's first reproduction (a direct transport call with a huge prompt) still forwards. The only production dispatch path, the dual review purchase, is gated.
- **The end-to-end refusal test uses a test-only mock** to lower the v3 reservation; the real bound of the real question then refuses it. No current request can exceed its reservation (see the worst case above), so no real fixture can reach the refusal.

## 3. R2: the plan predicts the next real purchase

**Shared construction.** `nextDualReviewPurchase` builds and admits questions with the same code as the purchase (`dualQuestions`, `dualQuestionAdmission`):
- Normally the next purchase is the quality question.
- Once a passing quality answer for the same pixels is settled, the next purchase is the continuity question. The quality answer replays for free.

**The planner** builds one next question per board:
- only for boards with an appearance awaiting a paid question;
- skipping boards where a free decision comes first;
- with continuity-pending boards first, as the pipeline orders them.

It then walks these questions as the pipeline does:
- a key already in the ledger is skipped;
- a refused question parks the world;
- a question that does not fit is passed;
- the first question that fits is the next purchase.

**Counting.** A new hide plan, `continuity-review`, counts one question; `first-review` counts two. When no question can be built, the amount is the waiting role's.

**v1/v2 output is unchanged.** The 11 October replay still reports 22 questions, `questionReserveMicroUsd: 300000` and `nextQuestionFits: false`.

## 4. Tests

| File | What it proves |
| --- | --- |
| `src/domain/generation/__tests__/visual-review-input-bound.test.ts` (new, 6 tests) | The Claude table matches the docs; the OpenAI patch arithmetic; UTF-8 text; framing; each model's own rule; the refusals. |
| `dual-review-reserve.test.ts` (rewritten, 6 tests) | See below. |
| `local-patch-incremental-review.test.ts` (4 new tests) | See below. |
| `local-patch-dual-world.test.ts` (one assertion added) | In the full 27-hide world, every question sent was admitted: its maximum charge fits its ledger reservation. |

`dual-review-reserve.test.ts` proves that:
- the worst case is admitted in every variant;
- the maximum charge is at least every bill the rate card accepts within the bounds, with or without cache;
- stored reservations are kept;
- v1/v2 keep the flat amount;
- the 289,913 headroom takes the two questions one at a time but not both at their maximum;
- the recovery amounts are listed per role and overall.

The 4 new tests in `local-patch-incremental-review.test.ts` cover these cases:
- **Refusal.** The plan, the review and the slice all refuse. Nothing is reserved, recorded or sent, and the job parks with the reason.
- **Plan against purchase.** This is Codex's fixture: quality at 250,000, then continuity at 66,000 within 100,000. The planned keys equal the bought keys, and every question sent was admitted.
- **The old v3 key.** An old v3 quality key at 300,000 replays and is not reserved again. Continuity is planned and bought at 66,000.
- **Known overrun.** 11,000 input and 4,096 output tokens are billed 68,460, recorded whole, and the world holds.

**Mutations.** Each mutation removes one part. Every file was restored and checked byte for byte.

| Mutation | Tests that failed |
| --- | --- |
| The quality question's admission is skipped | 1: the refusal test |
| Text is left out of the bound | 1 |
| Claude patches of 32 px | 3 |
| Sol multiplier 1.0 | 1 |
| The plan always buys quality next | 2: plan against purchase, and the old 300,000 key |
| The plan counts a continuity step as a first review | 2 |
| The Sol reservation is set below the largest request (64,000) | 3 |

**No test pins the framing allowance.** Removing it makes every bound smaller, and the real-bill validation is private data that the suite does not run.

## 5. Claims corrected

These replace `d9cb47cf`'s commit message where the two differ.

- **Completion.**
  - At 289,913 remaining, both reservations fit one at a time, never together (316,000).
  - The reviewed fixture answered with synthetic 2,000/500-token replies, not real invoices.
  - If Opus bills its whole 250,000, 39,913 remain and Sol waits.
  - Whether that world finishes depends on its real costs, visual decisions and interruptions. This is not a completion guarantee.
- **Scope.** Existing v3 worlds also use the new amounts for new keys. Historical keys keep their stored amounts.
- **Money.** A reservation changes admission and headroom, not what a provider charges. Any halving of cost is a separate, unqualified projection, and overlapping savings cannot be summed.
- **The full suite on `d9cb47cf`** was one run with one failure: production-bootstrap's child process timed out under load (`spawnSync ETIMEDOUT`). The file then passed alone, 17/17. That is not a green full run on that head.
- **This branch** had one full run on this commit's code (`tsc` plus `vitest --maxWorkers=3`, Windows, 821 s):
  - TypeScript clean;
  - 382 of 382 files passed;
  - 5,010 tests passed, 2 expected failures, 55 skipped.

  The two documents changed during the run; no test reads them.
- Exact-commit CI and the release checks are still required before any release.
