/** Bounded opt-in engine experiment using the existing retained billing transport. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { buyLocalPatch, localPatchRenderPolicySha256 } from '../src/infra/generation/openai-local-patch';
import { purchaseOnce } from '../src/services/generation/paid-operation';
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository } from '../src/services/generation/world-budget';
import { PrismaWorldBudgetStore } from '../src/infra/db/prisma-world-budget-store';
import { CasWorldBudgetRepository } from '../src/infra/db/world-budget-repository';
import { PrismaRetainedPurchaseStore } from '../src/infra/db/prisma-retained-purchase-store';
import { applyTestSchema } from '../src/lib/test-schema';
import { LocalPatchBoardSchema, cropOf, maskForHide } from '../src/domain/scene/local-patch-hides';
import { poseMask } from '../src/services/generation/local-patch-render';
import { composeBoundedLocalPatch } from '../src/services/generation/local-patch-seam';
import { REFINEMENT as S, refinementArgs, refinementPrompt, SOURCE_HEAD_PATH, B_HEAD_PATH, PORTRAIT_HEAD_PATH, PORTRAIT_PAINT_PROMPT, CLOSE_FINISH_PROMPT, paintedPlacementPrompt } from './lib/board-paint-refinement';

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
function pin(file: string, bytes: Buffer | string) {
  if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(bytes)) throw Error(`Immutable evidence changed: ${path.basename(file)}`); }
  else writeFileSync(file, bytes, { flag: 'wx' });
}
async function main() {
  const { mode, variant } = refinementArgs(process.argv.slice(2));
  const dir = path.resolve(S.storage); mkdirSync(dir, { recursive: true });
  const inputs = json(path.join(S.baseline, 'inputs.json'));
  const board = LocalPatchBoardSchema.parse(inputs.boards[0].board);
  const placement = variant.startsWith('painted-hide-');
  const hideNumber = placement ? Number(variant.split('-')[2]) : 3;
  const hide = board.hides.find(h => h.id === `magic-dragoncave-refresh-v3-${hideNumber}`)!;
  const original = readFileSync(board.art);
  if (hash(original) !== inputs.boards[0].sourceSha256) throw Error('Source changed');
  const source = readFileSync(path.join(S.baseline, `${hide.id}-attempt-1-before.png`));
  const prior = json(path.join(S.baseline, `${hide.id}-attempt-1-request.json`));
  const identityRaw = readFileSync(path.join(S.baseline, 'identity-normalized.png'));
  if (hash(source) !== prior.styleSha256 || hash(identityRaw) !== prior.identitySha256) throw Error('Reference mismatch');
  // Mirror the existing multi-reference transport normalization exactly.
  let identity = await sharp(identityRaw).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  if (placement) {
    identity = readFileSync(path.join(dir, 'portrait-paint-medium.png'));
    if (hash(identity) !== json(path.join(dir, 'portrait-paint-medium.json')).sha256) throw Error('Derived portrait changed');
  }
  const approvedRaw = readFileSync('output/bar-material-review-20260923/dragon-stool-style-proof-v2.png');
  if (hash(approvedRaw) !== 'b8327c332d9af3cd6d7560ccd0d2a65d7112794965c71900faa48d48ce441e2c') throw Error('Approved sample changed');
  const portrait = variant === 'portrait-paint-medium';
  const close = variant === 'b-close-finish-medium';
  const closeCrop = { left: 190, top: 40, width: 210, height: 210 };
  const paint = portrait || close ? await sharp(approvedRaw).extract({ left: 150, top: 142, width: 340, height: 420 }).png().toBuffer()
    : await sharp(approvedRaw).resize(512, 768).png().toBuffer();
  const finishing = variant === 'b-head-medium' || close;
  const baseTarget = portrait ? identityRaw : finishing ? readFileSync(path.join(S.comparison, 'b-v13-low.png')) : source;
  if (finishing && hash(baseTarget) !== json(path.join(S.comparison, 'b-v13-low.json')).sha256) throw Error('B changed');
  const target = close ? await sharp(baseTarget).extract(closeCrop).resize(512, 512).png().toBuffer() : baseTarget;
  const height = portrait || close ? 512 : 768;
  const transform = close ? ` transform="scale(${512 / closeCrop.width}) translate(-${closeCrop.left} -${closeCrop.top})"` : '';
  const alpha = await sharp(Buffer.from(`<svg width="512" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${portrait ? PORTRAIT_HEAD_PATH : finishing ? B_HEAD_PATH : SOURCE_HEAD_PATH}"${transform} fill="white"/></svg>`)).png().toBuffer();
  const mask = placement ? await poseMask(hide) : await sharp({ create: { width: 512, height, channels: 4, background: 'black' } }).composite([{ input: alpha, blend: 'dest-out' }]).png().toBuffer();
  const policy = { ...inputs.policy, ...(portrait || close ? { size: '1024x1024' as const } : {}), quality: variant.endsWith('-low') ? 'low' as const : 'medium' as const };
  const prompt = close ? CLOSE_FINISH_PROMPT : placement ? paintedPlacementPrompt(hideNumber) : portrait ? PORTRAIT_PAINT_PROMPT : refinementPrompt(finishing);
  const manifest = { experiment: S.id, variant, scope: 'private-engine-boundary-experiment-not-live-runner',
    prompt, policy, policyHash: localPatchRenderPolicySha256(policy), capMicroUsd: S.capMicroUsd,
    references: [{ role: 'edit target', sha256: hash(target) }, { role: placement ? 'derived painted canonical identity' : 'canonical identity', sha256: hash(identity) }, ...(!placement ? [{ role: 'approved paint only', sha256: hash(paint) }] : [])],
    originalSha256: hash(original), maskSha256: hash(mask), composition: placement ? 'existing bounded compositor; no prop protection guarantee' : 'exact outside-head source restoration; does not prove face geometry', hide: hide.id };
  const manifestBytes = JSON.stringify(manifest, null, 2);
  pin(path.join(dir, `${variant}-request.json`), manifestBytes);
  for (const [name, bytes] of [['target', target], ['identity', identity], ['paint', paint], ['mask', mask], ['alpha', alpha]] as const) pin(path.join(dir, `${variant}-${name}.png`), bytes);
  if (mode === '--prepare') { console.log(JSON.stringify({ variant, mode, paidCalls: 0 })); return; }
  if (!process.env.OPENAI_API_KEY) throw Error('Existing approved key must be loaded privately');
  const dbFile = path.join(dir, 'purchases.sqlite'), fresh = !existsSync(dbFile);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replaceAll('\\', '/')}` } } });
  try {
    if (fresh) await applyTestSchema(db, process.cwd());
    const repository = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repository.transactWorld(id, tx => work({ ...tx, createRequest: async request => {
      if (id !== S.id || !S.variants.some(v => request.requestKey === `image:${v}:1`)
        || auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > S.capMicroUsd) throw new WorldBudgetError('cap_exceeded', 'Refinement experiment limit');
      return tx.createRequest(request);
    } })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db);
    const requestKey = `image:${variant}:1`, fingerprint = hash(manifestBytes);
    const bought = await purchaseOnce({ ledger, store }, { worldId: S.id, requestKey, scope: 'image', operationFingerprint: fingerprint, reserveMicroUsd: 150_000,
      buy: async () => {
        const result = await buyLocalPatch(process.env.OPENAI_API_KEY!, { worldId: S.id, requestKey, prompt,
          stylePng: target, identityPng: identity, ...(placement ? { referenceMode: 'canonical-portrait-only/v1' as const } : { boardPeoplePng: paint }), maskPng: mask }, { policy });
        const bytes = Buffer.from(JSON.stringify({ png: (result.png ?? result.quarantined)?.toString('base64'), rejected: result.rejected }));
        return result.evidence ? { bytes, evidence: result.evidence } : { bytes, unknownReason: result.unknownReason ?? 'Missing billing evidence' };
      } });
    writeFileSync(path.join(dir, 'budget.json'), JSON.stringify({ ...(await ledger.audit(S.id)), experimentCeilingMicroUsd: S.capMicroUsd }, null, 2));
    if (bought.kind !== 'bought') throw Error(`Purchase ${bought.kind}; reconcile, no automatic retry`);
    const retained = JSON.parse(bought.bytes.toString());
    if (!retained.png || retained.rejected) throw Error('Image refused; original answer retained');
    const raw = Buffer.from(retained.png, 'base64'); pin(path.join(dir, `${variant}-provider.png`), raw);
    const patch = await sharp(raw).resize(512, height).png().toBuffer(); pin(path.join(dir, `${variant}-raw.png`), patch);
    const head = await sharp(patch).ensureAlpha().composite([{ input: alpha, blend: 'dest-in' }]).png().toBuffer();
    const composition = placement ? await composeBoundedLocalPatch(await sharp(original).png().toBuffer(), cropOf(hide), patch, maskForHide(hide)) : null;
    const result = composition ? await sharp(composition.candidate).extract(cropOf(hide)).png().toBuffer() : await sharp(target).composite([{ input: head }]).png().toBuffer(); pin(path.join(dir, `${variant}.png`), result);
    const beforePixels = await sharp(target).removeAlpha().raw().toBuffer(), afterPixels = await sharp(result).removeAlpha().raw().toBuffer();
    const opacity = await sharp(alpha).ensureAlpha().raw().toBuffer(); let changed = 0, protectedChanges = 0;
    for (let pixel = 0; pixel < 512 * height; pixel++) if ([0, 1, 2].some(c => beforePixels[pixel * 3 + c] !== afterPixels[pixel * 3 + c])) { changed++; if (!opacity[pixel * 4 + 3]) protectedChanges++; }
    if (!placement && protectedChanges) throw Error('Protected pixels changed');
    if (!portrait) {
      const patchResult = close ? await sharp(baseTarget).composite([{ input: await sharp(result).resize(closeCrop.width, closeCrop.height).png().toBuffer(), left: closeCrop.left, top: closeCrop.top }]).png().toBuffer() : result;
      if (close) pin(path.join(dir, `${variant}-crop.png`), patchResult);
      const full = await sharp(original).composite([{ input: patchResult, left: hide.left, top: hide.top }]).png().toBuffer();
      pin(path.join(dir, `${variant}-board.png`), full);
      pin(path.join(dir, `${variant}-preview.webp`), await sharp(full).resize(1920).webp({ quality: 90 }).toBuffer());
    }
    pin(path.join(dir, `${variant}.json`), JSON.stringify({ fingerprint, sha256: hash(result), rawSha256: hash(raw), changed, protectedChanges: placement ? null : protectedChanges,
      ...(composition ? { technical: { usable: composition.usable, seam: composition.report, compositionPermission: composition.compositionPermission } } : {}),
      chargeMicroUsd: bought.evidence.amountMicroUsd, costBasis: bought.evidence.costBasis, visualReview: 'pending' }, null, 2));
    console.log(JSON.stringify({ variant, retained: true, replayed: bought.replayed, protectedChanges, chargeMicroUsd: bought.evidence.amountMicroUsd }));
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Refinement failed'); process.exitCode = 1; });
