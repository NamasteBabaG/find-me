# Codex's v19 follow-up answered: R1 closed, the qualification contract finished, the full check green (13 October 2026)

**Status: nothing bought, nothing sent to any provider, nothing deployed.**
- The product source is unchanged since `578f3c3d`, the snapshot Codex reviewed. This note is the only tracked change.
- The two runners are private and git-ignored, each with a README for review:
  - `work/private-real-photo-runner/`: the real-photo test;
  - `work/private-pv19-runner/`: the v19 qualification.
- Codex's order stands:
  1. Codex re-reviews both runners.
  2. Guy approves one cap for the v19 qualification.
  3. Codex reviews its result, and one release is selected explicitly.
  4. Only then does the photo test go to Guy for its own cap.

## R1: the runner binds the experiment it will actually run

**The finding.** The photo runner bound labels (release names, hide ids, reader versions), not the content behind them. Codex changed one hide's wardrobe after `--through=identity`, and the run bought nine new items with the changed prompt.

**The fix.** It is a binding of the effective experiment, computed from the very objects and bytes a launch is about to use (`photo-binding.ts`):

| Part | Covers |
| --- | --- |
| `sources` | Every byte of `src/`, `content/` and `prisma/`, without local database files such as the git-ignored `prisma/ci.db`. This covers prompt bodies, review policies, providers, catalogs and the identity style's art. |
| `runner` | The runner's own files, including the reused v17/v18 `run-guard.ts`, `v18-guard.ts` and `v18-run.ts`. Their hashes are unchanged; `v18-run.ts` is still `91976899…`. |
| `hides.<id>` | The hide's definition, its board's definition, the board art's bytes, the release's fixed scenery (version, polygons, coverage) and the exact painter prompt the product composes |
| `identity` | The style actually sent (atlas and catalog) and the first sheet's prompt |

**Enforcement, in order:**
1. **Before any database or provider:** the binding is recomputed and compared with the reviewed one carried in the manifest. Any difference is refused, naming the differing paths.
2. **At the first purchase:** it is bound into the run identity, so a resumed launch with anything else is refused.
3. **Before each painting's reservation:** that hide's part is rechecked.
4. **At the painter:** a request whose prompt differs from the bound one is refused. This last check should never fire: the self-test proves the composed prompt is byte for byte the request's.
5. **Refusals** are appended to `run/refusals.jsonl` and never write or overwrite `results.json`. A manifest, photograph or release that is not the reviewed one is a recorded refusal as well.

**Codex's acceptance matrix** (self-test, synthetic photograph, network blocked):

| Change | Before the first purchase | After `--through=identity` |
| --- | --- | --- |
| a hide's wardrobe | refused, zero purchases, drift named | refused, zero new purchases, the identity-only report kept |
| a hide's geometry | same | same |
| a board pixel | same | same |
| the fixed scenery's geometry | same | same |
| a prompt body under the same version label (an edited copy of `src/`) | same | same |

- The unchanged continuation then replays Phase A and buys Phase B exactly once.
- A change after completion is refused and never overwrites the `complete` report; the unchanged experiment still replays complete, buying nothing.
- A change during a launch stops at that hide's render, before its reservation, with no unknown charge.

**Results:**
- Self-test: **76 of 76**. That includes the last addition: a manifest that is not the reviewed one is a recorded refusal too, never a thrown error.
- Mutation check (`mutate.cjs`) on the final file (`photo-run.ts` `76eb16ea…`): **11 of 11 caught**, each by the check written for it. Three are R1's own: drift against the reviewed manifest ignored; a hide not rechecked before its purchase; an unreviewed manifest thrown instead of recorded. The original was restored and hash-verified after each.

## Three corrections Codex asked for

- **`tries: 1` fixed nothing.** `createCharacter` already makes one transport attempt whenever a style contract is present (`src/infra/generation/openai.ts:287`). The explicit setting is defense in depth only, and the README and the code comment now say so.
- **Observed prices are estimates, not upper bounds.** Each run's cap is its reservation limit: neither an estimate of spend nor permission to launch.
- **No silent fall-back to v15.** The photo test's manifest names v19 provisionally. The release it uses is selected explicitly after Codex reviews the v19 qualification's result.

## The v19 qualification contract (pv19)

**The qualification:** one Opus HIGH review per pinned picture (v3 object-joins question, reader v2). The labels were pinned before any answer is bought:

| Picture | Label | Why |
| --- | --- | --- |
| `B-a10` NY, v17 (`8987d91b…`) | reject | the sliced taxi sign |
| `A-a10` NY, v17 (`7f5d3801…`) | reject | the ledge at the crop's edge |
| `A-a6` GW, v17 (`e164056c…`) | pass | the uncontested clean positive |
| `B-a6` NY composed by v19 (`3faf3f32…`, the digest Codex recorded independently) | pass | the clean New York positive, with harmlessly redrawn flowers |
| `B-a6` NY, v17 (`7a0d1c84…`) | observe-only | borderline severity calibration, never gated |

- **The gate** is v18's reviewed `qualifies` rule on the four gated rows. A failed gate paints nothing.
- **The second harmless-change positive** from another board is explicitly excluded from this scope.

**The paintings:** four New York paintings under v19, identities A and B at ages 6 and 10. Before its reviews, each accepted painting must:
- carry its v2 record, restoring 37,076 pixels;
- have **all 36,348 pixels the sign and awning fully cover equal to the original board's own pixels**. This answers Codex's follow-up: compare the restored pixels, not only the receipt.

