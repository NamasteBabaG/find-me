import { z } from "zod";

/** Two mandatory readings of one prospective Opus HIGH answer; one paid request. */
export const SUBJECT_QUALITY_BUNDLE_VERSION = "quality-subject-answer/v1" as const;
export type SubjectQualityBundleBinding = { readonly version: typeof SUBJECT_QUALITY_BUNDLE_VERSION;
  readonly photoSha256: string; readonly planSha256: string;
  /** Absent: the inner subject document is local-patch-subject/v1 (every bundle bought before v2). */
  readonly subjectPolicy?: "local-patch-subject/v2" };
const shape = z.object({ version: z.literal(SUBJECT_QUALITY_BUNDLE_VERSION), quality: z.record(z.string(), z.unknown()), subject: z.record(z.string(), z.unknown()) }).strict();

/** Never extract a convenient fragment from prose. Each inner document still has its own strict reader. */
export function readSubjectQualityBundle(raw: string | null): { quality: string; subject: string } | null {
  const text = raw?.trim() ?? "", body = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
  try {
    const parsed = shape.safeParse(JSON.parse(body));
    return parsed.success ? { quality: JSON.stringify(parsed.data.quality), subject: JSON.stringify(parsed.data.subject) } : null;
  } catch { return null; }
}
