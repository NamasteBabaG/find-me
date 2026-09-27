import { expect, it } from 'vitest';
import { REFINEMENT, refinementArgs, refinementPrompt, SOURCE_HEAD_PATH, B_HEAD_PATH } from '../../../scripts/lib/board-paint-refinement';
it('bounds images to fixed immutable experiment keys', () => {
  for (const variant of REFINEMENT.variants) expect(refinementArgs(['--render', variant]).variant).toBe(variant);
  for (const args of [[], ['--render'], ['--render', 'all'], ['--render', 'source-head-low', '2'], ['--publish', 'source-head-low']]) expect(() => refinementArgs(args)).toThrow();
});
it('separates identity, painting and geometry and protects non-head content', () => {
  for (const finish of [false, true]) {
    const prompt = refinementPrompt(finish);
    expect(prompt).toContain('Image 2 is the canonical portrait');
    expect(prompt).toContain('Image 3 is an APPROVED PAINT SAMPLE');
    expect(prompt).toContain('all pixels outside the head mask remain EXACTLY');
    expect(prompt).toContain('single LEFT gauge');
  }
  expect(refinementPrompt(true)).toContain('Do not turn the head into a profile');
  expect(refinementPrompt(false)).toContain('SAME native head size');
  expect(SOURCE_HEAD_PATH).not.toEqual(B_HEAD_PATH);
});
