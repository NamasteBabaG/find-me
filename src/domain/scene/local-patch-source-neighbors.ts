import { createHash } from "node:crypto";
import { z } from "zod";
import { sourceHeadIntersectsReturnBoundary, type PatchRectangle } from "./local-patch-return-region";

/** Companion to an existing visual release, never a reinterpretation of its replies.
 * These identities do not activate drafts, alter budgets or authorize purchases. */
export const SOURCE_NEIGHBOR_POLICY = "local-patch-source-neighbor/v1" as const;
export const SOURCE_NEIGHBOR_POLICY_ACTION = "generation:source-neighbor-policy" as const;
export const SOURCE_NEIGHBOR_CONTRACT_VERSION = "source-neighbor-contract/v1" as const;
export const SOURCE_NEIGHBOR_ANSWER_VERSION = "source-neighbor-answer/v1" as const;
export const SOURCE_NEIGHBOR_READER = "source-neighbor-read/v1" as const;
export const SOURCE_NEIGHBOR_BUNDLE_VERSION = "quality-source-neighbor-answer/v1" as const;
export const SOURCE_NEIGHBOR_LIMITS = Object.freeze({ neighbors: 8, afterPerNeighbor: 8, ref: 48,
  observation: 300, occluder: 160, raw: 32_768 });

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.string().min(1).max(SOURCE_NEIGHBOR_LIMITS.ref).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const coordinate = z.number().int().min(0).max(16_384);
const extent = z.number().int().min(1).max(16_384);
const rectangle = z.object({ left: coordinate, top: coordinate, width: extent, height: extent }).strict();
const source = z.object({
  // No URLs, traversal, query strings or private asset paths. The caller must
  // separately verify these declared bytes against the public release's file.
  art: z.string().max(512).regex(/^public\/scenes\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:webp|png)$/),
  sha256, width: extent, height: extent,
}).strict();
export const sourceNeighborContextSchema = z.object({ boardId: ref, hideId: ref, source,
  /** Board-relative crop; returnRect is relative to that crop. */
  crop: rectangle, returnRect: rectangle }).strict();
export const sourceNeighborContractSchema = sourceNeighborContextSchema.extend({
  version: z.literal(SOURCE_NEIGHBOR_CONTRACT_VERSION),
  /** Only the registered source neighbors, not a fixed count of the whole crowd.
   * Head/body rectangles are board-relative. A body rectangle is optional and
   * need not include the head (it may describe the visible torso/limbs only). */
  neighbors: z.array(z.object({ sourceId: ref, head: rectangle, body: rectangle.optional() }).strict())
    .min(1).max(SOURCE_NEIGHBOR_LIMITS.neighbors),
}).strict();
export type SourceNeighborContext = z.infer<typeof sourceNeighborContextSchema>;
export type SourceNeighborContract = z.infer<typeof sourceNeighborContractSchema>;
export type SourceNeighborFault = { code: "shape" | "ids" | "geometry" | "binding" | "source-head-boundary"
  | "empty" | "oversize" | "syntax"; path: string };
export type SourceNeighborPreflight =
  | { ok: true; contract: SourceNeighborContract; contractSha256: string }
  | { ok: false; fault: SourceNeighborFault };
const fault = (code: SourceNeighborFault["code"], path: string): Extract<SourceNeighborPreflight, { ok: false }> =>
  ({ ok: false, fault: { code, path } });
const contains = (outer: PatchRectangle, inner: PatchRectangle) => inner.left >= outer.left && inner.top >= outer.top
  && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
const canonicalContext = (c: SourceNeighborContext) => ({ boardId: c.boardId, hideId: c.hideId,
  source: { art: c.source.art, sha256: c.source.sha256, width: c.source.width, height: c.source.height },
  crop: { ...c.crop }, returnRect: { ...c.returnRect } });
const contractHash = (c: SourceNeighborContract) => createHash("sha256").update(JSON.stringify({
  version: c.version, ...canonicalContext(c), neighbors: [...c.neighbors].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0),
})).digest("hex");

