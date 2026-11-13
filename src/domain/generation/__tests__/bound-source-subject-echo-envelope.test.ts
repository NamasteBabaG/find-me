import { describe, expect, it } from 'vitest';
import { readQuestionBoundSubjectEchoEnvelope } from '../bound-source-subject-echo-envelope';
import { readQuestionBoundSourceContractEnvelope } from '../bound-source-contract-envelope';
import { readQuestionBoundSourceNeighborEnvelope } from '../bound-source-neighbor-envelope';
import { readSourceNeighborQualityBundle } from '../source-neighbor-quality-bundle';
import { readBoundSubjectQualityEnvelopeV2 } from '../bound-subject-quality-envelope';
import { prepareSourceNeighborContract } from '../../scene/local-patch-source-neighbors';

const contract = { version: 'source-neighbor-contract/v1', boardId: 'synthetic', hideId: 'synthetic-hide',
  source: { art: 'public/scenes/synthetic/base.webp', sha256: 'a'.repeat(64), width: 1000, height: 1000 },
  crop: { left: 100, top: 100, width: 512, height: 768 }, returnRect: { left: 30, top: 30, width: 430, height: 650 },
  neighbors: [{ sourceId: 'source-person', head: { left: 160, top: 160, width: 70, height: 90 } }] };
const { version: _version, neighbors: _neighbors, ...context } = contract;
const prepared = prepareSourceNeighborContract(contract, context);
if (!prepared.ok) throw Error('Synthetic contract must validate');
const contractSha256 = prepared.contractSha256;
const expected = { contract, binding: { version: 'quality-source-neighbor-answer/v1', policy: 'local-patch-source-neighbor/v1',
  reader: 'source-neighbor-read/v1', contractSha256, candidateSha256: 'b'.repeat(64) } };
type Assessment = Record<string, unknown> & { subject: Record<string, unknown> & { subjectPolicy: string } };
const subject = { version: 'quality-subject-answer/v1' as const, photoSha256: 'd'.repeat(64), planSha256: 'e'.repeat(64),
  subjectPolicy: 'local-patch-subject/v2' as const };
/** The question asks for these three labels beside the document; MEDIUM repeats them. */
function document(echo: Record<string, unknown> = { photoSha256: subject.photoSha256, planSha256: subject.planSha256, subjectPolicy: subject.subjectPolicy }) {
  const assessment: Assessment = { version: 'quality-subject-answer/v1', ...echo,
    quality: { hides: [{ hideId: 'synthetic-hide', evidenceIds: ['synthetic-before', 'synthetic-after'],
      verdict: { childComplete: 'pass', verdict: 'pass', faults: [] } }] },
    subject: { hideId: 'synthetic-hide', subjectPolicy: 'local-patch-subject/v2', checks: {}, faults: [] } };
  return { version: 'quality-source-neighbor-answer/v1', assessment,
    sourceNeighbors: { version: 'source-neighbor-answer/v1', contractSha256, candidateSha256: 'b'.repeat(64),
      neighbors: [{ sourceId: 'source-person', outcome: 'preserved', status: 'pass', remnants: 'none', occluder: null,
        after: [{ ref: 'person-after', rect: { left: 160, top: 160, width: 70, height: 90 } }],
        observation: 'One complete source person remains at the same position.' }] } };
}
const read = (value: unknown, binding: typeof subject | undefined = subject) =>
  readQuestionBoundSubjectEchoEnvelope(JSON.stringify(value), expected, binding);

