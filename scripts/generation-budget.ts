/** Durable request-by-request budget for authoring. No HTTP of its own. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

type Bill = { costCents: number; costUnknown?: boolean; model?: string; png?: Buffer; rawPng?: Buffer };
type Entry = { id: number; kind: string; reserve: number; state: "pending" | "known" | "unknown"; cents: number; response?: unknown; error?: string };
type ContinuationApproval = {
  version: "generation-budget-continuation/v1";
  approvedBy: string; approvedAt: string; reason: string;
  ledgerSha256: string; ledgerSnapshot: string; unknownEntryIds: number[];
};
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Explicit operator action. Writes a separate immutable receipt, never edits or
 * releases the original ledger's unknown charges. Use under the caller's paid
 * lock; the receipt cannot authorize automatic retries or a higher allowance. */
export function writeGenerationBudgetContinuationApproval(ledgerFile: string, receiptFile: string, approval: {
  expectedLedgerSha256: string; unknownEntryIds: number[]; approvedBy: string; approvedAt: string; reason: string;
}): void {
  const ledgerSnapshot = readFileSync(ledgerFile, "utf8");
  if (sha256(ledgerSnapshot) !== approval.expectedLedgerSha256) throw new Error("CONTINUATION_STOP: ledger changed since operator review");
  const ledger = JSON.parse(ledgerSnapshot);
  const receipt: ContinuationApproval = {
    version: "generation-budget-continuation/v1", approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt, reason: approval.reason, ledgerSha256: approval.expectedLedgerSha256,
    ledgerSnapshot, unknownEntryIds: approval.unknownEntryIds,
  };
  validateContinuation(receipt, ledger.fingerprint, ledger.limit, ledger.entries);
  writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), { flag: "wx" });
}

function validateContinuation(receipt: ContinuationApproval, fingerprint: string, limit: number, entries: Entry[]): Set<number> {
  const fail = () => { throw new Error("CONTINUATION_STOP: invalid approval or changed historical ledger"); };
  if (receipt?.version !== "generation-budget-continuation/v1"
    || typeof receipt.approvedBy !== "string" || !receipt.approvedBy.trim()
    || typeof receipt.reason !== "string" || !receipt.reason.trim()
    || typeof receipt.approvedAt !== "string" || !Number.isFinite(Date.parse(receipt.approvedAt))
    || typeof receipt.ledgerSnapshot !== "string" || sha256(receipt.ledgerSnapshot) !== receipt.ledgerSha256
    || !Array.isArray(receipt.unknownEntryIds) || !receipt.unknownEntryIds.length
    || new Set(receipt.unknownEntryIds).size !== receipt.unknownEntryIds.length) fail();
  const original = JSON.parse(receipt.ledgerSnapshot);
  if (original.fingerprint !== fingerprint || original.limit !== limit || !Array.isArray(original.entries)
    || original.entries.length > entries.length
    || JSON.stringify(original.entries) !== JSON.stringify(entries.slice(0, original.entries.length))) fail();
  for (const id of receipt.unknownEntryIds) {
    const entry = original.entries.find((item: Entry) => item.id === id);
    if (!Number.isSafeInteger(id) || !entry || entry.state !== "unknown" || entry.cents !== entry.reserve) fail();
  }
  return new Set(receipt.unknownEntryIds);
}

