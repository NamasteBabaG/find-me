import { z } from 'zod';
import { boundSourceNeighborReadingSchema } from './bound-source-neighbor-envelope';
import { readBoundSubjectQualityEnvelopeV2 } from './bound-subject-quality-envelope';
import { readSourceNeighborQualityBundle, SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS,
  type SourceNeighborQualityBundleReading } from './source-neighbor-quality-bundle';
import { SUBJECT_QUALITY_BUNDLE_VERSION, type SubjectQualityBundleBinding } from './subject-quality-bundle';

/**
 * The single MEDIUM question asks for its quality-subject document inside the
 * source-neighbor envelope AND names the photo, plan and subject policy it is
 * bound to. MEDIUM repeats those three labels beside the document, as the
 * question's own envelope reader (quality-subject-envelope/v2) already accepts.
 * The source-neighbor wrapper still recognised only the historical three-key
 * document, so a complete answer that passed every check read as unreadable and
 * its appearance was never asked or painted again (2026-11-13, amazon hide 2).
 *
 * Only that exact redundant echo is removed, in memory, and only when every
 * label equals the immutable question. Any other key, a partial or conflicting
 * echo, or a changed inner document remains refused by the original reader.
 * The caller must authenticate the exact paid question before naming this
 * reading; it grants no provider call and no approval of its own.
 */
export const BOUND_SOURCE_SUBJECT_ECHO_READER = 'source-neighbor-envelope/v4-question-bound-subject-echo' as const;
export const boundSourceSubjectEchoReadingSchema = boundSourceNeighborReadingSchema.omit({ version: true })
  .extend({ version: z.literal(BOUND_SOURCE_SUBJECT_ECHO_READER) }).strict();

export function readQuestionBoundSubjectEchoEnvelope(raw: string | null,
  expected: Parameters<typeof readSourceNeighborQualityBundle>[1],
  subject: SubjectQualityBundleBinding | undefined): SourceNeighborQualityBundleReading | null {
  if (!subject || subject.version !== SUBJECT_QUALITY_BUNDLE_VERSION || subject.subjectPolicy !== 'local-patch-subject/v2') return null;
  const original = readSourceNeighborQualityBundle(raw, expected);
  if (original.ok || original.fault.code !== 'assessment' || typeof raw !== 'string'
    || raw.length > SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.raw) return null;
  const text = raw.trim(), body = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
  try {
    const value = JSON.parse(body), assessment = value?.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)
      || assessment.version !== SUBJECT_QUALITY_BUNDLE_VERSION) return null;
    const { photoSha256, planSha256, subjectPolicy, ...document } = assessment as Record<string, unknown>;
    if (photoSha256 !== subject.photoSha256 || planSha256 !== subject.planSha256 || subjectPolicy !== subject.subjectPolicy) return null;
    // The same acceptance the question's own envelope reader applies to this echo.
    if (!readBoundSubjectQualityEnvelopeV2(JSON.stringify(assessment), subject)) return null;
    const reading = readSourceNeighborQualityBundle(JSON.stringify({ ...value, assessment: document }), expected);
    return reading.ok ? reading : null;
  } catch { return null; }
}