Then Opus and Sol review each one.

**The binding:** the same scheme as R1, plus:
- the pinned pictures' and sheets' bytes;
- the boards' art;
- the evidence hides;
- each case's painter prompt.

The contract also checks the product's scenery itself.

**The cost, stated once:**
- **Estimate:** about $1.25, up to about $1.43 at observed rates. My earlier "$1.44" was this estimate.
- **Cap: $1.70.** It is the run's reservation limit: each review reserves $0.30 on top of what is already committed. It is separate from the photo test's $1.30.

**Checks:**
- Dry run: pins, binding and manifest match (`00e63dd1…`).
- Self-test: **46 of 46**, covering:
  - both gate directions, with the borderline row never deciding;
  - a tampered awning pixel, a missing record and a wrong count each stopping before reviews;
  - R1 before the first purchase, after a stop and during a launch;
  - cap, lock and identity;
  - the v18 run's files unchanged byte for byte.
- Mutation check (`mutate-pv19.cjs`): **8 of 8 caught**, each by the check written for it:
  - the gate ignored;
  - the borderline case deciding the gate;
  - restored pixels not compared with the board;
  - the v2 record not required;
  - drift ignored;
  - a case not rechecked before its purchase;
  - the product's scenery not checked against the contract;
  - the record's restored count not checked.

  The original was restored and hash-verified after each.

## The full check

| Run | Result |
| --- | --- |
| `--maxWorkers=3` at `578f3c3d`, clean tree | **Green.** tsc clean; all 377 test files pass (4,962 tests, 2 expected failures, 55 skipped); exit 0, 892 s |
| `npm run check` with default workers | 2 timeouts, both in `local-patch-incremental-review.test.ts`. That file passes alone, 72 of 72; it takes ~10 min alone. |

## Hashes for the review

Private runner files (git-ignored), final as reviewed:

| File | SHA-256 |
| --- | --- |
| `work/private-real-photo-runner/photo-binding.ts` | `f37d22430ced072923b581e30565675dfb88375df481c6b89132dcfdde7b4ef7` |
| `work/private-real-photo-runner/photo-guard.ts` | `eeb760f7b9f9572e49181cb00e32050ae94e52f5dda29e8c9bfa837e673790c4` |
| `work/private-real-photo-runner/photo-run.ts` | `76eb16eace7b098c3d3427445a6c6b28beb20c7e3e48a9a1e7860df0f89a3cd1` |
| `work/private-real-photo-runner/run-photo.ts` | `c6845e8738058b467af4e74316979b7c895431167693b115017e8a265f435eea` |
| `work/private-real-photo-runner/run-photo.ps1` | `1dc4e8e2c2833140eb21b8c207091a3060b2320ace998e59a94ef7e7cf456984` |
| `work/private-real-photo-runner/selftest-photo.ts` | `bf8344573538fb99b43164d50750f3314367de3e741c201f9c9fe3852888545d` |
| `work/private-real-photo-runner/mutate.cjs` | `f859841e721b15675335baf38378b660c928137984424df3d9374ac5953ce91b` |
| `work/private-real-photo-runner/manifest-photo.json` | `a2faf483ba249dc045d63867ce1ca3124f325235fff26697df194ec70f29f4d9` |
| `work/private-pv19-runner/pv19-guard.ts` | `2f85d5acd310bb226b995d22b27aa2456ec2863c8854b18597aa5ef1271feb0f` |
| `work/private-pv19-runner/pv19-run.ts` | `611ee8d7060ae672e6437c2189ae5531de43998a7028940ed6083b99de081151` |
| `work/private-pv19-runner/run-pv19.ts` | `0036d5ef47c41c684946a4b501925f9e1044366610d3b37120be96400f4d81fd` |
| `work/private-pv19-runner/run-pv19.ps1` | `1dfbd94efbcd0dc8413cf2a516d305eb5069302a7fba0cc2700331fd87736e13` |
| `work/private-pv19-runner/selftest-pv19.ts` | `24f8dd4c6c69e279a03cf8cecf48ce335ed4a7e3e7212e53f81fe1999bf39ad1` |
| `work/private-pv19-runner/mutate-pv19.cjs` | `c6144435e57c715e834c7d28f77d34dff6043f98909983bddd170e51710aa7ca` |
| `work/private-pv19-runner/manifest-pv19.json` | `f0ab9965efa88d57563d063eb6b3b43a8d7c332ddb4feb54e0aaad477efea51f` |
| `work/private-v16-controlled-render-20261012/run-guard.ts` | `de249a648c7a19f09752b318d277337ca35b0f42240e813951e2be6648516471` |
| `work/private-v16-controlled-render-20261012/v18-guard.ts` | `8d44038a2742ff2299a8134da1010da0bf1500505abf2f2c8135737266b17a0c` |
| `work/private-v16-controlled-render-20261012/v18-run.ts` | `919768994ed8ecc665ced33eeb60f590ac4d7566910148df4d835016decd98d3` |

Effective bindings the manifests carry, recomputed by each dry run as **matches**:

- the photo test: `fb07ef8529b7471a…` (manifest `a2faf483…`). Its release is v19 provisionally; see above.
- the v19 qualification: `00e63dd1968e2aa9…` (manifest `f0ab9965…`).

Both bind `src/` `469b9403…`, `content/` `56bfca13…` and `prisma/` `99a269cf…` (local database files skipped). That is the product source of `578f3c3d`; this note changes only `docs/`, which no binding covers.