describe('question-bound subject echo inside the source-neighbor envelope', () => {
  it('reads the exact three-label echo the question asked for, without changing the provider bytes', () => {
    const value = document(), raw = JSON.stringify(value), frozen = structuredClone(value);
    // The historical wrapper refused this complete answer as an unreadable assessment.
    const original = readSourceNeighborQualityBundle(raw, expected);
    expect(original.ok).toBe(false);
    if (original.ok) throw Error('Expected the historical refusal');
    expect(original.fault).toEqual({ code: 'assessment', path: 'assessment' });
    expect(readQuestionBoundSourceNeighborEnvelope(raw, expected)).toBeNull();
    expect(readQuestionBoundSourceContractEnvelope(raw, expected)).toBeNull();
    const result = readQuestionBoundSubjectEchoEnvelope(raw, expected, subject);
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw Error('Expected the versioned reading');
    expect(result.sourceNeighbors.disposition).toBe('pass');
    // The assessment handed on is the canonical document; its own strict readers still decide every check.
    const { photoSha256: _p, planSha256: _q, subjectPolicy: _s, ...canonical } = value.assessment;
    expect(JSON.parse(result.assessment.raw)).toEqual(canonical);
    expect(readBoundSubjectQualityEnvelopeV2(result.assessment.raw, subject)).not.toBeNull();
    expect(value).toEqual(frozen); expect(raw).toBe(JSON.stringify(frozen));
  });
  it('accepts the same answer inside one complete JSON fence only', () => {
    const raw = JSON.stringify(document());
    expect(readQuestionBoundSubjectEchoEnvelope('```json\n' + raw + '\n```', expected, subject)?.ok).toBe(true);
    for (const value of [null, '', raw + raw, 'prefix ' + raw, raw + ' trailing', '```json\n' + raw])
      expect(readQuestionBoundSubjectEchoEnvelope(value, expected, subject)).toBeNull();
  });
  it.each([
    ['a conflicting photo label', { photoSha256: 'f'.repeat(64), planSha256: subject.planSha256, subjectPolicy: subject.subjectPolicy }],
    ['a conflicting plan label', { photoSha256: subject.photoSha256, planSha256: 'f'.repeat(64), subjectPolicy: subject.subjectPolicy }],
    ['a different subject policy', { photoSha256: subject.photoSha256, planSha256: subject.planSha256, subjectPolicy: 'local-patch-subject/v1' }],
    ['a partial echo', { photoSha256: subject.photoSha256, planSha256: subject.planSha256 }],
    ['an unknown extra key', { photoSha256: subject.photoSha256, planSha256: subject.planSha256, subjectPolicy: subject.subjectPolicy, approved: true }],
  ])('keeps refusing %s', (_name, echo) => {
    expect(read(document(echo))).toBeNull();
  });
  it('needs the v2 question binding it was asked under', () => {
    expect(readQuestionBoundSubjectEchoEnvelope(JSON.stringify(document()), expected, undefined)).toBeNull();
    const { subjectPolicy: _policy, ...v1 } = subject;
    expect(read(document(), v1 as typeof subject)).toBeNull();
    expect(read(document(), { ...subject, photoSha256: '0'.repeat(64) })).toBeNull();
  });
  it('never touches a canonical answer or any other refusal', () => {
    const { assessment, ...rest } = document();
    const { photoSha256: _p, planSha256: _q, subjectPolicy: _s, ...canonical } = assessment;
    // Already readable by the historical reader: this reader is not needed and says so.
    expect(readSourceNeighborQualityBundle(JSON.stringify({ ...rest, assessment: canonical }), expected).ok).toBe(true);
    expect(read({ ...rest, assessment: canonical })).toBeNull();
    // A neighbor refusal stays the neighbor readers' business.
    const wrongCandidate = document(); wrongCandidate.sourceNeighbors.candidateSha256 = 'f'.repeat(64);
    expect(read(wrongCandidate)).toBeNull();
    // A changed inner subject document is not repaired.
    const foreignSubject = document(); foreignSubject.assessment.subject.subjectPolicy = 'local-patch-subject/v1';
    expect(read(foreignSubject)).toBeNull();
  });
  it.each(['duplicate', 'remnants', 'unsure'] as const)('keeps the semantic %s neighbor decision', problem => {
    const value = document(), n = value.sourceNeighbors.neighbors[0]!;
    if (problem === 'duplicate') n.after.push({ ref: 'duplicate', rect: { left: 260, top: 160, width: 70, height: 90 } });
    if (problem === 'remnants') n.remnants = 'present';
    if (problem === 'unsure') n.status = 'unsure';
    const result = read(value);
    expect(result?.ok && result.sourceNeighbors.disposition).toBe(problem === 'unsure' ? 'unresolved' : 'repair');
  });
});
