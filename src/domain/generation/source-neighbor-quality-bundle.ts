import { z } from "zod";
import { readSubjectQualityBundle, SUBJECT_QUALITY_BUNDLE_VERSION } from "./subject-quality-bundle";
import { readSourceNeighborAnswer, SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION,
  SOURCE_NEIGHBOR_LIMITS, SOURCE_NEIGHBOR_POLICY, SOURCE_NEIGHBOR_READER,
  type SourceNeighborFault, type SourceNeighborReading } from "../scene/local-patch-source-neighbors";

/** A new outer answer, never a change to the historical assessment document.
 * Limits belong to this named wrapper; they do not relax an inner reader. */
export const SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS = Object.freeze({ raw: 80_000, depth: 32 });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceNeighborQualityBundleBindingSchema = z.object({
  version: z.literal(SOURCE_NEIGHBOR_BUNDLE_VERSION), policy: z.literal(SOURCE_NEIGHBOR_POLICY),
  reader: z.literal(SOURCE_NEIGHBOR_READER), contractSha256: sha256, candidateSha256: sha256,
}).strict();
export type SourceNeighborQualityBundleBinding = z.infer<typeof sourceNeighborQualityBundleBindingSchema>;
const document = z.record(z.unknown());
const shape = z.object({ version: z.literal(SOURCE_NEIGHBOR_BUNDLE_VERSION), assessment: document,
  sourceNeighbors: document }).strict();
// Only identify the assessment's document family here. Its existing quality and
// subject readers must still decide every inner check; none is renamed or waived.
const qualityShape = z.object({ hides: z.array(document).min(1).max(12) }).strict();
export type SourceNeighborAssessment = { kind: "quality" | "quality-subject"; raw: string };
export type SourceNeighborQualityBundleFault = {
  code: "empty" | "oversize" | "syntax" | "shape" | "nested-envelope" | "depth" | "binding" | "assessment" | "neighbors";
  path: string; neighborFault?: SourceNeighborFault;
};
export type SourceNeighborQualityBundleReading =
  | { ok: true; binding: SourceNeighborQualityBundleBinding; assessment: SourceNeighborAssessment;
    /** This disposition applies only to source neighbors, never to the whole
     * assessment or to purchase/publication authority. */
    sourceNeighbors: Extract<SourceNeighborReading, { ok: true }> }
  | { ok: false; sourceNeighborDisposition: "unresolved"; fault: SourceNeighborQualityBundleFault };

/** An outer wrapper cannot be smuggled into an assessment/subject/neighbor
 * subtree. Walk iteratively so malformed deep JSON cannot exhaust the stack. */
function inspectContents(value: unknown): "nested-envelope" | "depth" | null {
  const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const item = pending.pop()!;
    if (item.depth > SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.depth) return "depth";
    if (!item.value || typeof item.value !== "object") continue;
    if (!Array.isArray(item.value) && (item.value as Record<string, unknown>).version === SOURCE_NEIGHBOR_BUNDLE_VERSION)
      return "nested-envelope";
    for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 });
  }
  return null;
}

/** One entire named JSON document, optionally in one complete JSON fence.
 * The mandatory assessment is preserved as JSON, not flattened to a verdict or
 * subject fragment. Malformed evidence stays unresolved, even beside a reported
 * duplication. A readable neighbor repair remains independent of assessment
 * claims; the caller must separately apply the original assessment's readers. */
