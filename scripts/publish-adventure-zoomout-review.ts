/** Package completed art for review only; never updates the playable board catalog. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

async function main() {
  const directory = 'output/imagegen/adventure-zoomout-20260914-v2';
  const plan = JSON.parse(readFileSync(`${directory}/plan.json`, 'utf8'));
  const manifestFile = 'content/adventures/expansion/zoomout-review.json';
  if (existsSync(manifestFile)) throw Error('Review is frozen; use a new revision instead of overwriting it.');
  const boards = plan.boards as { id: string; source: string; sourceSha256: string; output: string; promptFile: string }[];
  // Preflight every requested output before creating any public review asset.
  for (const board of boards) {
    const metadata = await sharp(board.output).metadata();
    if (metadata.width !== 3840 || metadata.height !== 2160) throw Error(`Not native 4K: ${board.id}`);
    const sourceHash = createHash('sha256').update(readFileSync(board.source)).digest('hex');
    if (sourceHash !== board.sourceSha256) throw Error(`Source changed: ${board.id}`);
    if (existsSync(`public/scenes/adventure-${board.id}-zoomout-v2`)) throw Error(`Already packaged: ${board.id}`);
  }
  const reviews = [];
  for (const board of boards) {
    const publicDirectory = `public/scenes/adventure-${board.id}-zoomout-v2`;
    mkdirSync(publicDirectory, { recursive: true });
    await sharp(board.output).webp({ lossless: true }).toFile(`${publicDirectory}/base.webp`);
    await sharp(board.output).resize(768, 432).webp({ quality: 90 }).toFile(`${publicDirectory}/thumb.webp`);
    reviews.push({ id: board.id, status: 'awaiting-parent-art-approval',
      before: `/${board.source.replace(/^public\//, '')}`, after: `/${publicDirectory.replace(/^public\//, '')}/base.webp`,
      width: 3840, height: 2160,
      sourceSha256: board.sourceSha256,
      sha256: createHash('sha256').update(readFileSync(`${publicDirectory}/base.webp`)).digest('hex'),
      prompt: readFileSync(board.promptFile, 'utf8'),
      inheritedCoordinatesAllowed: false, childPlacementAllowed: false,
    });
  }
  const galleryFile = 'public/reviews/adventure-expansion-20260914.html';
  let gallery = readFileSync(galleryFile, 'utf8');
  for (const review of reviews) {
    gallery = gallery.replaceAll(review.before, review.after);
    const start = gallery.indexOf(`<article id="${review.id}">`);
    const end = gallery.indexOf('</article>', start);
    if (start < 0 || end < 0) throw Error(`Gallery article missing: ${review.id}`);
    const article = gallery.slice(start, end)
      .replace('הצעה חדשה — טרם אושרה על ידך', 'זום־אאוט חדש — ממתין לאישור שלך')
      .replace('</footer>', `<a class="full" href="${review.before}" target="_blank" rel="noopener">לפני השינוי ↗</a></footer>`);
    gallery = gallery.slice(0, start) + article + gallery.slice(end);
  }
  gallery = gallery.replace('הצבת הילדים מושהית • מחכים לפידבק שלך', 'ששת הלוחות הורחקו • אין מחבואים לפני אישור');
  gallery = gallery.replace('לוחות הבסיס עם פריטי החיפוש, ללא ההצבות של בר. לחיצה על כל לוח פותחת את קובץ ה־4K המלא.', '1–3 ללא שינוי. 4–9 בגרסת זום־אאוט חדשה, ללא בר. לחיצה פותחת 4K; ״לפני השינוי״ פותח את הגרסה הקודמת להשוואה.');
  writeFileSync(galleryFile, gallery);
  writeFileSync(manifestFile, JSON.stringify({ version: plan.version, status: 'awaiting-parent-art-approval',
    nativeSize: [3840, 2160], route: 'bundled-imagegen-cli-edit', model: plan.model,
    personalRendersThisRevision: 0, hideAuthoringThisRevision: false, gameChanged: false, boards: reviews,
  }, null, 2));
  const pauseFile = 'content/adventures/expansion/review-status.json';
  const pause = JSON.parse(readFileSync(pauseFile, 'utf8'));
  pause.status = 'zoomout-boards-ready-awaiting-parent-approval-before-hides';
  pause.baseArtRevisionAllowed = false;
  writeFileSync(pauseFile, JSON.stringify(pause, null, 2) + '\n');
  console.log(`Published ${reviews.length} 4K proposals for review. All hide and render work is now paused.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
