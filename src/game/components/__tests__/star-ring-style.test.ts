import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('completed star ring layout', () => {
  it('does not preserve the oversized transparent end frame after celebration', () => {
    const css = readFileSync(new URL('../../game.css', import.meta.url), 'utf8');
    const ring = css.match(/\.stars__slot\.is-new::after\s*\{([^}]+)\}/)?.[1];
    expect(ring).toBeDefined();
    expect(ring).toContain('opacity: 0;');
    expect(ring).toMatch(/animation:\s*fm-star-ring[^;]+backwards;/);
    expect(ring).not.toMatch(/animation:[^;]+(?:both|forwards)/);
  });
});
