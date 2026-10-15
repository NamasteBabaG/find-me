# Codex's review of E6 and the reconcile: four findings, fixed (16 October 2026)

Codex reviewed read-only, through the Codex app's binary (gpt-6.1-sol, read-only sandbox). The review is kept at `work/private-game/reviews/codex-review-e6-20261016.md`.

**Verdict: HOLD.** E6a's and E6b's saved results are supported. But two money-safety defects block any further Batch or Flex spending through this code until they are fixed and proven by provider-free regressions.

**What Codex verified independently:**
- **E6a.**
  - Its binding has no drift.
  - The private board equals `fd238042`'s, at digest `31b45c03…`.
  - All three paintings replay byte for byte through the product renderer, with dispatch disabled.
  - All six review fingerprints match their ledger purchases.
  - All three accepted children wear a winter hat, with their faces visible.
- **E6b.** All four question fingerprints match. The three answers name Sol and the `flex` tier, and their prices and latencies recompute. The 503 is correctly held in full.
- **Reconcile-only** cannot create, upload or resend.
- **Money:** $0.565889 exposure = $0.499889 settled + $0.066 unknown, agreeing with the read-only ledgers. No provider invoice has been verified.

**What was done since:**
- the four findings below were fixed;
- every fix has its own provider-free regression;
- each regression is proven by a mutant it alone catches;
- **nothing was bought, resent or deployed.**

## The findings and the fixes

### 1. P0: two processes could both create the same Batch

**The defect.** E5's on-disk round store read the record, checked the expected phase and claim time, then wrote a temporary file and renamed it. Nothing held two processes apart between the read and the write, so both could pass the check and both reach `create()`.
- Codex reproduced it against the store method itself.
- My concurrency test could not have caught it: it used an atomic, synchronous in-memory store.

**The fix:**
- **The store lock.** `fileRoundStore` (`e5-run.ts`) now reads, checks and writes under an exclusive lock file created with `O_EXCL`.
- **Crashes fail closed.** A lock left by a crashed writer is never broken automatically: writes fail until a person has checked that no writer is alive.
- **The run lock.** E5 also takes the durable run lock (`acquireRunLockFor`, as E4c and E6a do), so a second E5 launch is refused before it plans, polls or creates anything.

**The regression** (`selftest-store-procs.ts`, with `store-worker.ts`), as Codex asked:
- **The setup.** Two independent processes resume one lost create, against the real file store and one SQLite ledger.
  - A barrier in the provider makes both search before either claims.
  - The store's read-to-write window is widened to 300 ms.
- **The result.** **Exactly one creates**; the other's claim is refused by the store. It passed on four runs out of four.
- **Without the lock,** both processes claim and both create, and the mutant is caught.

### 2. P0: E6b priced any answer as Sol, whatever model gave it

**The defect.** E6b chose Sol's rate card without checking the answering model. A reply from another model, or naming none, settled at Sol's price and released the full reservation. Codex reproduced both cases offline.

**The fix** (`e6b-flex.ts`):
- The answering model must pass the product's own rule, `isTheModelWeAsked`: the exact model, or a dated snapshot of it.
- Otherwise the answer is kept and the full reservation is held as unknown.
- It is never asked again under another key.
- The three real answers named `gpt-6.1-sol`, so their amounts stand.

### 3. P1: cleanup reported success even when a deletion failed

**The defect.** `remove()` swallowed a failure to read the batch, and ignored rejected and unsuccessful DELETEs, while E5 logged "provider copy deleted".

**The fix** (`providers.ts`, `e5-run.ts`, `run-e5.ts`):
- **What counts as deleted:** an acknowledged deletion (OpenAI `deleted: true`; Anthropic `message_batch_deleted`), or a 404, meaning the copy is already gone.
- **What stays pending:** anything else.
- **An unreadable OpenAI batch** fails the cleanup, instead of passing as a batch with no files.
- **The run report** records each round's cleanup as `deleted (acknowledged)` or `pending: …`.
- **A report is never overwritten:** a later launch writes beside it.

**The historical cleanup, proven** (`verify-cleanup-e5.ts`):
- **The method:** one read-only GET per object on 16 October, with no DELETE.
- **The result:** every copy E5 tried to delete answers **404**:
  - both Anthropic batches;
  - both OpenAI input files;
  - the OpenAI error file.
- **What remains:** OpenAI keeps its two batch objects. They hold only metadata (status, counts, file ids), and its Batch API offers no way to delete them.
- **The evidence** is in `out-e5/cleanup-evidence.json`.
- **The 15 October document is corrected:** it now says the deletion was *attempted*, and that it is proven by 404.

### 4. P1: E6b kept too little of a failure, and a relaunch would degrade its report

**The defect:**
- A non-200 kept only its status and part of its body: no request id, no time.
- On relaunch, a held row came back with a null status and zero latency, and settled rows lost their standard-equivalent price.
- The launcher overwrote `e6b.json`.

**The fix:**
- **The envelope.** Every outcome now keeps a full one: request id, status, start time, latency, model, tier, usage and error.
- **The rows.** Every report row, fresh or replayed, is built only from what was kept. A relaunch reports exactly what the first launch did.
- **The first run's shapes.** The 15 October answers kept less, and they are read without inventing what they lacked: a missing request id or time is reported as null.
- **The report** is never overwritten.
- **The existing 503 stays as it is:** held, never re-asked. Its request id was not kept by the first run and cannot be recovered.

