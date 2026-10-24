import { describe, it, expect } from 'vitest';
import { SOURCE_BODY_REPAIR_MANIFEST, assertSourceBodyManifest } from '../../../../content/detectives/source-body-repair';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE, DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from '../../../../content/detectives/source-placement-release';
import { authoredLocalPatchReturnContract } from '../local-patch-return-region';
import { validateSourceBodyGeometry, sourceBodyAlpha, sourceBodyEditable } from '../source-body-repair';
function original(id: string) { const e = DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === id)!; return { e, parent: authoredLocalPatchReturnContract({ contentVersion: 13, boardId: e.boardId, hideId: e.hideId, source: e.source, crop: e.effective.crop, child: e.effective.child, authored: e.effective.returnRect, sourcePlacement: { manifestSha256: DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256, basePlacementSha256: e.basePlacementSha256 } }) }; }
describe('whole public source body, with explicit protected neighbors', () => {
    it('keeps the old family and both parent windows immutable', () => { assertSourceBodyManifest(); expect(SOURCE_BODY_REPAIR_MANIFEST.parentManifestSha256).toBe(DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256); for (const g of SOURCE_BODY_REPAIR_MANIFEST.entries) {
        const { e, parent } = original(g.hideId), before = JSON.stringify(e);
        expect(validateSourceBodyGeometry(g, parent, e.sourceNeighbors!.contract.neighbors)).toEqual(g);
        expect(JSON.stringify(e)).toBe(before);
        expect(parent.local).toEqual(g.parentReturnRect);
        expect(g.returnRect.width).toBeGreaterThan(g.parentReturnRect.width);
    } });
    it.each(['paris', 'giza'])('removes body pixels outside the old child envelope and protects the neighboring full-body details: %s', board => { const g = SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.boardId === board)!, a = sourceBodyAlpha(g); expect(a).toHaveLength(512 * 768); for (const r of g.protectedRects)
        for (let y = r.top; y < r.top + r.height; y++)
            for (let x = r.left; x < r.left + r.width; x++)
                expect(a[y * 512 + x]).toBe(0); expect(g.sourceBodyChecks.some(r => r.left + r.width > g.child.left + g.child.width || r.top + r.height > g.child.top + g.child.height)).toBe(true); expect(sourceBodyEditable(g, g.sourceBodyChecks[0]!.left, g.sourceBodyChecks[0]!.top)).toBe(true); });
    it.each(['source', 'crop', 'parent-window', 'missing-head', 'neighbor-head', 'body-cut', 'escape', 'target-cut'])('rejects unsafe source geometry before any purchase: %s', fault => { const g = structuredClone(SOURCE_BODY_REPAIR_MANIFEST.entries[0]!), { e, parent } = original(g.hideId); let heads = structuredClone(e.sourceNeighbors!.contract.neighbors); if (fault === 'source')
        g.sourceSha256 = 'f'.repeat(64); if (fault === 'crop')
        g.crop.left++; if (fault === 'parent-window')
        g.parentReturnRect.width++; if (fault === 'missing-head')
        heads = heads.filter(h => h.sourceId !== g.targetSourceId); if (fault === 'neighbor-head')
        g.editableRects.push({ left: 361, top: 244, width: 130, height: 149 }); if (fault === 'body-cut')
        g.editableRects = g.editableRects.slice(0, 1); if (fault === 'escape')
        g.editableRects.push({ left: 0, top: 0, width: 1, height: 1 }); if (fault === 'target-cut')
        g.protectedRects.push({ left: 200, top: 300, width: 5, height: 5 }); expect(() => validateSourceBodyGeometry(g, parent, heads)).toThrow('SOURCE_BODY'); });
});
