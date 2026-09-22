/** Read-only master inspection: previews are NEVER shipping art. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const files = [
  'journey-marrakech-v8-inner-targets', 'journey-paris-v7-balanced-french-plaza',
  'journey-tokyo-v6-coherent-scale', 'journey-china-v8-food-clothing-wide',
  'journey-antarctica-v7-shallow-research-station', 'journey-sydney-v6-bright-surf-beach',
  'journey-giza-v4-sydney-dimensional-paint', 'magic-dragoncave-v3-bright-color',
  'magic-icepalace-v2-winter-wonders', 'magic-underwater-v2-blue-reef-wonders',
  'magic-cloudcity-v1-wind-post-wonders', 'magic-sweetworkshop-v3-chocolate-rivers-cream-mountains',
  'magic-nightcarnival-v1-lantern-parade',
];
const out = 'output/two-worlds-20260919/inspection';
fs.mkdirSync(out, {recursive:true});
for (const name of files) {
  await sharp(`output/imagegen/${name}.png`).resize(1920,1080).jpeg({quality:95}).toFile(path.join(out,`${name}.jpg`));
}
console.log(`${files.length} inspection-only previews; original masters untouched`);
