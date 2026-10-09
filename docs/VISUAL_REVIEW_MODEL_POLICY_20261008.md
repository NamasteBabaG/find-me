# Prospective visual review policy — 8 October 2026

**Runtime follow-up, 9 October:** the QA release now includes prospective game-level enrollment, the two-role main-pipeline integration and retained publication proofs described in `QA_DUAL_VISUAL_REVIEW_20261009.md`. Statements below saying "not activated" describe the earlier authoring/comparison rounds. Actual activation requires the exact release's completed CI, deployment and authenticated health verification; source changes alone are not evidence that QA has switched.

The user requested `claude-opus-5-5` for reference likeness, style, lighting, anatomy and scene integration, and `gpt-6.1-sol` for independent final-image head/body continuity. Following the user's explicit preference on **9 October 2026**, the prospective authoring route defaults to **HIGH for both**. One shared default drives the policy and scene-quality entry points; the private head review also reads that policy. Future request keys, saved review names and calibration checks use the selected effort. Existing MED/HIGH comparison receipts retain their actual effort and cost. Image generation remains `gpt-image-2`. This is an implemented and narrowly calibrated authoring route, **not an activated QA runtime release**.

## Cost decision

Verified standard global prices per million tokens:

| Model | Ordinary input | Output including reasoning | Selected effort |
| --- | ---: | ---: | --- |
| Claude Opus 5.5 | $4 | $20 | high |
| GPT-6.1 Sol | $2 | $10 | high |

