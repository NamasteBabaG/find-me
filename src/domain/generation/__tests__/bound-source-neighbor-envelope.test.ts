import { describe, expect, it } from 'vitest';
import { readQuestionBoundSourceNeighborEnvelope } from '../bound-source-neighbor-envelope';
import { readSourceNeighborQualityBundle } from '../source-neighbor-quality-bundle';
import { prepareSourceNeighborContract } from '../../scene/local-patch-source-neighbors';

const contract = { version: 'source-neighbor-contract/v1', boardId: 'synthetic', hideId: 'synthetic-hide',
  source: { art: 'public/scenes/synthetic/base.webp', sha256: 'a'.repeat(64), width: 1000, height: 1000 },
  crop: { left: 100, top: 100, width: 512, height: 768 }, returnRect: { left: 30, top: 30, width: 430, height: 650 },
  neighbors: [{ sourceId: 'source-person', head: { left: 160, top: 160, width: 70, height: 90 } }] };
const { version: _v, neighbors: _n, ...context } = contract;
const prepared = prepareSourceNeighborContract(contract, context);
if (!prepared.ok) throw Error('Synthetic contract must validate');
const contractSha256 = prepared.contractSha256;
const expected = { contract, binding: { version: 'quality-source-neighbor-answer/v1', policy: 'local-patch-source-neighbor/v1',
  reader: 'source-neighbor-read/v1', contractSha256, candidateSha256: 'b'.repeat(64) } };
function document(echo = 'b'.repeat(65)) { return { version: 'quality-source-neighbor-answer/v1',
  assessment: { hides: [{ hideId: 'synthetic-hide', evidenceIds: ['synthetic-before', 'synthetic-after'],
    verdict: { childComplete: 'fail', verdict: 'fail', faults: [{ check: 'childComplete', where: 'A real visible arm is disconnected.' }] } }] },
  sourceNeighbors: { version: 'source-neighbor-answer/v1', contractSha256, candidateSha256: echo,
    neighbors: [{ sourceId: 'source-person', outcome: 'preserved', status: 'pass', remnants: 'none', occluder: null,
      after: [{ ref: 'person-after', rect: { left: 160, top: 160, width: 70, height: 90 } }],
      observation: 'One coherent source person remains in the same place.' }] } }; }
const read = (value: unknown) => readQuestionBoundSourceNeighborEnvelope(JSON.stringify(value), expected);

describe('question-bound malformed candidate echo reader', () => {
  it.each([55, 65])('reads a %i-character hex echo only under the separately named reader, retaining the failed assessment', length => {
    const value = document('c'.repeat(length)), raw = JSON.stringify(value), frozen = structuredClone(value);
    expect(readSourceNeighborQualityBundle(raw, expected)).toMatchObject({ ok: false });
    const result = readQuestionBoundSourceNeighborEnvelope(raw, expected);
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw Error('Expected named reading');
    expect(JSON.parse(result.assessment.raw)).toEqual(value.assessment);
    expect(result.sourceNeighbors.answer.candidateSha256).toBe(expected.binding.candidateSha256);
    expect(value).toEqual(frozen);
    expect(raw).toBe(JSON.stringify(frozen));
    expect(readSourceNeighborQualityBundle(raw, expected).ok).toBe(false);
  });
  it.each(['c'.repeat(64), 'b'.repeat(64), '', 'G'.repeat(65), 'not-a-digest', 'a'.repeat(129)])('does not reinterpret a valid, absent or non-hex echo: %s', echo => {
    expect(read(document(echo))).toBeNull();
  });
  it('does not fill a missing candidate field or accept extra neighbor fields', () => {
    const value = document(), neighbor: Record<string, unknown> = value.sourceNeighbors;
    delete neighbor.candidateSha256;
    expect(read(value)).toBeNull();
    neighbor.candidateSha256 = 'b'.repeat(65);
    neighbor.extra = true;
    expect(read(value)).toBeNull();
  });
  it.each(['contract', 'source-id', 'missing-source', 'bad-geometry'] as const)('preserves the strict %s rejection', problem => {
    const value = document();
    if (problem === 'contract') value.sourceNeighbors.contractSha256 = 'f'.repeat(64);
    if (problem === 'source-id') value.sourceNeighbors.neighbors[0]!.sourceId = 'foreign-person';
    if (problem === 'missing-source') value.sourceNeighbors.neighbors = [];
    if (problem === 'bad-geometry') value.sourceNeighbors.neighbors[0]!.after[0]!.rect.left = 990;
    expect(read(value)).toBeNull();
  });
  it.each(['duplicated', 'fragmented', 'remnants', 'unsure'] as const)('does not erase a semantic %s disposition', problem => {
    const value = document(), n = value.sourceNeighbors.neighbors[0]!;
    if (problem === 'duplicated') n.after.push({ ref: 'duplicate', rect: { left: 260, top: 160, width: 70, height: 90 } });
    if (problem === 'fragmented') n.outcome = 'fragmented';
    if (problem === 'remnants') n.remnants = 'present';
    if (problem === 'unsure') n.status = 'unsure';
    const result = read(value);
    expect(result?.ok && result.sourceNeighbors.disposition).toBe(problem === 'unsure' ? 'unresolved' : 'repair');
  });
  it('does not reinterpret malformed or multiple outer documents', () => {
    const raw = JSON.stringify(document());
    for (const text of [null, '', raw + raw, 'prefix ' + raw, raw + ' trailing', '```json\n' + raw])
      expect(readQuestionBoundSourceNeighborEnvelope(text, expected)).toBeNull();
    expect(readQuestionBoundSourceNeighborEnvelope('```json\n' + raw + '\n```', expected)?.ok).toBe(true);
  });
});
