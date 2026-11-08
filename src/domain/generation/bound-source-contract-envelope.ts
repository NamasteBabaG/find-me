import { z } from 'zod';
import { boundSourceNeighborReadingSchema } from './bound-source-neighbor-envelope';
import { readSourceNeighborQualityBundle, sourceNeighborQualityBundleBindingSchema,
  SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS, type SourceNeighborQualityBundleReading } from './source-neighbor-quality-bundle';

/** The original contract is authenticated by the dispatched question, never by
 * this redundant model echo. Keep the v2 candidate-only reader unchanged. */
export const BOUND_SOURCE_CONTRACT_READER = 'source-neighbor-envelope/v3-question-bound-contract' as const;
export const boundSourceContractReadingSchema = boundSourceNeighborReadingSchema.omit({ version: true })
  .extend({ version: z.literal(BOUND_SOURCE_CONTRACT_READER) }).strict();
export const boundSourceNeighborReadingMarkerSchema = z.union([
  boundSourceNeighborReadingSchema, boundSourceContractReadingSchema,
]);
export type BoundSourceNeighborReadingMarker = z.infer<typeof boundSourceNeighborReadingMarkerSchema>;

/** Only a malformed hexadecimal contract echo, beside an otherwise strict
 * complete answer, can use the independently validated expected contract.
 * A valid conflicting digest, a malformed candidate echo or any changed source
 * IDs/geometry/semantics remain refused by the original strict reader. The
 * caller must authenticate the exact paid question before using this reading.
 * Original provider bytes and historical v1/v2 readers are never changed. */
export function readQuestionBoundSourceContractEnvelope(raw: string | null,
  expected: Parameters<typeof readSourceNeighborQualityBundle>[1]): SourceNeighborQualityBundleReading | null {
  const original = readSourceNeighborQualityBundle(raw, expected);
  if (original.ok || original.fault.code !== 'neighbors' || original.fault.neighborFault?.code !== 'shape'
    || original.fault.neighborFault.path !== 'contractSha256' || typeof raw !== 'string'
    || raw.length > SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.raw) return null;
  const binding = sourceNeighborQualityBundleBindingSchema.safeParse(expected.binding);
  if (!binding.success) return null;
  const text = raw.trim(), body = text.match(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
  try {
    const value = JSON.parse(body), neighbors = value?.sourceNeighbors;
    if (!neighbors || typeof neighbors !== 'object' || Array.isArray(neighbors)) return null;
    const echoed = neighbors.contractSha256;
    if (typeof echoed !== 'string' || !/^[a-f0-9]{1,128}$/.test(echoed) || echoed.length === 64) return null;
    const inMemory = { ...value, sourceNeighbors: { ...neighbors, contractSha256: binding.data.contractSha256 } };
    const reading = readSourceNeighborQualityBundle(JSON.stringify(inMemory), expected);
    return reading.ok ? reading : null;
  } catch { return null; }
}
