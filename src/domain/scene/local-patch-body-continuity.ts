import { z } from "zod";
import { visualReviewPolicy } from "../generation/visual-review-policy";

const STATES = ["coherent", "absent", "broken", "unsure"] as const;
const HEAD_CONNECTIONS = ["connected", "naturally-occluded", "missing", "merged", "none", "unsure"] as const;
export const CONTINUITY_FAULT_KINDS = ["missing-head", "merged-face", "disconnected-limb", "impossible-occlusion", "hard-cut", "other-anatomy"] as const;

/** One reading of one answer. A paid answer is never re-read under a reader its
 * question was not asked for, and every decision names the reader that made it. */
export const CONTINUITY_READER_STRICT = "continuity-read/v1-strict-600" as const;
export const CONTINUITY_READER_BOUNDED = "continuity-read/v1-output-bounded" as const;
export const CONTINUITY_READER_CROWD = "continuity-read/v2-crowd" as const;
export const CONTINUITY_READERS = [CONTINUITY_READER_STRICT, CONTINUITY_READER_BOUNDED, CONTINUITY_READER_CROWD] as const;
export type ContinuityReader = typeof CONTINUITY_READERS[number];

/**
 * The historical reader capped every trace at 600 characters and every fault
 * location at 400, while its question asked the judge to describe ALL people in
 * one trace and never stated a limit. Complete, coherent answers of 745-2,232
 * characters were therefore unreadable, and each unreadable answer bought
 * another. The output-bounded reader keeps the same answer contract but derives
 * its single bound from the question's own output ceiling: no text field can be
 * longer than the whole visible answer the provider is allowed to return, and an
 * answer longer than eight characters per allowed token is not a normal answer.
 */
const OUTPUT_TOKEN_CEILING = visualReviewPolicy("head-continuity", "high").maxOutputTokens;
export const CONTINUITY_FIELD_MAX = 4 * OUTPUT_TOKEN_CEILING;
export const CONTINUITY_RAW_MAX = 8 * OUTPUT_TOKEN_CEILING;

/** Stated to the judge, word for word, by the v2 crowd question; enforced here. */
export const CROWD_CONTINUITY_LIMITS = Object.freeze({
  people: 8, refMax: 40, traceMin: 12, traceMax: 200, occlusionMax: 160, faultsPerPerson: 3, whereMin: 8, whereMax: 200, unlistedMax: 99,
});

type Bounds = { traceMax: number; occlusionMax: number; whereMax: number; faultsMax: number; rawMax: number };
const STRICT: Bounds = { traceMax: 600, occlusionMax: 600, whereMax: 400, faultsMax: 8, rawMax: Infinity };
const BOUNDED: Bounds = { traceMax: CONTINUITY_FIELD_MAX, occlusionMax: CONTINUITY_FIELD_MAX, whereMax: CONTINUITY_FIELD_MAX, faultsMax: 32, rawMax: CONTINUITY_RAW_MAX };

const caseFields = (b: Pick<Bounds, "traceMax" | "occlusionMax" | "whereMax" | "faultsMax">) => ({
  state: z.enum(STATES),
  visibleBody: z.boolean(),
  headConnection: z.enum(HEAD_CONNECTIONS),
  headTrace: z.string().min(12).max(b.traceMax),
  bodyTrace: z.string().min(12).max(b.traceMax),
  occlusion: z.string().max(b.occlusionMax),
  faults: z.array(z.object({ kind: z.enum(CONTINUITY_FAULT_KINDS), where: z.string().min(8).max(b.whereMax) }).strict()).max(b.faultsMax),
});
const reportSchema = (b: Bounds) => z.object({ cases: z.array(z.object({ id: z.string().min(1), ...caseFields(b) }).strict()).min(1).max(12) }).strict();
const STRICT_REPORT = reportSchema(STRICT), BOUNDED_REPORT = reportSchema(BOUNDED);
const L = CROWD_CONTINUITY_LIMITS;
const CROWD_REPORT = z.object({ cases: z.array(z.object({
  id: z.string().min(1),
  people: z.array(z.object({ ref: z.string().min(1).max(L.refMax), role: z.enum(["target", "bystander"]),
    ...caseFields({ traceMax: L.traceMax, occlusionMax: L.occlusionMax, whereMax: L.whereMax, faultsMax: L.faultsPerPerson }) }).strict()).min(1).max(L.people),
  unlisted: z.number().int().min(0).max(L.unlistedMax),
}).strict()).min(1).max(12) }).strict();

const bodyCaseSchema = z.object({ id: z.string().min(1), ...caseFields(STRICT) }).strict();
export type LocalPatchBodyContinuityCase = z.infer<typeof bodyCaseSchema>;
/** One judged person. Version-one cases are one person-like entry per case. */
export type ContinuityPerson = LocalPatchBodyContinuityCase & { role: "target" | "bystander" | null };
export type ContinuityFaultCode = "empty" | "syntax" | "oversize" | "shape" | "length" | "count" | "ids";
/** A machine code and a JSON path only: the answer's text is private evidence. */
export type ContinuityReadFault = { code: ContinuityFaultCode; path: string };
export type ContinuityReading =
  | { ok: true; reader: ContinuityReader; crowd: boolean; people: ContinuityPerson[] }
  | { ok: false; reader: ContinuityReader; fault: ContinuityReadFault };

/** A located contradiction is retained as a defect; missing cases never pass. */
export function parseLocalPatchBodyContinuity(raw: unknown, requiredIds: readonly string[]) {
  const read = readStructured(raw, requiredIds, CONTINUITY_READER_STRICT);
  return read.ok ? read.people.map(({ role: _role, ...item }) => item) : null;
}

