import { it, expect } from 'vitest';
import sharp from 'sharp';
import { applySourceBodyPixels, sourceBodyMaskPng } from '../source-body-repair-compose';
import { sourceBodyAlpha } from '../../../domain/scene/source-body-repair';
import { SOURCE_BODY_REPAIR_MANIFEST } from '../../../../content/detectives/source-body-repair';
it.each(SOURCE_BODY_REPAIR_MANIFEST.entries)('restores every protected pixel even when the provider repaints the whole crop: $boardId', async (g) => {
    const before = await sharp({ create: { width: 3840, height: 2160, channels: 4, background: '#ceb17f' } }).png().toBuffer(), raw = await sharp({ create: { width: 512, height: 768, channels: 4, background: '#a72092' } }).png().toBuffer();
    const result = await applySourceBodyPixels(before, raw, g), pixels = await sharp(result.png).ensureAlpha().raw().toBuffer(), a = sourceBodyAlpha(g), mask = await sharp(await sourceBodyMaskPng(g)).ensureAlpha().raw().toBuffer();
    let editable = 0, wrong = 0;
    for (let i = 0; i < a.length; i++) {
        const wanted = a[i] ? [167, 32, 146, 255] : [206, 177, 127, 255];
        if (a[i])
            editable++;
        for (let c = 0; c < 4; c++)
            if (pixels[i * 4 + c] !== wanted[c])
                wrong++;
        if (mask[i * 4 + 3] !== 255 - a[i]!)
            wrong++;
    }
    expect(editable).toBeGreaterThan(10000);
    expect(wrong).toBe(0);
    expect(result.proof.outsideChangedPixels).toBe(0);
    expect(result.proof.normalizedRawSha256).toMatch(/^[a-f0-9]{64}$/);
});