Sources: [Opus 5.5 specification and pricing](https://platform.claude.com/docs/en/models/opus-5-5/overview), [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort), [GPT-6.1 Sol specification and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Medium and high have the same per-token prices; their total consumption can differ. There is no fixed percentage surcharge. On the controls below, high changed neither the acceptance decisions nor the two defect detections. Medium is the documented default for Opus 5.5; Sol medium was cheaper and faster in this pair. These single runs do not establish a population-wide quality or latency advantage. The transport supports adaptive thinking for Opus and `reasoning_effort` for Sol. Limits are 6,500 and 4,096 output tokens respectively, inclusive of reasoning; truncation cannot become approval.

The initial selection was MED. The user's subsequent instruction, “אם ההבדל כזה תשאיר על HIGH”, supersedes that recommendation for both roles. HIGH already completed the paid comparison below, so changing the default required no new paid call or image render. This records a product preference; it does not invent a measured quality advantage for HIGH. Explicit MED remains available for historical replay and controlled comparisons.

Opus cache writes are $5 (5-minute) or $8 (1-hour), and reads $0.20. Its cache counters are additive to ordinary input. Sol cached input is $0.10 and cache writes $2.50; if its write counter is absent the estimator conservatively charges uncached input at the write rate. Long-context, unexpected tier/region/tool costs, malformed usage or another model remain unknown. Historical `gpt-5.6-sol` receipts are never repriced.

## Implementation and evidence

- `src/domain/generation/visual-review-policy.ts` pins provider, exact model, effort, timeout, output bound and rate-card version by role.
- `src/infra/generation/anthropic-visual-review.ts` sends one labelled Messages request, extracts only text output, validates model/receipt/completion and keeps the deadline active through response-body reading. There is no hidden retry or fallback.
- `src/services/generation/visual-review.ts` binds prompt, all image hashes, adjacent labels and complete model policy into a fingerprint. `buyVisualReview` uses the existing retained-purchase ledger and refuses missing credentials/evidence before reservation. A changed role/model/effort cannot replay an earlier answer under its old request key.
- The private authoring entry points use Opus for prospective scene review and Sol for prospective AFTER-only head review. The second-reference experiment also requires Opus credentials before buying an image. Old private sample state and receipts preserve their original model and selection. Current runtime contracts/default judges remain frozen, and this is not an activated QA release.
- Live Opus answers wrapped the JSON document in one Markdown JSON fence despite the prompt requesting JSON only. The prospective parser now accepts that exact envelope and then runs the unchanged strict verdict/evidence/boundary schema. It does not extract JSON from arbitrary prose or relax a failed boundary. The original response bytes and receipts remain unchanged. Both purchased answers were successfully reparsed locally with zero extra provider calls. Historical parsers retain their old behavior.

Focused mocked tests cover role/effort routing, wire shape, prices and cache accounting, invalid evidence, missing key, wrong model, truncated output, timeouts while reading the body, unknown charges, retained replay and rejection of a changed effort under an existing key. These tests prove control flow, not model detection quality.

Before the later $7 grant and JSON-envelope fix, `npm run check -- --maxWorkers=4` passed TypeScript and all **367 test files**, with **4,698 passing tests, 2 expected failures and 55 skipped** (464.86 seconds). The log is ignored local evidence at `work/model-policy-full-check-20261008.log`. The focused adapter/continuity run passed 14 tests. The first sandbox invocation failed to load tests due to Windows `realpath` permissions; the permitted rerun executed the tests. The authoring dry runs made zero provider calls, and all 27 placement/source checks passed. There was no commit, push or deployment.

## Live comparison results

The user configured `ANTHROPIC_API_KEY`. Official read-only model metadata requests returned HTTP 200 for both exact IDs; Anthropic reports image input and medium/high support. Credentials were not printed or committed. The later explicit reply `מאשר` approved a **$7 total private authoring cap**, continuation with both existing unknown reservations retained in full, and four named review comparisons on retained pixels. It did not authorize new image rendering or customer cap changes. The private grant rejects any new reservation outside those four comparison keys.

| Model / evidence per request | MED usage estimate | HIGH usage estimate | Result in both efforts | Observed MED / HIGH duration |
| --- | ---: | ---: | --- | --- |
| Opus 5.5, one Antarctica hide, eight labelled images | $0.096876 | $0.096976 | Pass, including all required boundaries | 35.0 s / 22.2 s |
| Sol 6.1, four AFTER-only control cases, eight labelled images | $0.019885 | $0.028645 | Reject two known defects; accept two good counterparts | 28.8 s / 50.0 s |

These are conservative usage-based ledger estimates, not invoices. Opus had 17,449 input tokens in both calls, matching the free token count, and 1,354/1,359 output tokens. Sol had 3,510 input tokens and 1,111/1,987 output tokens. Its absent cache-write counter is conservatively priced as described above. Sol HIGH cost about **44.1% more** in this comparison; Opus differed by **$0.000100**. The Sol amounts cover four cases per call, not a single hide. They are not reliable per-game forecasts. The four new calls total **$0.242382**, with **zero new image renders**.

Sol identified the New York seller's face merging into the kiosk and the Tokyo walker whose body remains below unrelated shoes without a connected head. It accepted the corresponding intact images. Expected labels were not sent. The prompt, labels and image hashes were identical across efforts. These four cases were reused during development, so they are **not an independent holdout**. The Opus comparison contains one good example and provides no negative-control evidence for its rejection sensitivity. The earlier `gpt-5.6-sol` calibration and all 27 selected sample approvals retain their original provenance; four comparisons do not rejudge the full catalog under the new models.

The first, separately retained Sol MED attempt from the earlier sandbox had no content, receipt or usage. Its full $0.15 remains unknown. The later connected comparison has new immutable keys and does not replace or settle that request. The original lost $0.20 review is also unchanged. Both unknowns count toward the new cap; no cost was assigned zero and no ledger was reset.

Current private accounting: **42 settled image purchases, 51 settled review purchases; $5.654234 settled estimates + $0.350000 unknown reserves = $6.004234 committed**, leaving **$0.995766** under $7. No pending, conflict or confirmed overrun rows exist. The grant permits only the completed comparisons; the numerical remainder is not general spending authorization. Customer limits remain **$5/world**. A free audit reconstructed all nine boards exactly, verified all 27 selected examples and retained settled receipts, and proved every pre-approval request and prior continuation record unchanged.

Focused checks after the grant/parser changes passed **25 tests in four files**. The final required `npm run check -- --maxWorkers=4` then passed TypeScript and **367/367 files: 4,701 passed, 2 expected failures, 55 skipped** (463.12 seconds; exit 0). The complete ignored log is `work/model-policy-approved-seven-check-20261008.log`. `git diff --check` also passed. The free audit confirmed 42 image receipts, 51 review receipts, both unchanged unknown reservations and nine exact board reconstructions. Broader visual validation on unseen defects and a second reference, main runtime integration and authenticated QA verification remain outstanding. There was no commit, push or deployment.

## HIGH preference follow-up — 9 October 2026

`VISUAL_REVIEW_DEFAULT_EFFORT` is now `high`. Both scene-quality entry points share it, and the private head-continuity runner reads the same policy. Private request keys and review filenames derive their effort from the policy, and the anatomy preflight reads the corresponding retained HIGH control results. Explicitly selected MED questions and every historical receipt stay unchanged. The earlier comparisons already verified both HIGH transports; this follow-up made zero paid calls.

Both authoring preflights passed without provider calls. The emitted Antarctica inputs pin `claude-opus-5-5/high` and `gpt-6.1-sol/high`. No source artwork, customer cap, active runtime binding or QA deployment changed. The HIGH policy check log is `work/model-policy-high-check-20261009.log`.

The full HIGH-policy check passed TypeScript and 366 of 367 files, with 4,700 passing tests, one failure, two expected failures and 55 skipped (509.93 seconds). The sole failure was the existing offline `production-bootstrap` schema subprocess reaching its 15-second `spawnSync` timeout. Its source and the bootstrap implementation were unchanged. An isolated one-worker rerun of that entire file together with `visual-review.test.ts` passed **26/26 tests in both files** (4.31 seconds); see `work/model-policy-high-focused-20261009.log`. This supports a load-sensitive timeout but does not relabel the full invocation as green. `git diff --check` and both local authoring preflights passed. No extra paid calls were made to verify the preference change.
