import { expect, it } from 'vitest';
import { comparisonArgs, preservationPrompt, PAINT_COMPARISON, FINISH_PROMPT } from '../../../scripts/lib/board-paint-comparison';
it('permits exactly the three named arms and read/export/review modes', () => {
  for (const arm of PAINT_COMPARISON.variants) expect(comparisonArgs(['--render', arm]).variant).toBe(arm);
  for (const mode of ['--prepare', '--review', '--export']) expect(comparisonArgs([mode]).mode).toBe(mode);
});
it.each([['--render'], ['--render', 'other'], ['--render', 'a-medium', '2'], ['--review', '2'], ['--publish'], ['--all']])('refuses expanded scope: %j', (...args) => {
  expect(() => comparisonArgs(args)).toThrow();
});
it('preserves the v12 prefix and adds explicit source constraints only in the experimental recipe', () => {
  const base = 'Frozen paid v12 prompt';
  expect(preservationPrompt(base)).toMatch(/^Frozen paid v12 prompt\nV13/);
  expect(preservationPrompt(base)).toContain('add NO extra');
  expect(preservationPrompt(base)).toContain('orange shirt, brown work apron');
  expect(FINISH_PROMPT).toContain('Change ONLY the surface painting');
  expect(FINISH_PROMPT).toContain('yellow tunic');
});
