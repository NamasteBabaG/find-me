import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { BOARD_FACE_FINISH_VERSION, prepareBoardFaceFinish, renderBoardFaceFinish } from '../src/services/generation/board-face-finish';
import { REFINEMENT, B_HEAD_PATH } from './lib/board-paint-refinement';
import { TWO_WORLD_PATCH_BOARDS, TWO_WORLD_STORAGE } from '../content/adventures/two-worlds-production';
import { LocalPatchBoardSchema } from '../src/domain/scene/local-patch-hides';
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository } from '../src/services/generation/world-budget';
import { PrismaWorldBudgetStore } from '../src/infra/db/prisma-world-budget-store';
import { CasWorldBudgetRepository } from '../src/infra/db/world-budget-repository';
import { PrismaRetainedPurchaseStore } from '../src/infra/db/prisma-retained-purchase-store';

const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const cases = {
  'dragon-3': { slug: 'magic-dragoncave-refresh-v3', hide: 3, attempt: 0, window: { left: 190, top: 40, width: 210, height: 210 }, shape: B_HEAD_PATH },
  'dragon-1': { slug: 'magic-dragoncave-refresh-v3', hide: 1, attempt: 1, window: { left: 170, top: 180, width: 176, height: 176 }, shape: 'M 196 230 Q 197 194 246 198 Q 302 196 310 247 L 310 281 L 298 309 L 275 328 L 249 334 L 223 319 L 208 295 Z' },
  'dragon-2': { slug: 'magic-dragoncave-refresh-v3', hide: 2, attempt: 2, window: { left: 90, top: 82, width: 206, height: 206 }, shape: 'M 122 162 Q 121 109 181 108 Q 236 107 259 147 L 269 192 L 265 228 L 247 256 L 216 278 L 186 278 L 151 258 L 133 226 Z' },
  'ice-1': { slug: 'magic-icepalace-refresh-v2', hide: 1, attempt: 1, window: { left: 160, top: 184, width: 144, height: 144 }, shape: 'M 191 228 Q 193 205 228 204 Q 264 201 274 229 L 277 263 L 268 282 L 253 301 L 233 307 L 214 300 L 198 277 Z' },
} as const;
function pin(file: string, data: Buffer | string) {
  if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(data)) throw Error(`Evidence changed: ${path.basename(file)}`); }
  else writeFileSync(file, data, { flag: 'wx' });
}
async function main() {
  const [mode, name, ...extra] = process.argv.slice(2);
  if (!mode || !name || !(name in cases) || extra.length || !['--prepare', '--render', '--prepare-skin', '--render-skin'].includes(mode)) throw Error('Use --prepare|--render|--prepare-skin|--render-skin <dragon-1|dragon-2|dragon-3|ice-1>');
  const skinOnly = mode.endsWith('-skin');
  if (skinOnly && name !== 'dragon-3' && name !== 'ice-1') throw Error('Skin pilot limited to dragon-3 and ice-1');
  const evidenceName = skinOnly ? `${name}-skin-direct` : name;
  const item = cases[name as keyof typeof cases];
  const dir = path.resolve(REFINEMENT.storage, 'engine-pilot'); mkdirSync(dir, { recursive: true });
  const board = TWO_WORLD_PATCH_BOARDS.find(b => b.board === item.slug)!;
  LocalPatchBoardSchema.parse(board);
  const hide = board.hides.find(h => h.id === `${item.slug}-${item.hide}`)!;
  const targetFile = item.attempt ? path.join(TWO_WORLD_STORAGE, item.slug, `${hide.id}-attempt-${item.attempt}.png`)
    : path.join(REFINEMENT.comparison, 'b-v13-low.png');
  const targetPng = readFileSync(targetFile);
  const receipt = json(targetFile.replace(/\.png$/, '.json'));
  if (hash(targetPng) !== receipt.sha256) throw Error('Target receipt mismatch');
  const identityPng = readFileSync(path.join(REFINEMENT.baseline, 'identity-normalized.png'));
  if (hash(identityPng) !== json(path.join(REFINEMENT.baseline, 'inputs.json')).identitySha256) throw Error('Canonical identity changed');
  const approved = readFileSync('output/bar-material-review-20260923/dragon-stool-style-proof-v2.png');
  if (hash(approved) !== 'b8327c332d9af3cd6d7560ccd0d2a65d7112794965c71900faa48d48ce441e2c') throw Error('Approved paint changed');
  const paintPng = await sharp(approved).extract({ left: 150, top: 142, width: 340, height: 420 }).png().toBuffer();
  const editableAlphaPng = skinOnly ? readFileSync(path.join(dir, `${name}-skin-alpha.png`))
    : await sharp(Buffer.from(`<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg"><path d="${item.shape}" fill="white"/></svg>`)).png().toBuffer();
  const policy = { ...json(path.join(REFINEMENT.baseline, 'inputs.json')).policy, size: '1024x1024' as const, quality: 'medium' as const };
  const input = { expectedVersion: BOARD_FACE_FINISH_VERSION as typeof BOARD_FACE_FINISH_VERSION, worldId: REFINEMENT.id, requestKey: `finish:${evidenceName}:1`, apiKey: process.env.OPENAI_API_KEY ?? '',
    targetPng, identityPng, paintPng, editableAlphaPng, window: item.window, policy };
  const prepared = await prepareBoardFaceFinish(input);
  const original = readFileSync(board.art);
  pin(path.join(dir, `${evidenceName}-inputs.json`), JSON.stringify({ recipe: BOARD_FACE_FINISH_VERSION, case: item, targetSha256: hash(targetPng), originalSha256: hash(original),
    identitySha256: hash(identityPng), paintSha256: hash(paintPng), alphaSha256: hash(editableAlphaPng), policy }, null, 2));
  for (const [part, data] of [['before', targetPng], ['wire-target', prepared.target], ['mask', prepared.maskPng], ['native-alpha', editableAlphaPng], ['identity', identityPng], ['paint', paintPng]] as const) pin(path.join(dir, `${evidenceName}-${part}.png`), data);
  if (mode.startsWith('--prepare')) { console.log(JSON.stringify({ name: evidenceName, paidCalls: 0 })); return; }
  if (!input.apiKey) throw Error('Load existing approved key privately');
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.resolve(REFINEMENT.storage, 'purchases.sqlite').replaceAll('\\', '/')}` } } });
  try {
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx, createRequest: async row => {
      if (id !== REFINEMENT.id || ![...Object.keys(cases), 'dragon-3-skin-direct', 'ice-1-skin-direct'].some(k => row.requestKey === `finish:${k}:1`)
        || auditWorldBudget(tx.snapshot).committedMicroUsd + row.reserveMicroUsd > REFINEMENT.capMicroUsd) throw new WorldBudgetError('cap_exceeded', 'Finishing pilot cap');
      return tx.createRequest(row);
    } })) };
    const ledger = new WorldBudget(bounded);
    const result = await renderBoardFaceFinish({ ledger, store: new PrismaRetainedPurchaseStore(db) }, input);
    writeFileSync(path.resolve(REFINEMENT.storage, 'budget.json'), JSON.stringify({ ...(await ledger.audit(REFINEMENT.id)), experimentCeilingMicroUsd: REFINEMENT.capMicroUsd }, null, 2));
    if (result.kind !== 'candidate') throw Error(`Finishing ${result.kind}; no retry`);
    pin(path.join(dir, `${evidenceName}-raw.png`), result.raw);
    pin(path.join(dir, `${evidenceName}.png`), result.candidate);
    const full = await sharp(original).composite([{ input: result.candidate, left: hide.left, top: hide.top }]).png().toBuffer();
    pin(path.join(dir, `${evidenceName}-board.png`), full);
    pin(path.join(dir, `${evidenceName}-preview.webp`), await sharp(full).resize(1920).webp({ quality: 90 }).toBuffer());
    pin(path.join(dir, `${evidenceName}.json`), JSON.stringify({ fingerprint: result.fingerprint, capture: result.capture, sha256: hash(result.candidate), rawSha256: hash(result.raw),
      changedPixels: result.changedPixels, protectedChanges: result.protectedChanges, requiresVisualReview: result.requiresVisualReview,
      chargeMicroUsd: result.evidence.amountMicroUsd, costBasis: result.evidence.costBasis }, null, 2));
    console.log(JSON.stringify({ name, protectedChanges: result.protectedChanges, chargeMicroUsd: result.evidence.amountMicroUsd, replayed: result.replayed }));
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Pilot failed'); process.exitCode = 1; });
