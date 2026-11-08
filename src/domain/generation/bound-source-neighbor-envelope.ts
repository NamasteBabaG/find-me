import { z } from 'zod';
import { readSourceNeighborQualityBundle, SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS,
  type SourceNeighborQualityBundleReading } from './source-neighbor-quality-bundle';

/** A different reading of the original bytes, never a replacement paid answer.
 * The service must authenticate the original question and its terminal settled
 * purchase before recording this marker, and again at publication. */
export const BOUND_SOURCE_NEIGHBOR_READER = 'source-neighbor-envelope/v2-question-bound-candidate' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const boundSourceNeighborReadingSchema = z.object({
  version: z.literal(BOUND_SOURCE_NEIGHBOR_READER),
  sourceRequestKey: z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/),
  sourceFingerprint: digest, sourcePayloadSha256: digest, rawSha256: digest,
  questionBodySha256: digest, questionBindingSha256: digest,
  roundId: z.string().regex(/^sb[a-f0-9]{30}$/),
}).strict();
export type BoundSourceNeighborReading = z.infer<typeof boundSourceNeighborReadingSchema>;

/** Only a malformed redundant candidate echo can use the question's candidate
 * binding. A valid but conflicting digest remains a conflict. No edit-distance
 * inference, dropped source IDs, changed contract or semantic repair is allowed.
 * This pure parser grants no question authentication or publication authority.
 * Its input string is never changed or persisted as a new provider answer. */
export function readQuestionBoundSourceNeighborEnvelope(raw: string | null,
  expected: Parameters<typeof readSourceNeighborQualityBundle>[1]): SourceNeighborQualityBundleReading | null {
  const original = readSourceNeighborQualityBundle(raw, expected);
  if (original.ok || original.fault.code !== 'neighbors' || typeof raw !== 'string'
    || raw.length > SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.raw) return null;
  const text = raw.trim(), body = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
  try {
    const value = JSON.parse(body), neighbors = value?.sourceNeighbors;
    if (!neighbors || typeof neighbors !== 'object' || Array.isArray(neighbors)) return null;
    const echoed = neighbors.candidateSha256;
    if (typeof echoed !== 'string' || !/^[a-f0-9]{1,128}$/.test(echoed) || echoed.length === 64) return null;
    // Obtain the digest from a validated binding, not an arbitrary caller field.
    // The strict bundle reader below revalidates that binding and full contract.
    const binding = expected.binding as { candidateSha256?: unknown } | null;
    if (!binding || !digest.safeParse(binding.candidateSha256).success) return null;
    const inMemory = { ...value, sourceNeighbors: { ...neighbors, candidateSha256: binding.candidateSha256 } };
    const result = readSourceNeighborQualityBundle(JSON.stringify(inMemory), expected);
    return result.ok ? result : null;
  } catch { return null; }
}