/**
 * The whole answer text, read once under one named reader. One JSON document,
 * optionally inside one Markdown JSON fence; never a fragment pulled from prose,
 * never a truncated prefix. A defect anywhere in the answer stays in it.
 */
export function readLocalPatchBodyContinuity(text: string | null, requiredIds: readonly string[], reader: ContinuityReader): ContinuityReading {
  const fail = (code: ContinuityFaultCode, path = ""): ContinuityReading => ({ ok: false, reader, fault: { code, path } });
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return fail("empty");
  const rawMax = reader === CONTINUITY_READER_STRICT ? STRICT.rawMax : CONTINUITY_RAW_MAX;
  if (trimmed.length > rawMax) return fail("oversize");
  const fenced = trimmed.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i);
  let value: unknown;
  try { value = JSON.parse(fenced?.[1] ?? trimmed); } catch { return fail("syntax"); }
  return readStructured(value, requiredIds, reader);
}

function readStructured(value: unknown, requiredIds: readonly string[], reader: ContinuityReader): ContinuityReading {
  const fail = (code: ContinuityFaultCode, path = ""): ContinuityReading => ({ ok: false, reader, fault: { code, path } });
  if (!requiredIds.length || new Set(requiredIds).size !== requiredIds.length) return fail("ids");
  const schema = reader === CONTINUITY_READER_STRICT ? STRICT_REPORT : reader === CONTINUITY_READER_BOUNDED ? BOUNDED_REPORT : CROWD_REPORT;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!, path = issue.path.join(".");
    if (issue.code === "too_big" || issue.code === "too_small") return fail(issue.origin === "string" ? "length" : issue.origin === "array" && path !== "cases" ? "count" : issue.origin === "array" ? "ids" : "shape", path);
    return fail("shape", path);
  }
  const cases = parsed.data.cases as { id: string }[];
  if (cases.length !== requiredIds.length || new Set(cases.map(c => c.id)).size !== requiredIds.length
    || cases.some(c => !requiredIds.includes(c.id))) return fail("ids", "cases");
  if (reader !== CONTINUITY_READER_CROWD) return { ok: true, reader, crowd: false, people: (cases as LocalPatchBodyContinuityCase[]).map(c => ({ ...c, role: null })) };
  const people: ContinuityPerson[] = [];
  for (const [index, item] of (parsed.data as z.infer<typeof CROWD_REPORT>).cases.entries()) {
    if (new Set(item.people.map(p => p.ref)).size !== item.people.length) return fail("ids", `cases.${index}.people`);
    for (const { ref, ...person } of item.people) people.push({ ...person, id: `${item.id}#${ref}` });
  }
  return { ok: true, reader, crowd: true, people };
}

/**
 * One person, or one historical case. Repair outranks every uncertainty.
 * A historical case summarised the whole crowd, so "coherent with no visible
 * body" could only be a contradiction. In the crowd contract each person is
 * judged alone, and a peeking head whose own body is hidden by a named solid
 * occluder is a coherent person, not a defect.
 */
export function localPatchContinuityPersonDisposition(c: Omit<LocalPatchBodyContinuityCase, "id">, crowd = false): "pass" | "repair" | "unresolved" {
  const explained = c.headConnection === "naturally-occluded" && c.occlusion.trim().length >= 20;
  const hiddenBody = crowd && c.state === "coherent" && !c.visibleBody && explained;
  if (c.state === "broken" || c.faults.length > 0 || c.visibleBody && ["missing", "merged", "none"].includes(c.headConnection)
    || c.state === "absent" && c.visibleBody || c.state === "coherent" && !c.visibleBody && !hiddenBody) return "repair";
  if (c.state === "unsure" || c.headConnection === "unsure"
    || c.state === "coherent" && !(c.headConnection === "connected" || explained)
    || c.state === "absent" && c.headConnection !== "none") return "unresolved";
  return "pass";
}

export function localPatchBodyContinuityDisposition(cases: readonly Omit<LocalPatchBodyContinuityCase, "id">[] | null, crowd = false): "pass" | "repair" | "unresolved" {
  if (!cases?.length) return "unresolved";
  const each = cases.map(c => localPatchContinuityPersonDisposition(c, crowd));
  return each.includes("repair") ? "repair" : each.includes("unresolved") ? "unresolved" : "pass";
}

/**
 * Why a runtime crowd case is not a pass, for the recovery policy. The case
 * covers the complete final context, which must contain the target that the
 * independent quality review saw: no visible target is a contradiction between
 * the two reviews, never a corroborated pass.
 */
export function localPatchRuntimeContinuityVerdict(read: ContinuityReading): {
  disposition: "pass" | "repair" | "unresolved"; reason: "pass" | "defect" | "unsure" | "conflict" | "unreadable";
} {
  if (!read.ok) return { disposition: "unresolved", reason: "unreadable" };
  const base = localPatchBodyContinuityDisposition(read.people, read.crowd);
  if (base === "repair") return { disposition: "repair", reason: "defect" };
  if (base === "unresolved") return { disposition: "unresolved", reason: "unsure" };
  if (read.crowd) {
    const targets = read.people.filter(p => p.role === "target");
    if (targets.length !== 1 || targets[0]!.state !== "coherent") return { disposition: "unresolved", reason: "conflict" };
    return { disposition: "pass", reason: "pass" };
  }
  return read.people.some(p => p.state === "absent" || !p.visibleBody) ? { disposition: "unresolved", reason: "conflict" } : { disposition: "pass", reason: "pass" };
}
