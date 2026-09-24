import { describe, expect, it } from 'vitest';
import { localPatchPrompt, pinnedLocalPatchPromptVersion, LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION } from '../local-patch-prompt';

const input = { contentVersion: 10, ground: 'cave floor', pose: 'standing' as const, ageYears: 5,
  wardrobe: 'Orange cotton shirt and apron', mask: { left: 82, top: 70, width: 174, height: 520 },
  placement: { depth: 'middle' as const, standingHeightPx: 520, support: 'Both boots on the cave floor beside the stool',
    comparators: 'The five-year-old children beside the scale', lighting: 'Warm cave bounce with cooler shadows', occlusion: 'Stool stays in front where appropriate' } };

describe('board paint is independent of child identity', () => {
  it.each([6, 8, 9, 10])('new recipe works on catalog %i without borrowing neighbouring identities', contentVersion => {
    const prompt = localPatchPrompt({ ...input, contentVersion, paintRecipe: 'board-paint-v1' });
    expect(prompt).toContain('IDENTITY AUTHORITY: Image 2');
    expect(prompt).toContain('PAINT AUTHORITY: the original people in Image 1');
    expect(prompt).toContain('warm/cool painted planes');
    expect(prompt).toContain('not flat orange fill');
    expect(prompt).toContain('Never borrow a neighbour');
    expect(prompt).toContain('not through a stool rail');
    expect(prompt).toContain('SAME age at the SAME depth');
    expect(prompt).toContain('not a reason to miniaturize');
    expect(prompt).toContain('Preserve all pixels outside the mask');
    expect(prompt).toContain('no compulsory camera-facing pose');
    if (contentVersion >= 9) expect(prompt).toContain('There are only two images');
  });
  it('leaves the historical portrait-only recipe untouched unless explicitly selected', () => {
    const old = localPatchPrompt(input);
    expect(old).toContain('Use the scene for clothing, light, contact shadow and depth only');
    expect(old).not.toContain('PAINT AUTHORITY');
    expect(localPatchPrompt({ ...input, paintRecipe: undefined })).toBe(old);
  });
  it('does not undo board paint when repairing identity or surface defects', () => {
    const prompt = localPatchPrompt({ ...input, paintRecipe: 'board-paint-v1', repairChecks: ['faceLikeness', 'styleMatch'] });
    expect(prompt).toContain('restoring identity must not restore smooth portrait rendering');
    expect(prompt).toContain('do not simplify the face to flat fills');
    expect(prompt).not.toContain('adjust only the authored clothing');
  });
  it('persists the new version for new rows, retaining historical and interrupted recipes', () => {
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION)).toBe(LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION);
    for (const attempts of [0, 1, 2]) {
      expect(pinnedLocalPatchPromptVersion({ promptVersion: LOCAL_PATCH_AGE_PROMPT_VERSION, attempts }, LOCAL_PATCH_AGE_PROMPT_VERSION)).toBe(LOCAL_PATCH_AGE_PROMPT_VERSION);
      expect(pinnedLocalPatchPromptVersion({ promptVersion: LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION, attempts }, LOCAL_PATCH_AGE_PROMPT_VERSION)).toBe(LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION);
      expect(pinnedLocalPatchPromptVersion({ promptVersion: null, attempts }, LOCAL_PATCH_AGE_PROMPT_VERSION)).toBe(LOCAL_PATCH_AGE_PROMPT_VERSION);
    }
  });
});
