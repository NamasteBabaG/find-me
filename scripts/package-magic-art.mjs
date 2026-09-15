import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Non-generative packaging only: retain native pixels in lossless WebP.
const [source, slug, draft] = process.argv.slice(2);
if (!source || !/^magic-[a-z0-9-]+$/.test(slug ?? '')) throw new Error('Usage: node scripts/package-magic-art.mjs source magic-slug [discovery-draft]');
const dest = path.join('public/scenes', slug);
await fs.mkdir(dest, { recursive: true });
const output = path.join(dest, 'base.webp');
try { await fs.access(output); throw new Error(`Refusing overwrite: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const original = await fs.readFile(source);
const meta = await sharp(original).metadata();
if (meta.width !== 3840 || meta.height !== 2160) throw new Error(`Expected native 3840x2160, received ${meta.width}x${meta.height}`);
await sharp(original).webp({ lossless: true, effort: 6 }).toFile(output);
const before = await sharp(original).removeAlpha().raw().toBuffer();
const after = await sharp(output).removeAlpha().raw().toBuffer();
if (!before.equals(after)) throw new Error('Lossless pixel verification failed');
await sharp(original).resize({ width: 1200 }).webp({ quality: 88 }).toFile(path.join(dest, 'thumb.webp'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = { status: draft ? 'authored-not-playtested' : 'art-review-only', source, sourceSha256: sha(original), file: `/scenes/${slug}/base.webp`, width: meta.width, height: meta.height, sha256: sha(await fs.readFile(output)), losslessPixelsVerified: true, catalogActivated: false, personalHides: 0 };
if (draft) {
  const data = JSON.parse(await fs.readFile(draft, 'utf8'));
  if (data.art.sha256 !== manifest.sourceSha256) throw new Error('Discovery source hash mismatch');
  data.sourcePngSha256 = data.art.sha256;
  data.source = manifest.file;
  data.art.sha256 = manifest.sha256;
  await fs.writeFile(path.join(dest, 'discoveries.draft.json'), JSON.stringify(data, null, 2) + '\n');
}
await fs.writeFile(path.join(dest, 'art-provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