## Tests and mutants

| Suite | Result |
| --- | --- |
| `selftest-store-procs.ts`: two real processes, one store | 2/2; exactly one create, every run |
| `selftest-e5.ts` | **31/31** (8 new: cleanup acknowledgement, pending cleanup, unreadable batch, already-gone copies, the run lock) |
| `selftest-e6b.ts` | **18/18** (8 new: wrong model, no model, dated snapshot, held reservations whole, the 503 envelope, the relaunch, first-run shapes, no overwrite) |
| `selftest-channels.ts` | 37/37, unchanged |
| `mutate-codex-e6.cjs`: one mutant per fix | **9/9 caught, each by its own check** |
| `mutate-r2.cjs` / `mutate-channels.cjs`, re-run on the final code | 13/13 / 14/14 |

After every mutant, all mutated files were restored and their SHA-256 verified.

## Where this leaves the money and the next step

- **Unchanged:**
  - E6a: $0.439717 settled.
  - E6b: $0.060172 settled, plus $0.066 unknown.
  - E5: $0.201198 settled, plus $0.033 unknown.
  - E4a: $0.066 unknown.
- **Unknown charges** await a person reconciling them against OpenAI's usage.
- **No further paid step** was taken. Codex's HOLD named the P0 fixes and their regressions as its condition. Both are now in place, so Codex should re-check before anything else is bought.

## Signatures

| File | SHA-256 |
| --- | --- |
| `work/private-channels/e5-run.ts` | `45ee10c786c6d4287d0f99513e181c5edb1d1d18da8d426bf62315de15916414` |
| `work/private-channels/providers.ts` | `67b9cd87cc0c33e7dcf07453e2d5f0051f23086e42c904b8f8290d440e3c7a62` |
| `work/private-channels/run-e5.ts` | `19f0de64b82e1289cb1521e9c3e6d15546f3d03c48b68c086a237c10b8006138` |
| `work/private-channels/e6b-flex.ts` | `339543dac7a39983391eb389a56f95a8af98bc4c4c708967b3e3c396b2c3e989` |
| `work/private-channels/run-e6b.ts` | `ee23edfbc9688211067f37eaf1abb7a9ae9f1a2d89af9667d51aaf1d208ef18e` |
| `work/private-channels/store-worker.ts` / `selftest-store-procs.ts` | `768eba4ab706a596a643224b394c980a177de3569e53085273674e3cdc73d2d9` / `7130f1ff46188cd073bcaf3427a271cbc7e20776b6d00b1463271b98fc2eba5c` |
| `work/private-channels/selftest-e5.ts` (31/31) / `selftest-e6b.ts` (18/18) / `selftest-channels.ts` (37/37) | `66369e79bd4ad2f5ce12011ff95095a1d598227734414bdd25a21d463a1dfd85` / `4a125c5e38f6d5e63b446ce4edf2f52132ccd43a8094f8ed006cf10b39b04177` / `59dee6b518ae1b134a791c17d96209342d692b213d08bb825e82c21d770c349c` |
| `work/private-channels/mutate-codex-e6.cjs` / `mutate-codex-e6.json` | `4b0ed44c1311b1d6f196b0e984ff6b5c84905d102f9e38be7039f26a353aeaf9` / `0f99203334c19a411b90610494dcd5d29a1afc9391a5161c6841ffe999d2f1c2` |
| `work/private-channels/mutate-r2.json` / `mutate-channels.json` | `1ca10eb4bf52f4092a4ddd5c92f795fc4802c849ae7d1a7c9fad549271c798b2` / `fb78da7b60f229be34c189957ffa37305fb1d7a17773e68d88d37a717857ad2c` |
| `work/private-channels/verify-cleanup-e5.ts` / `verify-cleanup-e5.ps1` / `out-e5/cleanup-evidence.json` | `aa112e59a7307d66c3b4b3208bcdfc5cb4ac7c0bd66413df1e7c7d1383e92ada` / `458665722191719506b04fe5e193d2577b2073e04568e31b7d87dc8306a38e0a` / `929bf4a69676e715944d93c99b0d3d61809713d2b17f6d715670fb3d690962fd` |
| logs: `selftest-e5-codex.log` / `selftest-e6b-codex.log` / `selftest-channels-codex.log` / `selftest-store-procs.log` / `mutate-codex-e6.log` | `b864114b3eeb461d9d09c6a43115f4de2b896cf99f955332f2203a7970eb6f6b` / `ae785f4b9dc6ac5726da0a2e754e75d6787001b35938d7b2d5af09f8a5516c3f` / `98b140878a4dd1b09b4aebbbb7d141d609dc7ca38d775d7d2e46d519c450d6f6` / `b009a99125d10246607403dfc3ec71dad5d90df4df24f78593dc49d899ba4b68` / `1ff4832f06e8986ba145f168244462a892f13f8298fc6a32e88c229699c98562` |
| Codex's review: `work/private-game/reviews/codex-review-e6-20261016.md` | `ea30e0130bb82dd2a391d56d8cc3001f8dc2ff70fedf807516d3d22d54442248` |
