import { z } from 'zod';
import { sourcePlacementSha256 } from './source-placement-release';
import { localPatchReturnRegion, type AuthoredLocalPatchReturnContract, type PatchRectangle } from './local-patch-return-region';
import { guidedFrameGeometry } from '../generation/guided-frame-recovery';
export const SOURCE_BODY_GEOMETRY_VERSION = 'source-body-geometry/v1' as const;
export const SOURCE_BODY_REPAIR_VERSION = 'source-body-repair/v1' as const;
export const SOURCE_BODY_COMPOSE_VERSION = 'source-body-compose/v1' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const coordinate = z.number().int().nonnegative();
const rect = z.object({ left: coordinate, top: coordinate, width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const sourceBodyEntrySchema = z.object({ boardId: id, hideId: id, sourceSha256: digest, crop: rect, child: rect, parentReturnRect: rect, returnRect: rect,
    editableRects: z.array(rect).min(1).max(8), editablePolygons: z.array(z.array(z.tuple([coordinate, coordinate])).min(3).max(24)).max(8),
    protectedRects: z.array(rect).min(1).max(12), sourceBodyChecks: z.array(rect).min(1).max(12), targetSourceId: id, propDirections: z.string().min(30).max(1200) }).strict();
export type SourceBodyGeometry = z.infer<typeof sourceBodyEntrySchema>;
export const sourceBodyManifestSchema = z.object({ version: z.literal(SOURCE_BODY_GEOMETRY_VERSION), parentManifestSha256: digest, entries: z.array(sourceBodyEntrySchema).length(2) }).strict();
export const sourceBodyMarkerSchema = z.object({ version: z.literal(SOURCE_BODY_REPAIR_VERSION), authorizationSha256: digest, manifestSha256: digest,
    rowId: id, sourceRowSha256: digest, previousJudgeSha256: digest, originalAttempts: z.number().int().min(3).max(4), authorizedAttempt: z.number().int().min(4).max(5) }).strict();
export type SourceBodyMarker = z.infer<typeof sourceBodyMarkerSchema>;
export function sourceBodyMarker(row: {
    judgeJson: string | null;
}): SourceBodyMarker | null { try {
    const p = sourceBodyMarkerSchema.safeParse(JSON.parse(row.judgeJson ?? 'null')?.sourceBodyRepair);
    return p.success ? p.data : null;
}
catch {
    return null;
} }
const inside = (r: PatchRectangle, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
function inPolygon(p: readonly (readonly [
    number,
    number
])[], x: number, y: number) { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!, b = p[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])
        yes = !yes;
} return yes; }
/** Predeclared public source footprint; never inferred from generated pixels. */
export function sourceBodyEditable(g: SourceBodyGeometry, x: number, y: number) { return !g.protectedRects.some(r => inside(r, x, y)) && (g.editableRects.some(r => inside(r, x, y)) || g.editablePolygons.some(p => inPolygon(p, x + .5, y + .5))); }
export function sourceBodyAlpha(g: SourceBodyGeometry) { const a = new Uint8Array(512 * 768); for (let y = 0; y < 768; y++)
    for (let x = 0; x < 512; x++)
        a[y * 512 + x] = sourceBodyEditable(g, x, y) ? 255 : 0; return a; }
/** Public authoring coverage is not an artistic acceptance. Old v4/v1 geometry remains exact. */
export function validateSourceBodyGeometry(value: unknown, parent: AuthoredLocalPatchReturnContract, heads: readonly {
    sourceId: string;
    head: PatchRectangle;
}[]): SourceBodyGeometry {
    const g = sourceBodyEntrySchema.parse(value), same = (a: unknown, b: unknown) => sourcePlacementSha256(a) === sourcePlacementSha256(b);
    if (parent.contentVersion !== 13 || parent.boardId !== g.boardId || parent.hideId !== g.hideId || parent.source.sha256 !== g.sourceSha256 || !same(parent.crop, g.crop) || !same(parent.child, g.child) || !same(parent.local, g.parentReturnRect))
        throw Error('SOURCE_BODY: original source/geometry changed');
    localPatchReturnRegion(g.crop, g.child, g.returnRect);
    const a = sourceBodyAlpha(g);
    for (let y = 0; y < 768; y++)
        for (let x = 0; x < 512; x++)
            if (a[y * 512 + x] && (!inside(g.returnRect, x, y) || x < g.returnRect.left + 12 || y < g.returnRect.top + 12 || x >= g.returnRect.left + g.returnRect.width - 12 || y >= g.returnRect.top + g.returnRect.height - 12))
                throw Error('SOURCE_BODY: editable footprint leaves safe return interior');
    const whole = (r: PatchRectangle, wanted: boolean) => { for (let y = r.top; y < r.top + r.height; y++)
        for (let x = r.left; x < r.left + r.width; x++)
            if ((a[y * 512 + x] === 255) !== wanted)
                return false; return true; };
    if (!heads.some(h => h.sourceId === g.targetSourceId))
        throw Error('SOURCE_BODY: complete target head coverage required');
    for (const h of heads) {
        const r = { ...h.head, left: h.head.left - g.crop.left, top: h.head.top - g.crop.top };
        if (h.sourceId === g.targetSourceId) {
            if (!whole(r, true))
                throw Error('SOURCE_BODY: source target head not wholly erased');
        }
        else
            for (let y = Math.max(0, r.top); y < Math.min(768, r.top + r.height); y++)
                for (let x = Math.max(0, r.left); x < Math.min(512, r.left + r.width); x++)
                    if (a[y * 512 + x])
                        throw Error('SOURCE_BODY: replacement touches another source head');
    }
    if (!g.sourceBodyChecks.every(r => whole(r, true)) || !whole(guidedFrameGeometry(g.child, g.returnRect).target, true))
        throw Error('SOURCE_BODY: original body or complete new target frame falls outside edit mask');
    return g;
}
export function sourceBodyDirections(g: SourceBodyGeometry) { return 'WHOLE SOURCE BODY ' + SOURCE_BODY_REPAIR_VERSION + '. The native alpha mask, not the child placement rectangle, defines replacement permission. Remove the original TARGET WHOLE inside the magenta footprint: hair, face, neck, clothing, arms, hands, trousers and shoes. Leave no old jacket/body wedge. The LAST reference is position-only; edit the FIRST unmarked original. Cyan is the complete new-child maximum frame; preserve correct age, pose, depth and support. Green regions and ALL pixels outside the editable footprint are protected original scenery/people. Do not stretch or move a neighboring person, their feet, clothes, bags or props. ' + g.propDirections + ' Return the original 512x768 image with no guide mark, text, border or colored box. A single LOW judgment still decides identity, age, anatomy, whole scene, neighbors and every seam.'; }
export function sourceBodyOverlay(g: SourceBodyGeometry) { return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768">' + g.editableRects.map(r => '<rect x="' + r.left + '" y="' + r.top + '" width="' + r.width + '" height="' + r.height + '" fill="#ec3098" fill-opacity=".12"/>').join('') + g.editablePolygons.map(p => '<polygon points="' + p.map(v => v.join(',')).join(' ') + '" fill="#ec3098" fill-opacity=".18"/>').join('') + g.protectedRects.map(r => '<rect x="' + r.left + '" y="' + r.top + '" width="' + r.width + '" height="' + r.height + '" fill="#15a46b" fill-opacity=".15"/>').join('') + '</svg>'; }
