import { QualityBatchRefused, type QualityBatchResult, type QualityBatchTransport } from "./types";

/**
 * Anthropic Message Batches over raw HTTP, like the product's synchronous Opus
 * transport: one request per call, no hidden retry, `redirect: "error"` so the
 * key never follows a redirect. Endpoints (platform.claude.com, checked
 * 2026-10-16): POST /v1/messages/batches, GET /v1/messages/batches (newest first,
 * `after_id`, `limit` up to 1000), GET /v1/messages/batches/{id},
 * GET /v1/messages/batches/{id}/results (JSONL), POST .../{id}/cancel,
 * DELETE /v1/messages/batches/{id} ("To delete an in-progress batch, cancel it first").
 *
 * Results are read from the documented path built from a checked batch id, never
 * from a URL the provider supplies, so the key is only ever sent to this host.
 * A result set counts only when it adds up to the batch's own `request_counts`.
 */
const BASE = "https://api.anthropic.com";
const BATCH_ID = /^msgbatch_[A-Za-z0-9]{1,200}$/;
const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;
/** Documented Anthropic refusals, answered before anything is created. Only these, with their error envelope, prove absence. */
const REFUSALS: ReadonlyMap<number, { transient: boolean }> = new Map([[400, { transient: false }], [401, { transient: false }],
  [403, { transient: false }], [404, { transient: false }], [413, { transient: false }], [429, { transient: true }]]);
/** A batch created this long before an intent could still carry it: two clocks are compared. */
export const QUALITY_BATCH_CLOCK_SKEW_MS = 5 * 60_000;
/** Pages a search reads before it reports itself undecided, which blocks any new create. */
const MAX_LIST_PAGES = 20;
const CREATE_TIMEOUT_MS = 90_000, READ_TIMEOUT_MS = 30_000;

