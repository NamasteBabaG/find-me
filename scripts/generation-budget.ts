/** Durable request-by-request budget for authoring. No HTTP of its own. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

type Bill = { costCents: number; costUnknown?: boolean; model?: string; png?: Buffer; rawPng?: Buffer };
type Entry = { id: number; kind: string; reserve: number; state: "pending" | "known" | "unknown"; cents: number; response?: unknown; error?: string };
export class GenerationBudget {
  private entries: Entry[] = [];
  private readonly file: string;
  private readonly fingerprint: string;
  constructor(private readonly dir: string, private readonly limit: number, config: unknown) {
    if (!Number.isFinite(limit) || limit <= 0) throw new Error("positive finite budget required");
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "requests.json");
    this.fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    if (existsSync(this.file)) {
      const old = JSON.parse(readFileSync(this.file, "utf8"));
      if (old.fingerprint !== this.fingerprint || old.limit !== limit) throw new Error("request ledger inputs or budget changed");
      this.entries = old.entries;
    }
    this.save();
  }
  get spent() { return this.entries.reduce((n, e) => n + e.cents, 0); }
  get held() { return this.entries.some(e => e.state !== "known") || this.spent > this.limit; }
  private save() {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify({ fingerprint: this.fingerprint, limit: this.limit, spentCents: this.spent, held: this.held, entries: this.entries }, null, 2));
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
