# Review cost: a compact-answer qualification plan and a Sol quality-judge experiment (14 October 2026)

This is a plan only, prepared at Codex's request (`CODEX_BOUNDED_REVIEW_REVIEW_20261014.md`, "cost work"):
- It changes no deployed judge and buys nothing.
- Running a qualification needs Guy's authorization for its spend.
- Moving the quality judge from Opus to Sol is a model-policy change and needs his direct authorization.

Guy's goal is a world at about half today's cost: around $2.90 instead of $5.71.

## 1. Where the first full v19/v3 QA world's money went

Read-only, from its ledger: $5.710087 for 26 of 27 hides published.

| Purchase | Count | Total | Each, on average | Share |
| --- | --- | --- | --- | --- |
| Opus 5.5 quality reviews | 30 | $3.073 | $0.102 | 54% |
| Paintings (gpt-image-2, with the identity sheet) | 31 | $1.492 | $0.048 | 26% |
| Sol 6.1 continuity reviews | 31 | $1.088 | $0.035 | 19% |
| Self-repair diagnosis (gpt-5.6-sol) | 1 | $0.056 | | 1% |
| Identity style check (gpt-5.6-luna) | 1 | $0.001 | | 0% |

**Inside one Opus question:**
- Input is 16,892 tokens and two thirds of its price.
- The images are about 12,000 of those tokens: the board, the portrait, BEFORE, AFTER with its closeup, four join strips and four magnified joins. Their size is fixed by the question's evidence contract.
- Output is 1,743 tokens. The visible answer averages 2.7 KB (about 700 tokens); the rest is adaptive thinking.

**Inside one Sol question:**
- Input is 4,541 tokens, a third of its price.
- Output is 2,374 tokens, of which 1,901 (80%) are reasoning.
- 5 of 31 answers hit the 4,096 cap and had to be asked again.

Sol is priced on the product's conservative card: $2.50 per million input tokens when the reply gives no cache-write detail. The official rate is $2.

## 2. Compact answers (`compact-answer/v1`): what they can and cannot save

**What changes.** Only the visible answer:
- explicit, shorter bounds on every observation and trace field;
- the same checks, with every failed check still located;
- the same images, model, effort and reader rules.

**The ceiling on the saving.** Halving the visible answers saves about 350 Opus and 235 Sol output tokens per hide. That is about $0.007 + $0.0024 per hide, roughly $0.28 per 30-question world, or 5%. **This is not a route to half price.**

**What it does not fix.**
- Sol's truncations ran out on reasoning, not on the answer.
- A higher output cap raises every worst-case reservation and need not end thinking-only truncation.
- Reasoning effort is a review-strength change, not a format change.

**Versioning.**
- It would be a new pinned review release, with new questions and new fingerprints.
- Worlds keep the release they pinned at draft.
- Its readers are versioned, and its reservations are recomputed from the new contract.
- Admission refuses anything the reservation cannot cover (`CLAUDE_REVIEW_ADMISSION_20261014.md`).

## 3. Qualification protocol, to run only when authorized

1. **Evidence.** Use controlled identities and the known controls from the v19 qualification only. No customer image is sent to a provider; the QA world's child is never reused. The set covers:
   - clean appearances;
   - cut heads, orphan limbs and broken object joins;
   - wrong scale and wrong identity.
2. **Design.** Every control gets the standard question and the compact one: the same pixels, model and effort, in an alternating order. Record, per check:
   - the verdict;
   - the located faults;
   - the output tokens;
   - the finish reason.
3. **Acceptance.** All five must hold:
   - zero known defects missed that the standard question caught;
   - false rejections of clean controls no higher than the standard question's;
   - every compact answer read by its reader;
   - truncations no more frequent than the standard question's;
   - savings reported as measured distributions (median and p95), never projected.
4. **Size.** For example, 24 controls × 2 variants × 2 roles = 96 questions:
   - about $6.50 in expected charges (48 × $0.10 + 48 × $0.035);
   - $15.17 if every question billed its whole reservation (48 × $0.25 + 48 × $0.066), the most the run could cost.
5. **Result.** A qualification report for Codex's review, and nothing deployed before that review.

## 4. Sol 6.1 as the quality judge (Guy's request)

**What it changes.** It replaces Opus in the quality role. Two questions to one model are not independent reviews, so the product could no longer claim cross-model independence. There are two honest shapes:
- **Sol for both questions.** One model asks two separate questions, and it is labelled that way.
- **Sol for quality, another model for continuity.** This keeps two vendors.

**It must be tested on:**
- known valid and invalid controls;
- the child's scale;
- likeness;
- anatomy;
- background and object joins;
- false rejections.

The comparison is against Opus's verdicts on the same pixels.

**Price, a projection.** A Sol quality question on today's evidence would be about 14,500 input tokens: about 10,900 for its images under the 32-px patch rule, and about 3,500 for its 12.6 KB of text. Its output on this question is unknown; at 2,400 tokens it costs about $0.060 against Opus's $0.102. That saves roughly $1.2 per 30-question world. This is unqualified, and the real output volume decides it.

## 5. Other levers

Each lever needs its own decision or qualification. Their savings overlap and must not be summed.

| Lever | Effect | What it needs |
| --- | --- | --- |
| Paintings at a cheaper quality | up to about $0.7 per world if half price | a visual test on the controls |
| Sol continuity at medium effort | fewer reasoning tokens, amount unknown | a review-strength qualification on anatomy controls |
| Smaller or fewer evidence images | the largest share of Opus input | a review-change qualification; never a way to make a money claim true |
| One question per hide instead of two | about one question's price | a policy decision: it removes the second review |
| 18 hides instead of 27 | | excluded: a product decision, not a technical cost fix |

**No single lever reaches $2.90.** A combination might approach it:
- Sol for quality;
- cheaper paintings;
- compact answers;
- fewer repeat questions after truncations.

Only a measured world can say how close it gets.