function validatedContract(value: unknown): SourceNeighborPreflight {
  const parsed = sourceNeighborContractSchema.safeParse(value);
  if (!parsed.success) return fault("shape", parsed.error.issues[0]!.path.join("."));
  const c = parsed.data, board = { left: 0, top: 0, width: c.source.width, height: c.source.height };
  if (!contains(board, c.crop)) return fault("geometry", "crop");
  if (!contains({ left: 0, top: 0, width: c.crop.width, height: c.crop.height }, c.returnRect)) return fault("geometry", "returnRect");
  if (new Set(c.neighbors.map(n => n.sourceId)).size !== c.neighbors.length) return fault("ids", "neighbors");
  const returned = { ...c.returnRect, left: c.crop.left + c.returnRect.left, top: c.crop.top + c.returnRect.top };
  for (const [i, neighbor] of c.neighbors.entries()) {
    if (!contains(board, neighbor.head)) return fault("geometry", `neighbors.${i}.head`);
    if (neighbor.body && !contains(board, neighbor.body)) return fault("geometry", `neighbors.${i}.body`);
    if (sourceHeadIntersectsReturnBoundary(returned, neighbor.head)) return fault("source-head-boundary", `neighbors.${i}.head`);
  }
  return { ok: true, contract: c, contractSha256: contractHash(c) };
}

/** Pure before-purchase validation. `expected` comes from the independently
 * verified canonical release and selected hide, never from the model's answer.
 * Annotation coverage and rendered anatomy are not inferred by this function. */
export function prepareSourceNeighborContract(value: unknown, expected: unknown): SourceNeighborPreflight {
  const prepared = validatedContract(value);
  if (!prepared.ok) return prepared;
  const context = sourceNeighborContextSchema.safeParse(expected);
  if (!context.success) return fault("shape", `expected.${context.error.issues[0]!.path.join(".")}`);
  if (JSON.stringify(canonicalContext(prepared.contract)) !== JSON.stringify(canonicalContext(context.data)))
    return fault("binding", "context");
  return prepared;
}

export const sourceNeighborAnswerSchema = z.object({
  version: z.literal(SOURCE_NEIGHBOR_ANSWER_VERSION),
  contractSha256: sha256, candidateSha256: sha256,
  neighbors: z.array(z.object({
    sourceId: ref,
    outcome: z.enum(["preserved", "moved", "removed-whole", "replaced-whole", "naturally-occluded", "duplicated", "fragmented", "unsure"]),
    status: z.enum(["pass", "fail", "unsure"]),
    /** All surviving representations, including original fragments. Allow a
     * duplicate to be reported structurally, so it becomes repair, not a size
     * or schema error. Refs are unique within one source; sharing one across
     * sources is a reported merge and is decided as a visual defect. */
    after: z.array(z.object({ ref, rect: rectangle }).strict()).max(SOURCE_NEIGHBOR_LIMITS.afterPerNeighbor),
    remnants: z.enum(["none", "present", "unsure"]),
    occluder: z.string().trim().min(12).max(SOURCE_NEIGHBOR_LIMITS.occluder).nullable(),
    observation: z.string().trim().min(12).max(SOURCE_NEIGHBOR_LIMITS.observation),
  }).strict()).min(1).max(SOURCE_NEIGHBOR_LIMITS.neighbors),
}).strict();
export type SourceNeighborAnswer = z.infer<typeof sourceNeighborAnswerSchema>;
export type SourceNeighborDecisionFault = {
  code: "duplicated" | "fragmented" | "remnants" | "merged" | "explicit-failure" | "unsure" | "mapping-contradiction";
  sourceIds: string[]; afterRefs: string[];
};
export type SourceNeighborReading =
  | { ok: true; reader: typeof SOURCE_NEIGHBOR_READER; answer: SourceNeighborAnswer;
    disposition: "pass" | "repair" | "unresolved"; faults: SourceNeighborDecisionFault[] }
  | { ok: false; reader: typeof SOURCE_NEIGHBOR_READER; disposition: "unresolved"; fault: SourceNeighborFault };

/** One complete named document, optionally in one JSON fence. Never extracts a
 * convenient fragment or reads old quality/continuity prose as a new answer.
 * A readable visual defect wins over uncertainty. Invalid evidence/bindings
 * remain unresolved and cannot authorize a new painting. */