export class GenerationBudget {
  private entries: Entry[] = [];
  private approvedUnknown = new Set<number>();
  private continuationApprovals: unknown[] = [];
  private readonly file: string;
  private readonly fingerprint: string;
  constructor(private readonly dir: string, private readonly limit: number, config: unknown,
    options: { continuationApprovalFile?: string } = {}) {
    if (!Number.isFinite(limit) || limit <= 0) throw new Error("positive finite budget required");
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "requests.json");
    this.fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    if (existsSync(this.file)) {
      const old = JSON.parse(readFileSync(this.file, "utf8"));
      if (old.fingerprint !== this.fingerprint || old.limit !== limit) throw new Error("request ledger inputs or budget changed");
      this.entries = old.entries;
      this.continuationApprovals = old.continuationApprovals ?? [];
    }
    if (options.continuationApprovalFile) {
      const bytes = readFileSync(options.continuationApprovalFile, "utf8");
      const receipt: ContinuationApproval = JSON.parse(bytes);
      this.approvedUnknown = validateContinuation(receipt, this.fingerprint, limit, this.entries);
      const audit = {
        receiptSha256: sha256(bytes), ledgerSha256: receipt.ledgerSha256,
        unknownEntryIds: receipt.unknownEntryIds, approvedBy: receipt.approvedBy,
        approvedAt: receipt.approvedAt, reason: receipt.reason,
      };
      if (!this.continuationApprovals.some(item => JSON.stringify(item) === JSON.stringify(audit))) this.continuationApprovals.push(audit);
    }
    this.save();
  }
  get spent() { return this.entries.reduce((n, e) => n + e.cents, 0); }
  get held() { return this.entries.some(e => e.state !== "known" && !(e.state === "unknown" && this.approvedUnknown.has(e.id))) || this.spent > this.limit; }
  private save() {
    const temp = `${this.file}.tmp`;
    // The ledger records bills and verdicts, not pictures: a judgement carries
    // the images it was shown as Buffers (wireImages), and fourteen of those
    // made a 500 MB file that JSON.stringify then refused (8 September 2026).
    // Buffers are dropped and long strings (prompts) cut; the pictures are the
    // caller's to keep as files.
    const compact = (_key: string, value: unknown): unknown => {
      if (Buffer.isBuffer(value)) return undefined;
      if (value && typeof value === "object" && (value as { type?: unknown }).type === "Buffer" && Array.isArray((value as { data?: unknown }).data)) return undefined;
      // A persisted truncation marker is already compacted. Re-truncating it
      // rewrites historical evidence on every save (and breaks approval hashes).
      if (typeof value === "string" && value.length > 4000 && !/^.{4000}…\[\d+ chars\]$/s.test(value)) return `${value.slice(0, 4000)}…[${value.length} chars]`;
      return value;
    };
    writeFileSync(temp, JSON.stringify({ fingerprint: this.fingerprint, limit: this.limit, spentCents: this.spent, held: this.held, entries: this.entries,
      ...(this.continuationApprovals.length ? { continuationApprovals: this.continuationApprovals } : {}),
    }, compact, 2));
    renameSync(temp, this.file);
  }
  async run<T extends Bill>(kind: string, reserve: number, fn: () => Promise<T>): Promise<T> {
    if (this.held) throw new Error("BUDGET_STOP: unresolved request or exceeded allowance; reconcile before spending again");
    if (!Number.isFinite(reserve) || reserve <= 0 || this.spent + reserve > this.limit) throw new Error("BUDGET_STOP: insufficient remaining allowance");
    const entry: Entry = { id: this.entries.length + 1, kind, reserve, state: "pending", cents: reserve };
    this.entries.push(entry);
    this.save(); // Process interruption cannot silently release this reservation.
    try {
      const result = await fn();
      const { png, rawPng, ...metadata } = result;
      // Persist raw evidence before any caller re-keying/composition/judging.
      if (rawPng?.length) writeFileSync(path.join(this.dir, `request-${entry.id}-raw.png`), rawPng);
      else if (png?.length) writeFileSync(path.join(this.dir, `request-${entry.id}-image.png`), png);
      entry.response = metadata;
      const unknown = result.costUnknown || !Number.isFinite(result.costCents) || result.costCents < 0;
      entry.state = unknown ? "unknown" : "known";
      entry.cents = unknown ? reserve : result.costCents;
      this.save();
      return result;
    } catch (error) {
      // Only a completed response can release a reservation, not an exception.
      entry.state = "unknown";
      entry.error = error instanceof Error ? error.message : String(error);
      this.save();
      throw error;
    }
  }
}
