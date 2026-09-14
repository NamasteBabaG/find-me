/** Publish six denser art proposals for parent review, without changing playable assets. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
async function main() {
  const directory = 'output/imagegen/adventure-density-20260914-v3';
  const manifestFile = 'content/adventures/expansion/density-review.json';
  if (existsSync(manifestFile)) throw Error('Density review already frozen; choose a new revision.');
  const plan = JSON.parse(readFileSync(`${directory}/plan.json`, 'utf8'));
  const boards = plan.boards as { id: string; source: string; sourceSha256: string; output: string; promptFile: string }[];
  const expectedIds = ['paris', 'marrakech', 'tokyo', 'greatwall', 'sydney', 'antarctica'];
  if (JSON.stringify(boards.map(board => board.id)) !== JSON.stringify(expectedIds)) throw Error('Unexpected board scope');
  const galleryFile = 'public/reviews/adventure-expansion-20260914.html';
  let gallery = readFileSync(galleryFile, 'utf8');
  const pauseFile = 'content/adventures/expansion/review-status.json';
  const pause = JSON.parse(readFileSync(pauseFile, 'utf8'));
  if (pause.hideAuthoringAllowed || pause.personalRenderingAllowed || pause.existingThreeBoardGameChanged) throw Error('Hide approval gate must remain closed');
  // Check every input/output and gallery article before creating any public assets.
  for (const board of boards) {
    const metadata = await sharp(board.output).metadata();
    if (metadata.width !== 3840 || metadata.height !== 2160) throw Error(`Unexpected output dimensions: ${board.id}`);
    if (sha256(board.source) !== board.sourceSha256) throw Error(`Source changed: ${board.id}`);
    if (existsSync(`public/scenes/adventure-${board.id}-density-v3`)) throw Error(`Already published: ${board.id}`);
    const marker = `<article id="${board.id}">`;
    const start = gallery.indexOf(marker);
    if (start < 0 || gallery.indexOf('</article>', start) < 0) throw Error(`Article missing: ${board.id}`);
  }
  const originalArticles = ['giza', 'amazon', 'newyork'].map(id => {
    const start = gallery.indexOf(`<article id="${id}">`);
    if (start < 0) throw Error(`Original article missing: ${id}`);
    return gallery.slice(start, gallery.indexOf('</article>', start) + 10);
  });
  const reviews = [];
  for (const board of boards) {
    const publicDirectory = `public/scenes/adventure-${board.id}-density-v3`;
    mkdirSync(publicDirectory, { recursive: true });
    await sharp(board.output).webp({ lossless: true }).toFile(`${publicDirectory}/base.webp`);
    await sharp(board.output).resize(768, 432).webp({ quality: 90 }).toFile(`${publicDirectory}/thumb.webp`);
    const before = `/${board.source.replace(/^public\//, '')}`;
    const after = `/${publicDirectory.replace(/^public\//, '')}/base.webp`;
    const start = gallery.indexOf(`<article id="${board.id}">`);
    const end = gallery.indexOf('</article>', start);
    // Replace the main v2 image/link first, then repoint the old comparison link to v2.
    const article = gallery.slice(start, end)
      .replaceAll(before, after)
      .replace(`/scenes/adventure-${board.id}-v1/base.webp`, before)
      .replace('זום־אאוט חדש — ממתין לאישור שלך', 'יותר דמויות וסיטואציות — ממתין לאישור שלך');
    gallery = gallery.slice(0, start) + article + gallery.slice(end);
    reviews.push({ id: board.id, status: 'awaiting-parent-art-approval', before, after,
      width: 3840, height: 2160, sourceSha256: board.sourceSha256,
      rawOutputSha256: sha256(board.output), sha256: sha256(`${publicDirectory}/base.webp`),
      prompt: readFileSync(board.promptFile, 'utf8'), targetAdditionalPeople: plan.targetAdditionalPeoplePerBoard,
      exactPopulationCountVerified: false, collectibleCoordinatesRequireRemapping: true,
      inheritedCoordinatesAllowed: false, childPlacementAllowed: false,
    });
    console.log(`Packaged ${board.id} at 3840x2160`);
  }
  gallery = gallery.replace('1–3 ללא שינוי. 4–9 בגרסת זום־אאוט חדשה, ללא בר. לחיצה פותחת 4K; ״לפני השינוי״ פותח את הגרסה הקודמת להשוואה.', '1–3 ללא שינוי. ב־4–9 נוספו דמויות וסיטואציות, ללא בר. לחיצה פותחת 4K; ״לפני השינוי״ פותח את גרסת הזום־אאוט הקודמת להשוואה.');
  gallery = gallery.replace('ששת הלוחות הורחקו • אין מחבואים לפני אישור', 'צפיפות מוגברת • אין מחבואים לפני אישור');
  for (const original of originalArticles) if (!gallery.includes(original)) throw Error('An original game-board article changed');
  writeFileSync(galleryFile, gallery);
  writeFileSync(manifestFile, JSON.stringify({ version: plan.version, status: 'awaiting-parent-art-approval',
    nativeSize: [3840, 2160], route: 'bundled-imagegen-cli-edit', model: plan.model,
    quality: plan.quality, requestedCalls: plan.requestedCalls, personalRendersThisRevision: 0,
    hideAuthoringThisRevision: false, gameChanged: false, boards: reviews,
  }, null, 2) + '\n');
  pause.status = 'density-boards-ready-awaiting-parent-approval-before-hides';
  pause.baseArtRevisionAllowed = false;
  writeFileSync(pauseFile, JSON.stringify(pause, null, 2) + '\n');
  console.log('Six proposals published. Art and child/hide rendering paused pending parent approval.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
