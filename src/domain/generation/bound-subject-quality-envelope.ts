import { z } from "zod";
import { readSubjectQualityBundle, SUBJECT_QUALITY_BUNDLE_VERSION, type SubjectQualityBundleBinding } from "./subject-quality-bundle";

/** A parser repair, not a new question or a transfer of any approval. */
export const BOUND_SUBJECT_QUALITY_ENVELOPE_READER = "quality-subject-envelope/v1-exact-bound-echo" as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const echoed = z.object({
  version: z.literal(SUBJECT_QUALITY_BUNDLE_VERSION), quality: z.record(z.string(), z.unknown()), subject: z.record(z.string(), z.unknown()),
  photoSha256: sha, planSha256: sha, subjectPolicy: z.literal("local-patch-subject/v2"),
}).strict();

/** MEDIUM may echo the three supplied binding labels beside its assessment.
 * Accept exactly that redundant envelope only when every label equals the
 * immutable question and the inner subject names the same policy. Unknown,
 * partial or conflicting echoes stay unreadable. All inner checks are returned
 * verbatim to their existing strict quality/subject/anatomy/head readers.
 * The historical three-key bundle reader itself remains unchanged. */
export function readBoundSubjectQualityEnvelope(raw: string | null, binding: SubjectQualityBundleBinding) {
  const canonical = readSubjectQualityBundle(raw); if (canonical) return canonical;
  if (binding.version !== SUBJECT_QUALITY_BUNDLE_VERSION || binding.subjectPolicy !== "local-patch-subject/v2") return null;
  const text = raw?.trim() ?? "", body = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
  try {
    const parsed = echoed.safeParse(JSON.parse(body)); if (!parsed.success) return null;
    const value = parsed.data;
    if (value.photoSha256 !== binding.photoSha256 || value.planSha256 !== binding.planSha256
      || value.subjectPolicy !== binding.subjectPolicy || value.subject.subjectPolicy !== binding.subjectPolicy) return null;
    return readSubjectQualityBundle(JSON.stringify({ version: value.version, quality: value.quality, subject: value.subject }));
  } catch { return null; }
}
