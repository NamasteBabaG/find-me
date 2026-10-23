import { describe, expect, it } from 'vitest';
import { SINGLE_VISUAL_REVIEW_VERSION, readSingleVisualReview } from '../single-visual-review';
import { isSingleLowReviewPolicy, leanReviewPolicy, leanReviewPolicyOf, singleLowReviewPolicy } from '../visual-review-policy';
const answer = { version: SINGLE_VISUAL_REVIEW_VERSION, assessment: { all: 'mandatory' }, continuity: { cases: [] }, doubt: false, doubtReason: null };
describe('one Sol LOW review envelope', () => {
  it('keeps the two historical HIGH policies unchanged and names the new LOW policy independently', () => {
    expect(leanReviewPolicy('scene-quality','flex').effort).toBe('high');
    expect(leanReviewPolicy('head-continuity','flex').effort).toBe('high');
    const low=singleLowReviewPolicy(); expect(low).toMatchObject({model:'gpt-6.1-sol',effort:'low',role:'scene-quality',serviceTier:'flex'});
    expect(leanReviewPolicyOf(low.version)).toEqual(low); expect(isSingleLowReviewPolicy(low)).toBe(true);
  });
  it('requires both complete inner documents and an explicit doubt decision', () => {
    expect(readSingleVisualReview(JSON.stringify(answer))).toMatchObject({doubt:false});
    for (const key of ['assessment','continuity','doubt','doubtReason']) { const a = { ...answer } as Record<string,unknown>; delete a[key]; expect(readSingleVisualReview(JSON.stringify(a))).toBeNull(); }
    expect(readSingleVisualReview(JSON.stringify({...answer, extra:'pass'}))).toBeNull();
    expect(readSingleVisualReview(JSON.stringify({...answer,doubt:true}))).toBeNull();
    expect(readSingleVisualReview(JSON.stringify({...answer,doubt:true,doubtReason:'Unclear neck connection at the left join'}))).toMatchObject({doubt:true});
    expect(readSingleVisualReview('A convenient excerpt '+JSON.stringify(answer))).toBeNull();
  });
});