type Answer = { readonly status: number; readonly ok: boolean; readonly text: string };
const parse = (text: string): Record<string, unknown> | null => {
  try { const value: unknown = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
};
const checkedBatch = (batchId: string) => {
  if (typeof batchId !== "string" || !BATCH_ID.test(batchId)) throw Error("QUALITY_BATCH: not a Message Batch id");
  return batchId;
};
const DOCUMENTED_COUNTS = ["processing", "succeeded", "errored", "canceled", "expired"] as const;
/** How many results an ended batch's own record says it has (every count it states, none still
 * processing); null when the record cannot say. */
function endedRequestCount(batch: Record<string, unknown>): number | null {
  const counts = batch.request_counts;
  if (batch.processing_status !== "ended" || !counts || typeof counts !== "object" || Array.isArray(counts)) return null;
  const values = Object.values(counts as Record<string, unknown>);
  if (DOCUMENTED_COUNTS.some(name => !Object.hasOwn(counts, name)) || (counts as Record<string, unknown>).processing !== 0
    || values.some(value => !Number.isSafeInteger(value) || (value as number) < 0)) return null;
  const total = (values as number[]).reduce((sum, value) => sum + value, 0);
  return Number.isSafeInteger(total) ? total : null;
}

export class AnthropicMessageBatches implements QualityBatchTransport {
  readonly namespace = "anthropic:find-me-existing";
  constructor(private readonly apiKey: string, private readonly fetchOnce: typeof fetch = fetch) {
    if (!apiKey.trim()) throw Error("ANTHROPIC_API_KEY is required for Message Batches");
  }

  /** The whole answer, body included, inside one deadline. */
  private async call(path: string, init: { method: "GET" | "POST" | "DELETE"; body?: string }, timeoutMs: number): Promise<Answer> {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await this.fetchOnce(`${BASE}${path}`, { ...init, redirect: "error", signal: abort.signal,
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" } });
      return { status: response.status, ok: response.ok, text: await response.text() };
    } finally { clearTimeout(timer); }
  }

  async create(requests: readonly { customId: string; params: Record<string, unknown> }[]) {
    if (!requests.length || new Set(requests.map(r => r.customId)).size !== requests.length || requests.some(r => !CUSTOM_ID.test(r.customId)))
      throw Error("QUALITY_BATCH: a batch needs distinct, well-formed custom ids");
    // A throw here (network, timeout) leaves the create uncertain, and propagates as one.
    const answer = await this.call("/v1/messages/batches", { method: "POST",
      body: JSON.stringify({ requests: requests.map(r => ({ custom_id: r.customId, params: r.params })) }) }, CREATE_TIMEOUT_MS);
    const body = parse(answer.text);
    if (!answer.ok) {
      const error = body?.type === "error" && body.error && typeof body.error === "object" ? (body.error as { type?: unknown }).type : null;
      const refusal = REFUSALS.get(answer.status);
      if (refusal && typeof error === "string") throw new QualityBatchRefused(answer.status, error, refusal.transient);
      throw Error(`QUALITY_BATCH: create answered ${answer.status}; whether a batch exists is uncertain`);
    }
    if (typeof body?.id !== "string" || !BATCH_ID.test(body.id)) throw Error("QUALITY_BATCH: create answered without a batch id; whether a batch exists is uncertain");
    return { batchId: body.id };
  }

  /**
   * Absence is proven only by a complete inventory: every page, to its documented
   * end, and every ended batch's results adding up to that batch's own request
   * counts. Anything less throws, and a throw never permits a create.
   */
  async find(customId: string, sinceMs: number) {
    if (!CUSTOM_ID.test(customId) || !Number.isFinite(sinceMs)) throw Error("QUALITY_BATCH: invalid search");
    const proven: string[] = [];
    let undecided = false, after: string | null = null;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const answer = await this.call(`/v1/messages/batches?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { method: "GET" }, READ_TIMEOUT_MS);
      const list = parse(answer.text), data = Array.isArray(list?.data) ? list.data as Record<string, unknown>[] : null;
      if (!answer.ok || !list || !data || typeof list.has_more !== "boolean") throw Error(`QUALITY_BATCH: list answered ${answer.status} without a complete page`);
      let reachedIntent = false;
      for (const batch of data) {
        const created = Date.parse(String(batch?.created_at));
        if (typeof batch?.id !== "string" || !BATCH_ID.test(batch.id) || !Number.isFinite(created)) throw Error("QUALITY_BATCH: unreadable batch in a list");
        // Newest first: everything from here on is older than the intent.
        if (created < sinceMs - QUALITY_BATCH_CLOCK_SKEW_MS) { reachedIntent = true; break; }
        if (batch.processing_status !== "ended") { undecided = true; continue; }
        const expected = endedRequestCount(batch);
        if (expected === null) throw Error(`QUALITY_BATCH: ${batch.id} does not state its request counts`);
        if ((await this.resultsOf(batch.id, expected)).some(result => result.customId === customId)) proven.push(batch.id);
      }
      if (reachedIntent || !list.has_more) return { proven, undecided };
      if (!data.length || typeof list.last_id !== "string" || !BATCH_ID.test(list.last_id)) throw Error("QUALITY_BATCH: a list page promised more but gave no batch or no cursor");
      after = list.last_id;
    }
    return { proven, undecided: true };
  }

  async status(batchId: string) {
    const answer = await this.call(`/v1/messages/batches/${checkedBatch(batchId)}`, { method: "GET" }, READ_TIMEOUT_MS);
    const body = parse(answer.text), status = body?.processing_status;
    if (!answer.ok || body?.id !== batchId || (status !== "in_progress" && status !== "canceling" && status !== "ended"))
      throw Error(`QUALITY_BATCH: ${batchId} answered ${answer.status} without a recognised status`);
    return status;
  }

  /** Every result of an ended batch, checked against the batch's own record. */
  async results(batchId: string): Promise<QualityBatchResult[]> {
    const answer = await this.call(`/v1/messages/batches/${checkedBatch(batchId)}`, { method: "GET" }, READ_TIMEOUT_MS);
    const batch = parse(answer.text), expected = batch && batch.id === batchId ? endedRequestCount(batch) : null;
    if (!answer.ok || expected === null) throw Error(`QUALITY_BATCH: ${batchId} answered ${answer.status} without an ended record and its request counts`);
    return this.resultsOf(batchId, expected);
  }

  /** A result set is returned only whole: one result per request the batch counts, each id once. */
  private async resultsOf(batchId: string, expected: number): Promise<QualityBatchResult[]> {
    const answer = await this.call(`/v1/messages/batches/${checkedBatch(batchId)}/results`, { method: "GET" }, READ_TIMEOUT_MS);
    if (!answer.ok) throw Error(`QUALITY_BATCH: results of ${batchId} answered ${answer.status}`);
    const results = answer.text.split("\n").filter(line => line.trim()).map((line): QualityBatchResult => {
      const row = parse(line), result = row?.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
      if (!row || typeof row.custom_id !== "string" || !result) throw Error(`QUALITY_BATCH: unreadable result line in ${batchId}`);
      const customId = row.custom_id;
      if (result.type === "succeeded") return { customId, type: "succeeded" as const, message: result.message ?? null };
      if (result.type === "errored") {
        const error = result.error && typeof result.error === "object" ? result.error as Record<string, unknown> : null;
        const inner = error?.error && typeof error.error === "object" ? (error.error as { type?: unknown }).type : error?.type;
        return { customId, type: "errored" as const, errorType: typeof inner === "string" ? inner : null };
      }
      if (result.type === "canceled" || result.type === "expired") return { customId, type: result.type };
      return { customId, type: "unrecognized" as const, resultType: typeof result.type === "string" ? result.type : null };
    });
    // An empty body or a cut-off file is not "no result for this question": it is an unknown.
    const distinct = new Set(results.map(result => result.customId)).size;
    if (results.length !== expected || distinct !== results.length)
      throw Error(`QUALITY_BATCH: results of ${batchId} do not add up (${results.length} lines, ${distinct} distinct, ${expected} counted)`);
    return results;
  }

  async cancel(batchId: string) {
    const answer = await this.call(`/v1/messages/batches/${checkedBatch(batchId)}/cancel`, { method: "POST" }, READ_TIMEOUT_MS);
    if (!answer.ok) throw Error(`QUALITY_BATCH: cancel of ${batchId} answered ${answer.status}`);
  }

  async remove(batchId: string) {
    const answer = await this.call(`/v1/messages/batches/${checkedBatch(batchId)}`, { method: "DELETE" }, READ_TIMEOUT_MS);
    if (answer.status === 404) return;
    if (!answer.ok || parse(answer.text)?.type !== "message_batch_deleted") throw Error(`QUALITY_BATCH: deletion of ${batchId} not acknowledged (${answer.status})`);
  }
}
