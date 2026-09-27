/** Fixed, offline dragon-3 A/B; no provider, ledger, credentials or DB access. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { reliefProbe } from './lib/registered-skin-relief';

const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const root = 'storage/bar-paint-refinement-20260927/engine-pilot';
const dest = `${root}/registered-relief-v1`;
const read = (name: string) => readFileSync(`${root}/${name}`);
const pin = (name: string, bytes: Buffer | string) => {
  const file = `${dest}/${name}`;
  if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(bytes)) throw Error(`Evidence changed: ${name}`); }
  else writeFileSync(file, bytes, { flag: 'wx' });
};
async function main() {
  if (process.argv.length !== 2) throw Error('This probe accepts no arguments and cannot expand its scope');
  const originalPng = read('dragon-3-before.png'), paintedPng = read('dragon-3.png'), headAlphaPng = read('dragon-3-native-alpha.png');
  const capture = JSON.parse(read('dragon-3-inputs.json').toString()), receipt = JSON.parse(read('dragon-3.json').toString());
  if (hash(originalPng) !== capture.targetSha256 || hash(paintedPng) !== receipt.sha256 || hash(headAlphaPng) !== capture.alphaSha256) throw Error('Pinned inputs changed');
  // One connected skin surface, holes protect brows/eyes, nostrils and mouth.
  // This is authored for this retained crop ONLY, not a face segmentation model.
  const skinSvg = `<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg"><path fill="white" fill-rule="evenodd" d="
    M251 145 Q252 135 266 136 L278 131 L286 126 Q294 138 305 133 Q319 133 329 146
    L335 172 Q334 195 316 207 Q299 219 279 210 Q260 205 254 187 Z
    M254 158 Q268 149 279 156 L282 165 Q273 179 259 179 L253 171 Z
    M293 146 Q310 137 321 145 L323 155 Q316 169 299 168 L290 160 Z
    M280 180 Q289 174 299 178 L301 187 Q290 194 280 188 Z
    M277 194 Q296 184 312 191 L313 199 Q296 211 280 203 Z"/></svg>`;
  const skinAlphaPng = await sharp(Buffer.from(skinSvg)).png().toBuffer();
  const window = { left: 190, top: 40, width: 210, height: 210 };
  const result = await reliefProbe({ originalPng, paintedPng, headAlphaPng, skinAlphaPng, window });
  mkdirSync(dest, { recursive: true });
  pin('skin.svg', skinSvg); pin('skin-alpha.png', skinAlphaPng);
  pin('unregistered.png', result.unregistered.candidate); pin('registered.png', result.registered.candidate);
  const face = { left: 232, top: 118, width: 116, height: 106 };
  const inputs = [originalPng, result.unregistered.candidate, result.registered.candidate, paintedPng];
  const tiles = await Promise.all(inputs.map(b => sharp(b).extract(face).resize(348, 318, { kernel: 'nearest' }).png().toBuffer()));
  pin('comparison-3x.png', await sharp({ create: { width: 348 * 4, height: 318, channels: 3, background: '#eeeeee' } })
    .composite(tiles.map((input, i) => ({ input, left: 348 * i, top: 0 }))).png().toBuffer());
  const evidence = { recipe: result.version, sourceCodeSha256: hash(readFileSync('scripts/lib/registered-skin-relief.ts')),
    inputs: { original: hash(originalPng), painted: hash(paintedPng), headAlpha: hash(headAlphaPng), skinAlpha: hash(skinAlphaPng), window },
    alignment: result.alignment, unregistered: { ...result.unregistered.metrics, sha256: hash(result.unregistered.candidate) },
    registered: { ...result.registered.metrics, sha256: hash(result.registered.candidate) }, providerCalls: 0, priceMicroUsd: 0,
    comparisonOrder: ['original', 'unregistered', 'registered', 'paid candidate'], requiresVisualReview: true,
    note: 'Equal RGB offsets preserve chroma; local low-frequency luminance is measured, not claimed byte-exact. No runtime activation.' };
  pin('evidence.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Probe failed'); process.exitCode = 1; });