export function readSourceNeighborAnswer(raw: string | null, expected: {
  contract: unknown; contractSha256: string; candidateSha256: string;
}): SourceNeighborReading {
  const fail = (code: SourceNeighborFault["code"], path = ""): SourceNeighborReading =>
    ({ ok: false, reader: SOURCE_NEIGHBOR_READER, disposition: "unresolved", fault: { code, path } });
  const prepared = validatedContract(expected.contract);
  if (!prepared.ok) return fail(prepared.fault.code, `expected.${prepared.fault.path}`);
  if (expected.contractSha256 !== prepared.contractSha256 || !sha256.safeParse(expected.candidateSha256).success)
    return fail("binding", "expected");
  if (typeof raw !== "string" || !raw.trim()) return fail("empty");
  const text = raw.trim();
  if (text.length > SOURCE_NEIGHBOR_LIMITS.raw) return fail("oversize");
  const fenced = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i);
  let value: unknown;
  try { value = JSON.parse(fenced?.[1] ?? text); } catch { return fail("syntax"); }
  const parsed = sourceNeighborAnswerSchema.safeParse(value);
  if (!parsed.success) return fail("shape", parsed.error.issues[0]!.path.join("."));
  const answer = parsed.data;
  if (answer.contractSha256 !== expected.contractSha256 || answer.candidateSha256 !== expected.candidateSha256)
    return fail("binding", "answer");
  const ids = prepared.contract.neighbors.map(n => n.sourceId);
  if (answer.neighbors.length !== ids.length || new Set(answer.neighbors.map(n => n.sourceId)).size !== ids.length
    || answer.neighbors.some(n => !ids.includes(n.sourceId))) return fail("ids", "neighbors");
  const board = { left: 0, top: 0, width: prepared.contract.source.width, height: prepared.contract.source.height };
  for (const [i, neighbor] of answer.neighbors.entries()) {
    if (new Set(neighbor.after.map(a => a.ref)).size !== neighbor.after.length) return fail("ids", `neighbors.${i}.after`);
    if (neighbor.after.some(a => !contains(board, a.rect))) return fail("geometry", `neighbors.${i}.after`);
  }
  const defects: SourceNeighborDecisionFault[] = [], uncertain: SourceNeighborDecisionFault[] = [];
  const mapping = new Map<string, string[]>();
  const rectangles = new Map<string, { sourceIds: string[]; afterRefs: string[] }>();
  for (const n of answer.neighbors) {
    const item = (code: SourceNeighborDecisionFault["code"]): SourceNeighborDecisionFault =>
      ({ code, sourceIds: [n.sourceId], afterRefs: n.after.map(a => a.ref) });
    if (n.outcome === "duplicated" || n.after.length > 1) defects.push(item("duplicated"));
    if (n.outcome === "fragmented") defects.push(item("fragmented"));
    if (n.remnants === "present") defects.push(item("remnants"));
    if (n.status === "fail") defects.push(item("explicit-failure"));
    if (n.status === "unsure" || n.outcome === "unsure" || n.remnants === "unsure") uncertain.push(item("unsure"));
    const expectedCount = n.outcome === "removed-whole" ? 0 : n.outcome === "naturally-occluded" ? null : 1;
    if (expectedCount !== null && n.after.length !== expectedCount && n.after.length < 2
      || n.outcome === "naturally-occluded" && !n.occluder || n.outcome !== "naturally-occluded" && n.occluder !== null)
      uncertain.push(item("mapping-contradiction"));
    for (const a of n.after) {
      mapping.set(a.ref, [...(mapping.get(a.ref) ?? []), n.sourceId]);
      const key = JSON.stringify([a.rect.left, a.rect.top, a.rect.width, a.rect.height]);
      const same = rectangles.get(key) ?? { sourceIds: [], afterRefs: [] };
      same.sourceIds.push(n.sourceId); same.afterRefs.push(a.ref); rectangles.set(key, same);
    }
  }
  for (const [afterRef, sourceIds] of mapping) if (sourceIds.length > 1)
    defects.push({ code: "merged", sourceIds, afterRefs: [afterRef] });
  // Different refs at the exact same native rectangle do not establish two
  // independent people. That is ambiguous evidence, not a proven visual merge;
  // ordinary overlaps remain valid and an explicit defect still wins below.
  for (const same of rectangles.values()) {
    const sourceIds = [...new Set(same.sourceIds)], afterRefs = [...new Set(same.afterRefs)];
    if (sourceIds.length > 1 && afterRefs.length > 1)
      uncertain.push({ code: "mapping-contradiction", sourceIds, afterRefs });
  }
  return { ok: true, reader: SOURCE_NEIGHBOR_READER, answer,
    disposition: defects.length ? "repair" : uncertain.length ? "unresolved" : "pass", faults: [...defects, ...uncertain] };
}