export function readSourceNeighborQualityBundle(raw: string | null, expected: {
  contract: unknown; binding: unknown;
}): SourceNeighborQualityBundleReading {
  const fail = (code: SourceNeighborQualityBundleFault["code"], path = "", neighborFault?: SourceNeighborFault): SourceNeighborQualityBundleReading =>
    ({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code, path, ...(neighborFault ? { neighborFault } : {}) } });
  const binding = sourceNeighborQualityBundleBindingSchema.safeParse(expected.binding);
  if (!binding.success) return fail("binding", `expected.binding.${binding.error.issues[0]!.path.join(".")}`);
  if (typeof raw !== "string" || !raw.trim()) return fail("empty");
  const text = raw.trim();
  if (text.length > SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.raw) return fail("oversize");
  const fenced = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i);
  let value: unknown;
  try { value = JSON.parse(fenced?.[1] ?? text); } catch { return fail("syntax"); }
  const parsed = shape.safeParse(value);
  if (!parsed.success) return fail("shape", parsed.error.issues[0]!.path.join("."));
  for (const [key, inner] of Object.entries({ assessment: parsed.data.assessment, sourceNeighbors: parsed.data.sourceNeighbors })) {
    const invalid = inspectContents(inner);
    if (invalid) return fail(invalid, key);
  }
  const assessment = parsed.data.assessment;
  const assessmentRaw = JSON.stringify(assessment);
  let kind: SourceNeighborAssessment["kind"];
  if (assessment.version === SUBJECT_QUALITY_BUNDLE_VERSION) {
    // Delegate recognition of the historical strict subject wrapper to its own
    // reader. Keep BOTH original inner documents, including all failed checks.
    const inner = readSubjectQualityBundle(assessmentRaw);
    if (!inner || !qualityShape.safeParse(JSON.parse(inner.quality)).success) return fail("assessment", "assessment");
    kind = "quality-subject";
  } else {
    if (!qualityShape.safeParse(assessment).success) return fail("assessment", "assessment");
    kind = "quality";
  }
  const sourceNeighbors = readSourceNeighborAnswer(JSON.stringify(parsed.data.sourceNeighbors), {
    contract: expected.contract, contractSha256: binding.data.contractSha256, candidateSha256: binding.data.candidateSha256,
  });
  if (!sourceNeighbors.ok) return fail("neighbors", `sourceNeighbors${sourceNeighbors.fault.path ? `.${sourceNeighbors.fault.path}` : ""}`, sourceNeighbors.fault);
  return { ok: true, binding: binding.data, assessment: { kind, raw: assessmentRaw }, sourceNeighbors };
}

/** Append only for the new companion question; no historical prompt is edited.
 * The caller supplies the registered source IDs/regions and BEFORE/AFTER pixels
 * separately. This direction accepts closed binding data, never model prose. */
export function sourceNeighborQualityBundleDirection(value: SourceNeighborQualityBundleBinding): string {
  const binding = sourceNeighborQualityBundleBindingSchema.parse(value), limits = SOURCE_NEIGHBOR_LIMITS;
  return [
    `OUTPUT ENVELOPE ${SOURCE_NEIGHBOR_BUNDLE_VERSION}: return JSON only with exactly version, assessment, sourceNeighbors.`,
    "assessment must be the ENTIRE original assessment JSON object required above: either the plain quality document or the complete quality-subject-answer/v1 document with BOTH quality and subject. Preserve every check, failure, uncertainty and evidence ID. Do not flatten it, omit the subject, or nest another source-neighbor envelope.",
    `sourceNeighbors is a separate ${SOURCE_NEIGHBOR_ANSWER_VERSION} answer about one-to-one BEFORE-to-AFTER source correspondence, not an overall quality verdict. Wrapper binding metadata (do not add policy/reader fields to the answer): ${JSON.stringify(binding)}.`,
    `Its exact schema is {version:"${SOURCE_NEIGHBOR_ANSWER_VERSION}",contractSha256,candidateSha256,neighbors:[{sourceId,outcome:"preserved"|"moved"|"removed-whole"|"replaced-whole"|"naturally-occluded"|"duplicated"|"fragmented"|"unsure",status:"pass"|"fail"|"unsure",after:[{ref,rect:{left,top,width,height}}],remnants:"none"|"present"|"unsure",occluder:string|null,observation:string}]}. Echo the supplied contract and candidate hashes; include every registered sourceId exactly once and no additional source IDs. Rectangles are integer native board pixels.`,
    "List ALL surviving representations of each source person, including original fragments plus a shifted copy. More than one representation is duplicated even if each looks anatomically plausible. The same AFTER reference shared by two source people is a merge. Located remnants, duplication and fragmentation fail despite polished appearance or a passing assessment. Clean whole removal/replacement and coherent natural occlusion are allowed; do not impose a fixed total crowd count. Name the solid occluder for natural occlusion, otherwise use null. Use unsure for insufficient evidence rather than guessing.",
    `Bounds: at most ${limits.neighbors} registered neighbors and ${limits.afterPerNeighbor} AFTER representations each; IDs/refs 1-${limits.ref} ASCII letters/digits/._:- with a letter or digit first; refs unique within a source person. observation 12-${limits.observation} characters, occluder null or 12-${limits.occluder} characters. No prose outside the one document.`,
  ].join("\n");
}
