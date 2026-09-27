import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import assets from '../../../../content/demo/passport-v1-assets.json';
import { demoPassport } from '../demo';

it('binds every demo passport photograph and discovery to a decodable public hash-named asset', async () => {
  const urls = [...Object.values(assets.photos), ...Object.values(assets.discoveries)];
  expect(urls).toHaveLength(9);
  for (const url of urls) {
    expect(url).toMatch(/^\/demo\/passport-v1\/[a-f0-9]{64}\.webp$/);
    const bytes = readFileSync(`public${url}`);
    expect(url).toContain(createHash('sha256').update(bytes).digest('hex'));
    const image = await sharp(bytes).metadata();
    expect(image.format).toBe('webp'); expect(image.width).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThan(500_000);
  }
  for (const locale of ['en', 'he'] as const) {
    const page = demoPassport(locale).worlds[0]!.pages[0]!;
    expect(urls).toContain(page.photoUrl);
    for (const item of page.discoveries.filter(d => d.collected)) expect(urls).toContain(item.imageUrl);
  }
});
