import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { sourceBodyAlpha, SOURCE_BODY_COMPOSE_VERSION, type SourceBodyGeometry } from '../../domain/scene/source-body-repair';
import { sha256Bytes } from './fixed-sprite';
import { composeBoundedLocalPatch } from './local-patch-seam';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { sameChargeEvidence } from './world-budget';
import { readSourceBodyRepairPin, sourceBodyMarkerFor } from './source-body-repair-pin';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Native edit alpha, independent of model compliance. Protected pixels are restored byte for byte. */
export async function sourceBodyMaskPng(g: SourceBodyGeometry) { const a = sourceBodyAlpha(g), pixels = Buffer.alloc(512 * 768 * 4, 255); for (let i = 0; i < a.length; i++)
    pixels[i * 4 + 3] = 255 - a[i]!; return sharp(pixels, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(); }
export async function applySourceBodyPixels(beforePng: Buffer, rawPng: Buffer, g: SourceBodyGeometry) {
    const before = await sharp(beforePng).extract(g.crop).ensureAlpha().raw().toBuffer(), raw = await sharp(rawPng).ensureAlpha().raw().toBuffer();
    if (raw.length !== before.length)
        throw Error('SOURCE_BODY: raster dimensions changed');
    const a = sourceBodyAlpha(g), out = Buffer.from(before);
    for (let i = 0; i < a.length; i++)
        if (a[i])
            for (let c = 0; c < 4; c++)
                out[i * 4 + c] = raw[i * 4 + c]!;
    let outsideChangedPixels = 0;
    for (let i = 0; i < a.length; i++)
        if (!a[i] && out.subarray(i * 4, i * 4 + 4).compare(before.subarray(i * 4, i * 4 + 4)))
            outsideChangedPixels++;
    return { png: await sharp(out, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(), proof: { version: SOURCE_BODY_COMPOSE_VERSION, sourcePngSha256: sha256Bytes(beforePng), normalizedRawSha256: sha256Bytes(rawPng), maskSha256: sha256Bytes(Buffer.from(a)), outsideChangedPixels } };
}
/** Recompute from the settled immutable RAW before a new review and publication. Hash/zero claims alone cannot publish. */
export async function sourceBodyCompositionEvidenceMatches(db: Prisma.TransactionClient, input: {
    gameId: string;
    hideId: string;
    receipt: Record<string, unknown>;
    geometry: SourceBodyGeometry;
    beforePng: Buffer;
}) {
    try {
        const { receipt: r, geometry: g } = input, p = await readSourceBodyRepairPin(db, input.gameId), s = p?.selected.find(s => s.hideId === input.hideId);
        if (!p || !s || !same(r.sourceBodyRepair, sourceBodyMarkerFor(p, s)))
            return false;
        const worldId = input.gameId + ':board-wizard', ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(worldId), bill = ledger?.snapshot.requests.find(b => b.requestKey === s.requestKey), kept = await new PrismaRetainedPurchaseStore(db).get(worldId, s.requestKey);
        if (!bill || bill.state !== 'settled' || bill.scope !== 'image' || bill.conflicts.length || !kept?.evidence || kept.scope !== 'image' || kept.operationFingerprint !== bill.operationFingerprint || !sameChargeEvidence(kept.evidence, bill.evidence))
            return false;
        const wire = JSON.parse(kept.bytes.toString());
        if (wire.version !== 'local-patch-render/v1' || wire.rejected !== null || typeof wire.bytesBase64 !== 'string' || !same(wire.authoredReturn, r.authoredReturn) || !same(wire.sourceBodyRepair, r.sourceBodyRepair))
            return false;
        const original = Buffer.from(wire.bytesBase64, 'base64');
        if (original.toString('base64') !== wire.bytesBase64)
            return false;
        const raw = await sharp(original, { limitInputPixels: 8294400 }).resize(512, 768, { fit: 'fill' }).png().toBuffer(), restored = await applySourceBodyPixels(input.beforePng, raw, g);
        if (restored.proof.outsideChangedPixels !== 0 || !same(restored.proof, r.sourceBodyComposition))
            return false;
        const joined = await composeBoundedLocalPatch(input.beforePng, g.crop, restored.png, g.child, { requireAligned: true, returnRect: g.returnRect });
        if (!joined.usable)
            return false;
        return sha256Bytes(await sharp(joined.candidate).extract(g.crop).png().toBuffer()) === r.judgedSha256;
    }
    catch {
        return false;
    }
}
