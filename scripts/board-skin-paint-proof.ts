/** FREE composition of retained paint. Explicit hand-authored skin planes only. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { REFINEMENT } from './lib/board-paint-refinement';
import { composeBoardSkinPaint, BOARD_SKIN_PAINT_VERSION } from '../src/services/generation/board-skin-paint';
import { TWO_WORLD_PATCH_BOARDS } from '../content/adventures/two-worlds-production';
const paths = {
  'dragon-1': 'M174 248 L210 211 L269 215 L302 239 L278 241 L248 253 L229 269 L208 262 L182 269 Z M184 332 L211 324 L219 340 L221 358 L204 363 L188 351 Z M274 306 L303 291 L335 284 L345 319 L329 343 L305 355 L275 333 Z M220 393 L266 388 L293 378 L288 396 L266 407 L240 409 Z',
  'dragon-2': 'M180 297 L219 254 L255 252 L295 245 L326 269 L295 282 L271 304 L251 315 L226 309 L201 315 Z M189 382 L219 379 L239 397 L239 415 L218 418 L205 401 Z M318 348 L343 335 L371 340 L380 369 L367 398 L344 414 L315 390 Z M257 451 L301 444 L329 434 L321 452 L293 467 L268 465 Z',
  'dragon-3': 'M169 258 L207 213 L251 224 L282 228 L300 243 L273 251 L246 264 L226 279 L205 273 L178 280 Z M170 343 L206 336 L220 355 L220 372 L199 380 L177 365 Z M281 309 L315 300 L339 311 L350 335 L333 356 L305 353 L276 338 Z M231 405 L264 401 L293 387 L286 404 L270 417 L250 419 Z',
  'ice-1': 'M175 249 L202 221 L240 213 L270 219 L299 223 L321 237 L291 239 L270 249 L248 261 L228 261 L208 260 L187 266 Z M190 317 L220 314 L238 333 L231 345 L211 350 L194 335 Z M289 294 L319 286 L342 291 L349 313 L335 333 L313 338 L284 319 Z M252 382 L285 374 L306 362 L303 379 L277 391 L252 395 Z',
};
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
function pin(file: string, bytes: string | Buffer) {
  if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(bytes)) throw Error('Skin proof evidence changed'); }
  else writeFileSync(file, bytes, { flag: 'wx' });
}
async function main() {
  if (process.argv.length > 2) throw Error('No paid arguments');
  const dir = path.resolve(REFINEMENT.storage, 'engine-pilot');
  for (const [name, planePath] of Object.entries(paths)) {
    const info = JSON.parse(readFileSync(path.join(dir, `${name}-inputs.json`), 'utf8'));
    const target = readFileSync(path.join(dir, `${name}-before.png`));
    const painted = readFileSync(path.join(dir, `${name}.png`));
    const receipt = JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    if (hash(target) !== info.targetSha256 || hash(painted) !== receipt.sha256) throw Error('Paid evidence mismatch');
    const w = info.case.window;
    const opaque = await sharp(Buffer.from(`<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg"><path transform="translate(${w.left} ${w.top}) scale(${w.width / 512})" d="${planePath}" fill="white"/></svg>`)).png().toBuffer();
    // Soften INSIDE the authored area only. A blur alone would leak outside it.
    const alpha = await sharp(opaque).blur(0.7).composite([{ input: opaque, blend: 'dest-in' }]).png().toBuffer();
    const sigma = w.width / 64, strength = 1;
    const result = await composeBoardSkinPaint({ originalPng: target, paintedPng: painted, skinAlphaPng: alpha, sigma, strength });
    const prefix = path.join(dir, `${name}-skin`);
    pin(`${prefix}.png`, result.candidate); pin(`${prefix}-alpha.png`, alpha);
    const before = await sharp(target).removeAlpha().raw().toBuffer(), after = await sharp(result.candidate).removeAlpha().raw().toBuffer(), a = await sharp(alpha).ensureAlpha().raw().toBuffer();
    let protectedChanges = 0;
    for (let p = 0; p < 512 * 768; p++) if (!a[p * 4 + 3] && [0, 1, 2].some(c => before[p * 3 + c] !== after[p * 3 + c])) protectedChanges++;
    if (protectedChanges) throw Error('Native protection failed');
    const pair = await sharp({ create: { width: 1024, height: 768, channels: 3, background: 'white' } }).composite([{ input: target, left: 0, top: 0 }, { input: result.candidate, left: 512, top: 0 }]).png().toBuffer();
    pin(`${prefix}-before-after.png`, pair);
    pin(`${prefix}-detail.png`, await sharp(result.candidate).extract(w).resize(512, 512).png().toBuffer());
    const board = TWO_WORLD_PATCH_BOARDS.find(b => b.board === info.case.slug)!;
    const hide = board.hides.find(h => h.id.endsWith(`-${info.case.hide}`))!;
    pin(`${prefix}-preview.webp`, await sharp(readFileSync(board.art)).composite([{ input: result.candidate, left: hide.left, top: hide.top }]).resize(1920).webp({ quality: 90 }).toBuffer());
    pin(`${prefix}.json`, JSON.stringify({ version: BOARD_SKIN_PAINT_VERSION, source: hash(target), paint: hash(painted), alpha: hash(alpha), sha256: hash(result.candidate), sigma, strength,
      protectedChanges, changedPixels: result.changedPixels, editablePixels: result.editablePixels, paidCalls: 0, readyForBulk: false }, null, 2));
    console.log(JSON.stringify({ name, changedPixels: result.changedPixels, protectedChanges, paidCalls: 0 }));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Skin proof failed'); process.exitCode = 1; });
